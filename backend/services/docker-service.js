/**
 * Docker Container Service
 * Hetzner + Docker Architecture - Instant Cloud IDE
 *
 * Replaces Fly.io MicroVM Service with Docker containers on dedicated Hetzner servers.
 * Manages creation, destruction, and communication with workspace containers.
 */

const Docker = require('dockerode');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Default container resource limits
const DEFAULT_CONTAINER_CONFIG = {
    cpus: 4,           // CPU cores per container
    memory_mb: 4096,   // 4GB RAM per container
    agent_port: 13338  // Drape agent port inside container
};

// Docker network name for container communication
const DOCKER_NETWORK = 'drape-net';

// Docker image for workspaces
const WORKSPACE_IMAGE = process.env.DRAPE_WORKSPACE_IMAGE || 'drape-workspace:latest';
const WORKSPACE_IMAGE_FULL = process.env.DRAPE_WORKSPACE_IMAGE_FULL || 'drape-workspace-full:latest';

class DockerService {
    constructor() {
        this._clients = new Map(); // serverId -> Docker instance
        this._servers = [];
        this._initialized = false;
    }

    /**
     * Configure servers from environment
     * Format: DOCKER_SERVERS=host1:port1,host2:port2,host3:port3
     * For local development: DOCKER_SERVERS=local
     */
    _loadServers() {
        if (this._servers.length > 0) return;

        const serversEnv = process.env.DOCKER_SERVERS || 'local';

        if (serversEnv === 'local') {
            // Local Docker (unix socket) - for development
            this._servers = [{
                id: 'local',
                host: null,
                socketPath: '/var/run/docker.sock',
                isLocal: true
            }];
        } else {
            // Remote servers via TCP + TLS
            const tlsDir = process.env.DOCKER_TLS_DIR || '/etc/docker/tls';
            this._servers = serversEnv.split(',').map((entry, i) => {
                const [host, port] = entry.trim().split(':');
                const serverId = `htz-${i + 1}`;
                return {
                    id: serverId,
                    host,
                    port: parseInt(port) || 2376,
                    tlsDir: path.join(tlsDir, serverId),
                    isLocal: false
                };
            });
        }

        console.log(`🐳 [Docker] Configured ${this._servers.length} server(s): ${this._servers.map(s => s.id).join(', ')}`);
    }

    /**
     * Get Docker client for a specific server
     */
    getClient(server) {
        if (!server) {
            this._loadServers();
            server = this._servers[0];
        }

        if (this._clients.has(server.id)) {
            return this._clients.get(server.id);
        }

        let client;
        if (server.isLocal) {
            client = new Docker({ socketPath: server.socketPath || '/var/run/docker.sock' });
        } else {
            const tlsOpts = {};
            let useTls = false;
            try {
                tlsOpts.ca = fs.readFileSync(path.join(server.tlsDir, 'ca.pem'));
                tlsOpts.cert = fs.readFileSync(path.join(server.tlsDir, 'cert.pem'));
                tlsOpts.key = fs.readFileSync(path.join(server.tlsDir, 'key.pem'));
                useTls = true;
            } catch (e) {
                console.warn(`⚠️ [Docker] TLS certs not found for ${server.id}, connecting without TLS`);
            }
            client = new Docker({
                host: server.host,
                port: server.port,
                protocol: useTls ? 'https' : 'http',
                ...tlsOpts
            });
        }

        this._clients.set(server.id, client);
        return client;
    }

    /**
     * Select the best server for a new container (least containers)
     */
    async selectServer() {
        this._loadServers();

        if (this._servers.length === 1) {
            return this._servers[0];
        }

        // Find server with least running containers
        const counts = await Promise.all(
            this._servers.map(async (server) => {
                try {
                    const client = this.getClient(server);
                    const containers = await client.listContainers({
                        filters: { label: ['drape=workspace'] }
                    });
                    return { server, count: containers.length };
                } catch (e) {
                    console.warn(`⚠️ [Docker] Server ${server.id} unreachable: ${e.message}`);
                    return { server, count: Infinity };
                }
            })
        );

        counts.sort((a, b) => a.count - b.count);
        const selected = counts[0];
        console.log(`📊 [Docker] Selected server ${selected.server.id} (${selected.count} containers)`);
        return selected.server;
    }

    /**
     * Initialize Docker network on all servers
     */
    async initializeNetwork() {
        this._loadServers();
        for (const server of this._servers) {
            try {
                const client = this.getClient(server);
                const networks = await client.listNetworks({
                    filters: { name: [DOCKER_NETWORK] }
                });

                if (networks.length === 0) {
                    await client.createNetwork({
                        Name: DOCKER_NETWORK,
                        Driver: 'bridge',
                        Options: {
                            'com.docker.network.bridge.enable_icc': 'true'
                        }
                    });
                    console.log(`✅ [Docker] Created network '${DOCKER_NETWORK}' on ${server.id}`);
                } else {
                    console.log(`✅ [Docker] Network '${DOCKER_NETWORK}' exists on ${server.id}`);
                }
            } catch (e) {
                console.error(`❌ [Docker] Failed to create network on ${server.id}:`, e.message);
            }
        }
        this._initialized = true;
    }

    // Alias for backward compatibility with FlyService
    async initializeApp() {
        return this.initializeNetwork();
    }

    /**
     * Get the appropriate Docker image based on project type
     */
    getImageForProject(projectType) {
        if (projectType === 'nodejs' || projectType === 'nextjs' || projectType === 'react') {
            console.log(`   🐳 [Docker] Using workspace image for ${projectType || 'node'}`);
            return WORKSPACE_IMAGE;
        } else {
            console.log(`   🐳 [Docker] Using full image for ${projectType || 'unknown'}`);
            return WORKSPACE_IMAGE_FULL;
        }
    }

    /**
     * Create a new container for a project
     * @param {string} projectId - Unique project identifier
     * @param {object} options - Container options
     * @returns {object} Container details including ID and agentUrl
     */
    async createContainer(projectId, options = {}) {
        const containerName = `drape-ws-${projectId}`.substring(0, 63).replace(/[^a-zA-Z0-9_.-]/g, '-');
        const server = await this.selectServer();
        const client = this.getClient(server);

        const memoryMb = options.memory_mb || DEFAULT_CONTAINER_CONFIG.memory_mb;
        const cpus = options.cpus || DEFAULT_CONTAINER_CONFIG.cpus;
        const image = options.image || WORKSPACE_IMAGE;
        const agentPort = DEFAULT_CONTAINER_CONFIG.agent_port;

        console.log(`🚀 [Docker] Creating container: ${containerName} on ${server.id}...`);
        console.log(`   📦 Image: ${image}`);
        console.log(`   💾 Memory: ${memoryMb}MB, CPU: ${cpus} cores`);
        const startTime = Date.now();

        try {
            // Build volume binds
            const binds = [
                '/data/pnpm-store:/home/coder/volumes/pnpm-store:ro',
                '/data/cache:/data/cache:rw'
            ];

            // Add any custom mounts from options
            if (options.mounts) {
                for (const mount of options.mounts) {
                    binds.push(`${mount.source}:${mount.destination}:${mount.readOnly ? 'ro' : 'rw'}`);
                }
            }

            const container = await client.createContainer({
                Image: image,
                name: containerName,
                Labels: {
                    'drape': 'workspace',
                    'drape.project': projectId,
                    'drape.server': server.id
                },
                Env: [
                    `PROJECT_ID=${projectId}`,
                    `DRAPE_AGENT_PORT=${agentPort}`,
                    `INFRA_BACKEND=docker`,
                    ...(options.env ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`) : [])
                ],
                ExposedPorts: {
                    [`${agentPort}/tcp`]: {},
                    ['3000/tcp']: {}
                },
                HostConfig: {
                    Memory: memoryMb * 1024 * 1024,
                    NanoCpus: cpus * 1e9,
                    NetworkMode: DOCKER_NETWORK,
                    Binds: binds,
                    RestartPolicy: { Name: 'no' },
                    SecurityOpt: ['no-new-privileges'],
                    Init: true,
                    // Publish agent port and dev server port to random host ports
                    PortBindings: {
                        [`${agentPort}/tcp`]: [{ HostPort: '0' }],  // 0 = random port
                        ['3000/tcp']: [{ HostPort: '0' }]           // 0 = random port
                    }
                },
                // Healthcheck
                Healthcheck: {
                    Test: ['CMD', 'node', '-e',
                        `require('http').get('http://localhost:${agentPort}/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))`
                    ],
                    Interval: 10 * 1e9,  // 10s in nanoseconds
                    Timeout: 3 * 1e9,
                    StartPeriod: 2 * 1e9,
                    Retries: 3
                }
            });

            // Start the container
            await container.start();

            // Get container info including mapped ports
            const info = await container.inspect();
            const containerIp = info.NetworkSettings?.Networks?.[DOCKER_NETWORK]?.IPAddress;

            // Get the host-mapped port for the agent
            const portBindings = info.NetworkSettings?.Ports || {};
            const agentMapping = portBindings[`${agentPort}/tcp`];
            const devServerMapping = portBindings['3000/tcp'];

            const hostAgentPort = agentMapping?.[0]?.HostPort;
            const hostDevPort = devServerMapping?.[0]?.HostPort;

            if (!hostAgentPort) {
                throw new Error('Container started but agent port not mapped to host');
            }

            // Use the server's public IP + mapped port for remote access
            const serverHost = server.host.split(':')[0]; // Extract IP from host:port
            const agentUrl = `http://${serverHost}:${hostAgentPort}`;
            const previewUrl = hostDevPort ? `http://${serverHost}:${hostDevPort}` : null;
            const elapsed = Date.now() - startTime;

            console.log(`✅ [Docker] Container created in ${elapsed}ms`);
            console.log(`   ID: ${container.id.substring(0, 12)}`);
            console.log(`   Internal IP: ${containerIp}`);
            console.log(`   Agent: ${agentUrl} (host port ${hostAgentPort})`);
            if (previewUrl) console.log(`   Preview: ${previewUrl} (host port ${hostDevPort})`);

            return {
                id: container.id,
                machineId: container.id,  // Alias for compatibility with Fly.io code
                name: containerName,
                state: 'started',
                region: server.id,
                privateIp: containerIp,
                createdAt: new Date().toISOString(),
                agentUrl: agentUrl,
                previewUrl: previewUrl,
                hostAgentPort: hostAgentPort,
                hostDevPort: hostDevPort,
                server: server.id
            };
        } catch (error) {
            console.error(`❌ [Docker] Failed to create container:`, error.message);
            throw error;
        }
    }

    // Alias for backward compatibility
    async createMachine(projectId, options = {}) {
        return this.createContainer(projectId, options);
    }

    /**
     * Get container status
     * @param {string} containerId - Docker container ID
     */
    async getContainer(containerId) {
        try {
            const { server, client } = await this._findContainer(containerId);
            const container = client.getContainer(containerId);
            const info = await container.inspect();

            return {
                id: info.Id,
                name: info.Name.replace(/^\//, ''),
                state: this._mapDockerState(info.State.Status),
                region: server.id,
                private_ip: this._getContainerIp(info),
                created_at: info.Created
            };
        } catch (error) {
            if (error.statusCode === 404 || error.reason === 'no such container') {
                return null;
            }
            throw error;
        }
    }

    // Alias
    async getMachine(containerId) {
        return this.getContainer(containerId);
    }

    /**
     * Start a stopped container
     */
    async startContainer(containerId) {
        console.log(`▶️ [Docker] Starting container: ${containerId.substring(0, 12)}`);
        try {
            const { client } = await this._findContainer(containerId);
            const container = client.getContainer(containerId);
            await container.start();
            console.log(`✅ [Docker] Container started`);
        } catch (error) {
            if (error.statusCode === 304) {
                // Already running
                console.log(`✅ [Docker] Container already running`);
                return;
            }
            console.error(`❌ [Docker] Start failed:`, error.message);
            throw error;
        }
    }

    // Alias
    async startMachine(containerId) {
        return this.startContainer(containerId);
    }

    /**
     * Stop a container
     */
    async stopContainer(containerId) {
        console.log(`⏸️ [Docker] Stopping container: ${containerId.substring(0, 12)}`);
        try {
            const { client } = await this._findContainer(containerId);
            const container = client.getContainer(containerId);
            await container.stop({ t: 5 }); // 5s grace period
            console.log(`✅ [Docker] Container stopped`);
        } catch (error) {
            if (error.statusCode === 304) {
                console.log(`✅ [Docker] Container already stopped`);
                return;
            }
            console.error(`❌ [Docker] Stop failed:`, error.message);
            throw error;
        }
    }

    // Alias
    async stopMachine(containerId) {
        return this.stopContainer(containerId);
    }

    /**
     * Destroy a container completely
     */
    async destroyContainer(containerId) {
        console.log(`🗑️ [Docker] Destroying container: ${containerId.substring(0, 12)}`);
        try {
            const { client } = await this._findContainer(containerId);
            const container = client.getContainer(containerId);
            await container.remove({ force: true });
            console.log(`✅ [Docker] Container destroyed`);
        } catch (error) {
            if (error.statusCode === 404 || error.reason === 'no such container') {
                console.log(`⚠️ [Docker] Container already destroyed`);
                return;
            }
            console.error(`❌ [Docker] Destroy failed:`, error.message);
            throw error;
        }
    }

    // Alias
    async destroyMachine(containerId) {
        return this.destroyContainer(containerId);
    }

    /**
     * List all workspace containers across all servers
     */
    async listContainers() {
        this._loadServers();
        const allContainers = [];

        for (const server of this._servers) {
            try {
                const client = this.getClient(server);
                const containers = await client.listContainers({
                    all: true,
                    filters: { label: ['drape=workspace'] }
                });

                for (const c of containers) {
                    // Extract host port mappings for remote access
                    const ports = c.Ports || [];
                    const agentPortMapping = ports.find(p => p.PrivatePort === DEFAULT_CONTAINER_CONFIG.agent_port && p.PublicPort);
                    const devPortMapping = ports.find(p => p.PrivatePort === 3000 && p.PublicPort);
                    const serverHost = server.isLocal ? 'localhost' : server.host;
                    const agentUrl = agentPortMapping ? `http://${serverHost}:${agentPortMapping.PublicPort}` : null;
                    const previewUrl = devPortMapping ? `http://${serverHost}:${devPortMapping.PublicPort}` : null;

                    allContainers.push({
                        id: c.Id,
                        name: (c.Names[0] || '').replace(/^\//, ''),
                        state: this._mapDockerState(c.State),
                        region: server.id,
                        private_ip: this._getContainerIpFromList(c),
                        created_at: new Date(c.Created * 1000).toISOString(),
                        labels: c.Labels,
                        agentUrl,
                        previewUrl
                    });
                }
            } catch (e) {
                console.error(`❌ [Docker] Failed to list containers on ${server.id}:`, e.message);
            }
        }

        return allContainers;
    }

    // Alias
    async listMachines() {
        return this.listContainers();
    }

    /**
     * Wait for container to be ready (agent responding)
     */
    async waitForContainer(containerId, initialTimeout = 10000, maxTimeout = 30000) {
        const startTime = Date.now();

        // First get the container info to find its IP
        while (Date.now() - startTime < maxTimeout) {
            try {
                const info = await this.getContainer(containerId);
                if (!info) {
                    await new Promise(r => setTimeout(r, 500));
                    continue;
                }

                if (info.state === 'started') {
                    const elapsed = Date.now() - startTime;
                    console.log(`✅ [Docker] Container ${containerId.substring(0, 12)} ready in ${elapsed}ms`);
                    return info;
                }

                if (info.state === 'failed' || info.state === 'destroyed') {
                    throw new Error(`Container ${containerId.substring(0, 12)} failed: ${info.state}`);
                }

                await new Promise(r => setTimeout(r, 500));
            } catch (e) {
                if (e.message?.includes('failed:')) throw e;
                await new Promise(r => setTimeout(r, 500));
            }
        }

        throw new Error(`Container ${containerId.substring(0, 12)} not ready after ${maxTimeout / 1000}s`);
    }

    // Alias
    async waitForMachine(containerId, initialTimeout, maxTimeout) {
        return this.waitForContainer(containerId, initialTimeout, maxTimeout);
    }

    /**
     * Execute a command inside a container via the Drape Agent
     * Direct HTTP to container IP — no Fly-Force-Instance-Id header needed
     */
    async exec(agentUrl, command, cwd = '/home/coder/project', containerId = null, timeout = 300000, silent = false) {
        const maxRetries = 3;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await axios.post(`${agentUrl}/exec`, {
                    command,
                    cwd
                }, {
                    timeout,
                    headers: { 'Content-Type': 'application/json' }
                    // No Fly-Force-Instance-Id needed — direct container IP
                });

                return {
                    exitCode: response.data.exitCode || 0,
                    stdout: response.data.stdout || '',
                    stderr: response.data.stderr || ''
                };
            } catch (error) {
                lastError = error;

                const isRetriable = error.response?.status === 502 ||
                    error.response?.status === 503 ||
                    error.response?.status === 504 ||
                    error.code === 'ECONNRESET' ||
                    error.code === 'ECONNREFUSED' ||
                    error.code === 'ETIMEDOUT' ||
                    error.message?.includes('socket hang up');

                if (isRetriable && attempt < maxRetries) {
                    const delay = Math.min(1000 * attempt, 3000);
                    if (!silent) {
                        console.log(`⚠️ [Docker] Exec attempt ${attempt}/${maxRetries} failed (${error.response?.status || error.code || error.message}), retrying in ${delay}ms...`);
                    }
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }

                if (!silent) {
                    console.error(`❌ [Docker] Exec failed after ${attempt} attempts:`, error.message);
                }
                throw error;
            }
        }

        throw lastError || new Error('Exec failed after retries');
    }

    /**
     * Health check - verify Docker daemon connectivity on all servers
     */
    async healthCheck() {
        this._loadServers();
        try {
            for (const server of this._servers) {
                const client = this.getClient(server);
                await client.ping();
            }
            return { healthy: true };
        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }

    /**
     * Ensure only relevant containers are running (not needed for Docker, but kept for compatibility)
     */
    async ensureSingleActiveMachine(keepMachineName = '') {
        // No-op for Docker — each container has its own IP, no routing conflicts
        console.log(`🐳 [Docker] ensureSingleActiveMachine is a no-op (direct container addressing)`);
    }

    /**
     * Not needed for Docker (apps don't suspend)
     */
    async ensureAppNotSuspended() {
        return true;
    }

    // ============ INTERNAL HELPERS ============

    /**
     * Find which server hosts a container
     */
    async _findContainer(containerId) {
        this._loadServers();

        for (const server of this._servers) {
            try {
                const client = this.getClient(server);
                const container = client.getContainer(containerId);
                await container.inspect(); // Will throw if not found
                return { server, client };
            } catch (e) {
                if (e.statusCode === 404 || e.reason === 'no such container') continue;
                // For other errors, try next server
                continue;
            }
        }

        // Default to first server (let it throw proper 404)
        return { server: this._servers[0], client: this.getClient(this._servers[0]) };
    }

    /**
     * Map Docker container states to our standard states
     */
    _mapDockerState(dockerState) {
        const stateMap = {
            'running': 'started',
            'created': 'created',
            'restarting': 'starting',
            'paused': 'stopped',
            'exited': 'stopped',
            'dead': 'failed',
            'removing': 'destroying'
        };
        return stateMap[dockerState] || dockerState;
    }

    /**
     * Get container IP from inspect result
     */
    _getContainerIp(info) {
        const networks = info.NetworkSettings?.Networks || {};
        if (networks[DOCKER_NETWORK]) {
            return networks[DOCKER_NETWORK].IPAddress;
        }
        // Fallback to first available network
        const firstNet = Object.values(networks)[0];
        return firstNet?.IPAddress || null;
    }

    /**
     * Get container IP from list result
     */
    _getContainerIpFromList(containerListEntry) {
        const networks = containerListEntry.NetworkSettings?.Networks || {};
        if (networks[DOCKER_NETWORK]) {
            return networks[DOCKER_NETWORK].IPAddress;
        }
        const firstNet = Object.values(networks)[0];
        return firstNet?.IPAddress || null;
    }
}

// Export singleton instance
module.exports = new DockerService();
