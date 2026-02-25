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
import type { Duplex } from 'stream';

async function main() {
  log.info('Starting Drape Backend v3.0.0 (TypeScript + Docker Native)');

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

  // Create Express app
  const app = createApp();
  const server = http.createServer(app);

  // WebSocket server
  const wss = new WebSocket.Server({ server });

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
        }
      } catch (err: any) {
        log.warn(`[WS] Invalid auth token: ${err?.message || err?.code || err}`);
        ws.close(4001, 'Invalid auth token');
        return;
      }
    } else {
      log.info('[WS] No auth token provided — allowing anonymous connection');
      userId = 'anonymous';
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
      version: '3.0.0',
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
                Cmd: ['/bin/bash'],
                AttachStdin: true,
                AttachStdout: true,
                AttachStderr: true,
                Tty: true,
                Env: ['TERM=xterm-256color'],
                WorkingDir: '/home/coder/project',
              });
              const stream = await exec.start({ hijack: true, stdin: true, Tty: true }) as unknown as Duplex;
              terminalStream = stream;
              terminalExec = exec;

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
