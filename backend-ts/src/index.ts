import http from 'http';
import WebSocket from 'ws';
import { createApp } from './app';
import { config } from './config';
import { log } from './utils/logger';
import { dockerService } from './services/docker.service';
import { containerLifecycleService } from './services/container-lifecycle.service';
import { sessionService } from './services/session.service';
import { fileWatcherService } from './services/file-watcher.service';
import { firebaseService } from './services/firebase.service';
import { githubActivityService } from './services/github-activity.service';
import { reengagementService } from './services/reengagement.service';
import { metricsService } from './services/metrics.service';
import { workspaceService } from './services/workspace.service';
import { startRetentionCleanupJob, stopRetentionCleanupJob } from './jobs/retention-cleanup';
import type { Duplex } from 'stream';

async function main() {
  log.info('Starting Drape Backend v2.2.0 (TypeScript + Docker Native)');

  // Initialize Firebase (auth + metadata only)
  firebaseService.initialize();

  // Initialize Docker network
  await dockerService.initializeNetwork();

  // Adopt existing containers
  await containerLifecycleService.adoptExisting();

  // Start idle reaper
  containerLifecycleService.startIdleReaper();

  // Start background services
  githubActivityService.start();
  reengagementService.start();

  // Start GDPR data retention cleanup job (runs every 24h)
  startRetentionCleanupJob();

  // Create Express app
  const app = createApp();
  const server = http.createServer(app);

  // WebSocket server — noServer mode so we control upgrade routing
  const wss = new WebSocket.Server({ noServer: true });

  wss.on('connection', async (ws: WebSocket, req) => {
    // Extract token from query parameter
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    let userId: string | null = null;

    if (token) {
      try {
        const auth = firebaseService.getAuth();
        if (auth) {
          const decoded = await auth.verifyIdToken(token);
          userId = decoded.uid;
        } else {
          log.warn('[WS] Firebase Auth not available — rejecting connection');
          ws.send(JSON.stringify({ type: 'error', message: 'Authentication service unavailable' }));
          ws.close(4003, 'Authentication service unavailable');
          return;
        }
      } catch (err: any) {
        log.warn(`[WS] Invalid auth token — rejecting connection: ${err.message}`);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired auth token' }));
        ws.close(4001, 'Invalid auth token');
        return;
      }
    } else {
      log.warn('[WS] No auth token provided — rejecting connection');
      ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
      ws.close(4001, 'Authentication required');
      return;
    }

    log.info(`[WS] Client connected (userId: ${userId})`);

    // Track cleanup functions for this connection
    let removeLogListener: (() => void) | null = null;
    const subscribedFileProjects = new Set<string>();

    // Interactive terminal state
    let terminalStream: Duplex | null = null;
    let terminalExec: any = null;

    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to Drape Backend',
      version: '2.2.0',
      architecture: 'docker-ts',
    }));

    ws.on('message', async (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;

          case 'subscribe_files': {
            const { projectId } = msg;
            if (projectId) {
              await fileWatcherService.startWatching(projectId);
              fileWatcherService.registerClient(projectId, ws);
              subscribedFileProjects.add(projectId);
              ws.send(JSON.stringify({ type: 'subscribed_files', projectId }));
            }
            break;
          }

          case 'unsubscribe_files': {
            const { projectId } = msg;
            if (projectId) {
              fileWatcherService.deregisterClient(projectId, ws);
              subscribedFileProjects.delete(projectId);
            }
            ws.send(JSON.stringify({ type: 'unsubscribed_files' }));
            break;
          }

          case 'subscribe_logs': {
            // Remove previous listener if re-subscribing
            if (removeLogListener) {
              removeLogListener();
            }
            const logProjectId = msg.projectId || null;
            removeLogListener = log.addListener((entry) => {
              if (ws.readyState === WebSocket.OPEN) {
                // If projectId was provided, only send logs mentioning that project
                if (logProjectId && entry.message && !entry.message.includes(logProjectId)) {
                  return;
                }
                ws.send(JSON.stringify({ type: 'backend_log', log: entry }));
              }
            });
            ws.send(JSON.stringify({ type: 'subscribed_logs' }));
            break;
          }

          case 'subscribe': {
            const { workstationId } = msg;
            ws.send(JSON.stringify({ type: 'subscribed', workstationId }));
            break;
          }

          case 'chat': {
            // TODO: Wire to agent-loop in Fase 5
            ws.send(JSON.stringify({ type: 'error', message: 'Agent not yet implemented in TS backend' }));
            break;
          }

          case 'terminal_start': {
            const { projectId } = msg;
            const cols = Number.isFinite(Number(msg.cols)) && Number(msg.cols) > 0 ? Number(msg.cols) : 80;
            const rows = Number.isFinite(Number(msg.rows)) && Number(msg.rows) > 0 ? Number(msg.rows) : 24;
            if (!projectId || !userId) {
              ws.send(JSON.stringify({ type: 'terminal_error', message: 'Missing projectId or auth' }));
              break;
            }
            // Clean up previous terminal if any
            if (terminalStream) {
              terminalStream.destroy();
              terminalStream = null;
              terminalExec = null;
            }
            try {
              const session = await workspaceService.getOrCreateContainer(projectId, userId);
              const container = await dockerService.getDockerContainer(session.containerId);
              const exec = await container.exec({
                Cmd: ['/bin/bash', '--noprofile', '--norc', '-i'],
                AttachStdin: true,
                AttachStdout: true,
                AttachStderr: true,
                Tty: true,
                Env: [
                  'TERM=xterm-256color',
                  'PS1=\\u\\$ ',
                  'PROMPT_COMMAND=',
                ],
                WorkingDir: '/home/coder/project',
              });
              const stream = await exec.start({ hijack: true, stdin: true, Tty: true }) as unknown as Duplex;
              terminalStream = stream;
              terminalExec = exec;

              try {
                await exec.resize({ h: rows, w: cols });
              } catch (e: any) {
                log.warn(`[WS] Initial terminal resize error: ${e.message}`);
              }

              stream.on('data', (chunk: Buffer) => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'terminal_output', data: chunk.toString('base64') }));
                }
              });
              stream.on('end', () => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'terminal_exit' }));
                }
                terminalStream = null;
                terminalExec = null;
              });
              ws.send(JSON.stringify({ type: 'terminal_started' }));
              log.info(`[WS] Terminal started for project ${projectId} (user: ${userId})`);
            } catch (e: any) {
              log.error(`[WS] Terminal start failed: ${e.message}`);
              ws.send(JSON.stringify({ type: 'terminal_error', message: e.message }));
            }
            break;
          }

          case 'terminal_input': {
            if (terminalStream && msg.data) {
              try {
                terminalStream.write(Buffer.from(msg.data, 'base64'));
              } catch (e: any) {
                log.warn(`[WS] Terminal input error: ${e.message}`);
              }
            }
            break;
          }

          case 'terminal_resize': {
            if (terminalExec && msg.cols && msg.rows) {
              try {
                await terminalExec.resize({ h: msg.rows, w: msg.cols });
              } catch (e: any) {
                log.warn(`[WS] Terminal resize error: ${e.message}`);
              }
            }
            break;
          }
        }
      } catch (e: any) {
        ws.send(JSON.stringify({ type: 'error', message: e.message }));
      }
    });

    ws.on('close', () => {
      log.info('[WS] Client disconnected');
      // Clean up log listener
      if (removeLogListener) {
        removeLogListener();
        removeLogListener = null;
      }
      // Clean up file watcher subscriptions
      for (const projectId of subscribedFileProjects) {
        fileWatcherService.deregisterClient(projectId, ws);
      }
      subscribedFileProjects.clear();
      // Clean up terminal
      if (terminalStream) {
        terminalStream.destroy();
        terminalStream = null;
        terminalExec = null;
      }
    });
  });

  // WebSocket upgrade router — HMR proxy vs app WS
  server.on('upgrade', async (req, socket, head) => {
    const url = req.url || '';

    // Check if this is an HMR-related WebSocket upgrade
    const isHmrUpgrade =
      url.includes('/_next/') ||
      url.includes('__turbopack') ||
      url.includes('webpack-hmr') ||
      url.includes('@vite') ||
      url.includes('@react-refresh');

    if (!isHmrUpgrade) {
      // Main app WebSocket — delegate to ws library
      wss.handleUpgrade(req, socket as any, head, (ws) => {
        wss.emit('connection', ws, req);
      });
      return;
    }

    try {
      // Resolve project from cookies
      const cookieHeader = req.headers.cookie || '';
      const cookies: Record<string, string> = {};
      cookieHeader.split(';').forEach(c => {
        const [k, ...v] = c.trim().split('=');
        if (k) cookies[k] = decodeURIComponent(v.join('='));
      });

      const projectId = cookies.drape_project_id;
      const previewToken = cookies.drape_preview_token;

      if (!projectId || !previewToken) {
        log.warn(`[HMR WS] No projectId/token for ${url}`);
        socket.destroy();
        return;
      }

      const session = await sessionService.getByProjectIdAndAccessToken(projectId, previewToken);
      if (!session) {
        log.warn(`[HMR WS] No session for project ${projectId}`);
        socket.destroy();
        return;
      }

      const appPort = session.previewPort || session.projectInfo?.port || 3000;
      const targetHost = '127.0.0.1';
      const targetPort = session.previewPort || appPort;

      log.info(`[HMR WS] Proxying ${url} → ${targetHost}:${targetPort} (project: ${projectId})`);

      const net = await import('net');
      const proxySocket = net.connect(targetPort, targetHost, () => {
        // Forward the original HTTP upgrade request
        const reqLine = `${req.method} ${url} HTTP/${req.httpVersion}\r\n`;
        const headers = Object.entries(req.headers)
          .filter(([k]) => k !== 'host')
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join('\r\n');
        proxySocket.write(reqLine + `host: ${targetHost}:${targetPort}\r\n` + headers + '\r\n\r\n');
        if (head.length > 0) proxySocket.write(head);

        // Bi-directional pipe
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
      });

      proxySocket.on('error', (err) => {
        log.warn(`[HMR WS] Proxy error: ${err.message}`);
        socket.destroy();
      });

      socket.on('error', () => proxySocket.destroy());
      socket.on('close', () => proxySocket.destroy());
      proxySocket.on('close', () => socket.destroy());
    } catch (err: any) {
      log.error(`[HMR WS] Error: ${err.message}`);
      socket.destroy();
    }
  });

  // Start listening
  server.listen(config.port, () => {
    log.info(`Server listening on port ${config.port}`);
    log.info(`Environment: ${config.nodeEnv}`);
    log.info(`Projects root: ${config.projectsRoot}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    log.info('Shutting down...');
    containerLifecycleService.stopIdleReaper();
    githubActivityService.stop();
    reengagementService.stop();
    stopRetentionCleanupJob();
    metricsService.cleanup();

    // Notify WS clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'shutdown' }));
      }
    });

    server.close(() => {
      log.info('Server closed');
      process.exit(0);
    });

    setTimeout(() => process.exit(1), 5000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('uncaughtException', (err) => {
    log.error('Uncaught exception:', err.message);
    // Allow log flush then exit — uncaught exceptions leave the process in an undefined state
    setTimeout(() => process.exit(1), 1000);
  });
  process.on('unhandledRejection', (err: any) => {
    log.error('Unhandled rejection:', err?.message || err);
  });
}

main().catch((err) => {
  log.error('Fatal startup error:', err.message);
  process.exit(1);
});
