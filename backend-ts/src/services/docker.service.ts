import Docker from 'dockerode';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { log } from '../utils/logger';
import { ContainerInfo, CreateContainerOptions, DockerServer } from '../types';
import { AGENT_PORT, DOCKER_LABELS } from '../utils/constants';
import { sleep } from '../utils/helpers';

const DOCKER_NETWORK = 'drape-net';

interface ServerConfig {
  id: string;
  host: string;
  port: number;
  socketPath?: string;
  tlsDir?: string;
  isLocal: boolean;
}

class DockerService {
  private clients = new Map<string, Docker>();
  private servers: ServerConfig[] = [];

  private loadServers(): void {
    if (this.servers.length > 0) return;

    const serversEnv = config.dockerServers;

    if (serversEnv === 'local') {
      this.servers = [{
        id: 'local',
        host: 'localhost',
        port: 0,
        socketPath: '/var/run/docker.sock',
        isLocal: true,
      }];
    } else {
      this.servers = serversEnv.split(',').map((entry, i) => {
        const parts = entry.trim().split(':');
        const host = parts[0];
        const port = parseInt(parts[1]) || 2376;
        const serverId = `htz-${i + 1}`;
        return {
          id: serverId,
          host,
          port,
          tlsDir: path.join(config.dockerTlsDir, serverId),
          isLocal: false,
        };
      });
    }

    log.info(`[Docker] Configured ${this.servers.length} server(s): ${this.servers.map(s => s.id).join(', ')}`);
  }

  getClient(server?: ServerConfig): Docker {
    if (!server) {
      this.loadServers();
      server = this.servers[0];
    }

    const cached = this.clients.get(server.id);
    if (cached) return cached;

    let client: Docker;
    if (server.isLocal) {
      client = new Docker({ socketPath: server.socketPath || '/var/run/docker.sock' });
    } else {
      const tlsOpts: Record<string, Buffer> = {};
      let useTls = false;
      try {
        if (server.tlsDir) {
          tlsOpts.ca = fs.readFileSync(path.join(server.tlsDir, 'ca.pem'));
          tlsOpts.cert = fs.readFileSync(path.join(server.tlsDir, 'cert.pem'));
          tlsOpts.key = fs.readFileSync(path.join(server.tlsDir, 'key.pem'));
          useTls = true;
        }
      } catch {
        log.warn(`[Docker] TLS certs not found for ${server.id}, connecting without TLS`);
      }
      client = new Docker({
        host: server.host,
        port: server.port,
        protocol: useTls ? 'https' : 'http',
        ...tlsOpts,
      });
    }

    this.clients.set(server.id, client);
    return client;
  }

  async selectServer(): Promise<ServerConfig> {
    this.loadServers();
    if (this.servers.length === 1) return this.servers[0];

    const counts = await Promise.all(
      this.servers.map(async (server) => {
        try {
          const client = this.getClient(server);
          const containers = await client.listContainers({
            filters: { label: ['drape=workspace'] },
          });
          return { server, count: containers.length };
        } catch {
          return { server, count: Infinity };
        }
      })
    );

    counts.sort((a, b) => a.count - b.count);
    log.info(`[Docker] Selected server ${counts[0].server.id} (${counts[0].count} containers)`);
    return counts[0].server;
  }

  async initializeNetwork(): Promise<void> {
    this.loadServers();
    for (const server of this.servers) {
      try {
        const client = this.getClient(server);
        const networks = await client.listNetworks({ filters: { name: [DOCKER_NETWORK] } });
        if (networks.length === 0) {
          await client.createNetwork({
            Name: DOCKER_NETWORK,
            Driver: 'bridge',
            Options: { 'com.docker.network.bridge.enable_icc': 'false' },
          });
          log.info(`[Docker] Created network '${DOCKER_NETWORK}' on ${server.id}`);
        } else {
          log.info(`[Docker] Network '${DOCKER_NETWORK}' exists on ${server.id}`);
        }
      } catch (e: any) {
        log.error(`[Docker] Failed to create network on ${server.id}: ${e.message}`);
      }
    }
  }

  async createContainer(options: CreateContainerOptions): Promise<ContainerInfo> {
    const { projectId, memoryMb = config.containerMemoryMb, cpus = config.containerCpus, image = config.workspaceImage } = options;
    const containerName = `drape-ws-${projectId}`.substring(0, 63).replace(/[^a-zA-Z0-9_.-]/g, '-');
    const server = await this.selectServer();
    const client = this.getClient(server);
    const startTime = Date.now();

    log.info(`[Docker] Creating container: ${containerName} on ${server.id}...`);

    // Bind mounts — the key architectural change: NVMe direct
    const nextCacheDir = `${config.cacheRoot}/next-build/${projectId}`;
    const binds = [
      `${config.projectsRoot}/${projectId}:/home/coder/project:rw`,
      `${config.pnpmStorePath}:/home/coder/volumes/pnpm-store:ro`,
      `${config.cacheRoot}:/data/cache:rw`,
      `${nextCacheDir}:/home/coder/project/.next:rw`,
      // Flutter SDK mounted from host; rw needed for engine stamp files
      '/opt/flutter:/opt/flutter:ro',
    ];

    // Remove existing container with same name (409 conflict)
    try {
      const existing = client.getContainer(containerName);
      await existing.stop().catch(() => {});
      await existing.remove({ force: true });
      log.info(`[Docker] Removed existing container: ${containerName}`);
    } catch {
      // No existing container — fine
    }

    const container = await client.createContainer({
      Image: image,
      name: containerName,
      User: '1000:1000', // Run as non-root 'coder' user
      Labels: {
        [DOCKER_LABELS.managed]: 'true',
        [DOCKER_LABELS.project]: projectId,
        'drape': 'workspace',
        'drape.server': server.id,
      },
      Env: [
        `PROJECT_ID=${projectId}`,
        `DRAPE_AGENT_PORT=${AGENT_PORT}`,
        `INFRA_BACKEND=docker`,
        // Flutter/Dart SDK on PATH; PUB_CACHE writable inside container
        `PATH=/opt/flutter/bin:/opt/flutter/bin/cache/dart-sdk/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
        `PUB_CACHE=/home/node/.pub-cache`,
        `FLUTTER_ROOT=/opt/flutter`,
        // Git safe.directory for Flutter SDK mounted with different ownership
        `GIT_CONFIG_COUNT=1`,
        `GIT_CONFIG_KEY_0=safe.directory`,
        `GIT_CONFIG_VALUE_0=/opt/flutter`,
        // API keys for OpenCode AI agent (multi-provider)
        `ANTHROPIC_API_KEY=${config.anthropicApiKey || ''}`,
        `GOOGLE_GENERATIVE_AI_API_KEY=${config.geminiApiKey || ''}`,
        `OPENAI_API_KEY=${config.openaiApiKey || ''}`,
        `GROQ_API_KEY=${config.groqApiKey || ''}`,
      ],
      ExposedPorts: {
        [`${AGENT_PORT}/tcp`]: {},
        ['3000/tcp']: {},
        ['4096/tcp']: {}, // OpenCode serve
      },
      HostConfig: {
        Memory: memoryMb * 1024 * 1024,
        NanoCpus: cpus * 1e9,
        NetworkMode: DOCKER_NETWORK,
        Binds: binds,
        RestartPolicy: { Name: '' as any },
        SecurityOpt: ['no-new-privileges'],
        Init: true,
        PortBindings: {
          [`${AGENT_PORT}/tcp`]: [{ HostPort: '0' }],
          ['3000/tcp']: [{ HostPort: '0' }],
        },
        // Security hardening: drop all capabilities, add back only essentials
        CapDrop: ['ALL'],
        CapAdd: ['CHOWN', 'NET_BIND_SERVICE'],
        // Block cloud metadata endpoints (AWS/GCP instance metadata)
        ExtraHosts: ['metadata.google.internal:127.0.0.1', '169.254.169.254:127.0.0.1'],
        // Tmpfs mount for /tmp — explicitly exec (Docker defaults to noexec).
        // noexec causes SIGBUS in forked Node.js child processes (e.g. Next.js
        // start-server.js) because V8/SWC need to mmap executable pages from /tmp.
        Tmpfs: { '/tmp': 'rw,exec,nosuid,size=512m' },
        // Prevent fork bombs
        PidsLimit: 512,
      },
      Healthcheck: {
        Test: ['CMD', 'node', '-e',
          `require('http').get('http://localhost:${AGENT_PORT}/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))`],
        Interval: 10e9,
        Timeout: 3e9,
        StartPeriod: 2e9,
        Retries: 3,
      },
    });

    await container.start();
    const info = await container.inspect();

    const portBindings = info.NetworkSettings?.Ports || {};
    const devServerMapping = portBindings['3000/tcp'];
    const hostDevPort = devServerMapping?.[0]?.HostPort;
    const agentMapping = portBindings[`${AGENT_PORT}/tcp`];
    const hostAgentPort = agentMapping?.[0]?.HostPort;
    const hostAgentAddress = server.isLocal ? '127.0.0.1' : server.host;

    // Prefer host-published agent port (more robust than bridge IP routing on busy hosts).
    let agentUrl = hostAgentPort ? `http://${hostAgentAddress}:${hostAgentPort}` : '';
    if (!agentUrl) {
      const containerIP = info.NetworkSettings?.Networks?.[DOCKER_NETWORK]?.IPAddress;
      if (!containerIP) throw new Error('Container started but no agent host port and no network IP');
      agentUrl = `http://${containerIP}:${AGENT_PORT}`;
    }
    const elapsed = Date.now() - startTime;

    log.info(`[Docker] Container created in ${elapsed}ms — ${container.id.substring(0, 12)} agent=${agentUrl}`);

    return {
      id: container.id,
      projectId,
      agentUrl,
      previewPort: hostDevPort ? parseInt(hostDevPort) : null,
      serverId: server.id,
      state: 'running',
      image,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };
  }

  async destroyContainer(containerId: string, serverId?: string): Promise<void> {
    log.info(`[Docker] Destroying container: ${containerId.substring(0, 12)}`);
    try {
      const { client } = await this.findContainer(containerId);
      const container = client.getContainer(containerId);
      await container.remove({ force: true });
    } catch (e: any) {
      if (e.statusCode === 404) return;
      throw e;
    }
  }

  async getContainer(containerId: string): Promise<ContainerInfo | null> {
    try {
      const { server, client } = await this.findContainer(containerId);
      const container = client.getContainer(containerId);
      const info = await container.inspect();
      const portBindings = info.NetworkSettings?.Ports || {};
      const devMapping = portBindings['3000/tcp'];
      const hostDevPort = devMapping?.[0]?.HostPort;
      const agentMapping = portBindings[`${AGENT_PORT}/tcp`];
      const hostAgentPort = agentMapping?.[0]?.HostPort;
      const hostAgentAddress = server.isLocal ? '127.0.0.1' : server.host;
      const containerIP = info.NetworkSettings?.Networks?.[DOCKER_NETWORK]?.IPAddress || '';
      const agentUrl = hostAgentPort
        ? `http://${hostAgentAddress}:${hostAgentPort}`
        : (containerIP ? `http://${containerIP}:${AGENT_PORT}` : '');

      return {
        id: info.Id,
        projectId: info.Config?.Labels?.[DOCKER_LABELS.project] || '',
        agentUrl,
        previewPort: hostDevPort ? parseInt(hostDevPort) : null,
        serverId: server.id,
        state: this.mapState(info.State.Status),
        image: info.Config?.Image || '',
        createdAt: new Date(info.Created).getTime(),
        lastUsed: Date.now(),
      };
    } catch (e: any) {
      if (e.statusCode === 404) return null;
      throw e;
    }
  }

  async listContainers(): Promise<ContainerInfo[]> {
    this.loadServers();
    const all: ContainerInfo[] = [];

    for (const server of this.servers) {
      try {
        const client = this.getClient(server);
        const containers = await client.listContainers({
          all: true,
          filters: { label: ['drape=workspace'] },
        });

        for (const c of containers) {
          const ports = c.Ports || [];
          const devPort = ports.find(p => p.PrivatePort === 3000 && p.PublicPort);
          const agentPort = ports.find(p => p.PrivatePort === AGENT_PORT && p.PublicPort);
          const hostAgentAddress = server.isLocal ? '127.0.0.1' : server.host;

          // Fallback to container IP when published agent port is unavailable
          let containerIP = '';
          try {
            const containerObj = client.getContainer(c.Id);
            const inspectInfo = await containerObj.inspect();
            containerIP = inspectInfo.NetworkSettings?.Networks?.[DOCKER_NETWORK]?.IPAddress || '';
          } catch { /* ignore */ }

          const agentUrl = agentPort?.PublicPort
            ? `http://${hostAgentAddress}:${agentPort.PublicPort}`
            : (containerIP ? `http://${containerIP}:${AGENT_PORT}` : '');

          all.push({
            id: c.Id,
            projectId: c.Labels?.[DOCKER_LABELS.project] || '',
            agentUrl,
            previewPort: devPort?.PublicPort || null,
            serverId: server.id,
            state: this.mapState(c.State),
            image: c.Image,
            createdAt: c.Created * 1000,
            lastUsed: Date.now(),
          });
        }
      } catch (e: any) {
        log.error(`[Docker] Failed to list on ${server.id}: ${e.message}`);
      }
    }

    return all;
  }

  /**
   * Execute a command inside container via drape-agent HTTP
   */
  async exec(
    agentUrl: string,
    command: string,
    cwd = '/home/coder/project',
    timeout = 300000,
    silent = false,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const maxRetries = 6;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(`${agentUrl}/exec`, { command, cwd, timeout }, {
          timeout,
          headers: { 'Content-Type': 'application/json' },
        });
        return {
          exitCode: response.data.exitCode || 0,
          stdout: response.data.stdout || '',
          stderr: response.data.stderr || '',
        };
      } catch (err: any) {
        lastError = err;
        const status = err.response?.status;
        const isRetriable = [502, 503, 504].includes(status) ||
          ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'EAI_AGAIN'].includes(err.code) ||
          err.message?.includes('socket hang up');

        if (isRetriable && attempt < maxRetries) {
          const delay = Math.min(2000 * attempt, 8000);
          if (!silent) log.warn(`[Docker] Exec attempt ${attempt}/${maxRetries} failed, retry in ${delay}ms`);
          await sleep(delay);
          continue;
        }
        if (!silent) log.error(`[Docker] Exec failed after ${attempt} attempts: ${err.message}`);
        throw err;
      }
    }
    throw lastError || new Error('Exec failed');
  }

  /**
   * Execute a command in true detached mode directly via Docker exec.
   * This avoids agent-side process lifecycle coupling for long-running commands.
   */
  async execDetached(
    containerId: string,
    command: string,
    cwd = '/home/coder/project',
    silent = false,
  ): Promise<void> {
    try {
      const { client } = await this.findContainer(containerId);
      const container = client.getContainer(containerId);
      const exec = await container.exec({
        AttachStdout: false,
        AttachStderr: false,
        AttachStdin: false,
        Tty: false,
        WorkingDir: cwd,
        Cmd: ['bash', '-lc', command],
        User: '1000:1000',
      });

      await new Promise<void>((resolve, reject) => {
        exec.start({ Detach: true, Tty: false }, (err: any) => {
          if (err) return reject(err);
          resolve();
        });
      });
    } catch (err: any) {
      if (!silent) log.error(`[Docker] Detached exec failed: ${err.message}`);
      throw err;
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    this.loadServers();
    try {
      for (const server of this.servers) {
        await this.getClient(server).ping();
      }
      return { healthy: true };
    } catch (e: any) {
      return { healthy: false, error: e.message };
    }
  }

  async waitForAgent(agentUrl: string, timeoutMs = 15000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await axios.get(`${agentUrl}/health`, { timeout: 2000 });
        if (res.status === 200) return true;
      } catch { /* retry */ }
      await sleep(500);
    }
    return false;
  }

  /**
   * Get a dockerode Container object for interactive exec (PTY terminal).
   */
  async getDockerContainer(containerId: string): Promise<Docker.Container> {
    const { client } = await this.findContainer(containerId);
    return client.getContainer(containerId);
  }

  // --- Internal helpers ---

  private async findContainer(containerId: string): Promise<{ server: ServerConfig; client: Docker }> {
    this.loadServers();
    for (const server of this.servers) {
      try {
        const client = this.getClient(server);
        await client.getContainer(containerId).inspect();
        return { server, client };
      } catch { continue; }
    }
    return { server: this.servers[0], client: this.getClient(this.servers[0]) };
  }

  private mapState(dockerState: string): ContainerInfo['state'] {
    const map: Record<string, ContainerInfo['state']> = {
      running: 'running',
      created: 'creating',
      restarting: 'creating',
      paused: 'stopped',
      exited: 'stopped',
      dead: 'error',
      removing: 'stopping',
    };
    return map[dockerState] || 'error';
  }

  private getContainerIp(info: any): string | null {
    const networks = info.NetworkSettings?.Networks || {};
    return networks[DOCKER_NETWORK]?.IPAddress || (Object.values(networks)[0] as any)?.IPAddress || null;
  }
}

export const dockerService = new DockerService();
