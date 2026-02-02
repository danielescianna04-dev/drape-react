import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { ValidationError } from '../middleware/error-handler';
import { workspaceService } from '../services/workspace.service';
import { sessionService } from '../services/session.service';
import { fileService } from '../services/file.service';
import { dockerService } from '../services/docker.service';
import { devServerService } from '../services/dev-server.service';
import { previewService } from '../services/preview.service';
import { projectDetectorService } from '../services/project-detector.service';
import { firebaseService } from '../services/firebase.service';
import { log } from '../utils/logger';

export const flyRouter = Router();

// POST /fly/clone — Quick warmup
flyRouter.post('/clone', asyncHandler(async (req: Request, res: Response) => {
  const { workstationId, projectId, repositoryUrl, githubToken } = req.body;
  const id = projectId || workstationId;
  if (!id) throw new ValidationError('workstationId or projectId required');

  const result = await workspaceService.warmProject(id, repositoryUrl, githubToken);
  const session = await sessionService.get(id);

  res.json({
    success: true,
    machineId: session?.containerId,
    projectInfo: session?.projectInfo,
  });
}));

// ALL /fly/preview/start — Start preview (SSE streaming)
flyRouter.all('/preview/start', asyncHandler(async (req: Request, res: Response) => {
  const { projectId, repositoryUrl, githubToken } = req.method === 'GET' ? req.query : req.body;
  if (!projectId) throw new ValidationError('projectId required');

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await workspaceService.startPreview(
      projectId as string,
      (step, message) => send({ type: 'step', step, message }),
      repositoryUrl as string,
      githubToken as string,
    );

    // Send 'ready' with previewUrl (iOS app expects type:'step' + step:'ready')
    send({
      type: 'step',
      step: 'ready',
      message: 'Preview ready',
      previewUrl: result.previewUrl,
      agentUrl: result.agentUrl,
      machineId: result.containerId,
      projectInfo: result.projectInfo,
    });
  } catch (e: any) {
    send({ type: 'error', step: 'error', message: e.message });
  }

  res.end();
}));

// POST /fly/preview/stop
flyRouter.post('/preview/stop', asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  if (!projectId) throw new ValidationError('projectId required');
  await workspaceService.stopPreview(projectId);
  res.json({ success: true, message: 'Preview stopped' });
}));

// POST /fly/project/create
flyRouter.post('/project/create', asyncHandler(async (req, res) => {
  const { projectId, repositoryUrl, githubToken } = req.body;
  if (!projectId) throw new ValidationError('projectId required');

  await fileService.ensureProjectDir(projectId);

  if (repositoryUrl) {
    await workspaceService.cloneRepository(projectId, repositoryUrl, githubToken);
  }

  const files = await workspaceService.listFiles(projectId);
  res.json({ success: true, projectId, filesCount: files.length, files });
}));

// GET /fly/project/:id/files
flyRouter.get('/project/:id/files', asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  const files = await workspaceService.listFiles(projectId);
  res.json({ success: true, files, count: files.length, timestamp: new Date().toISOString() });
}));

// GET /fly/project/:id/file
flyRouter.get('/project/:id/file', asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  const filePath = req.query.path as string;
  if (!filePath) throw new ValidationError('path required');

  const result = await fileService.readFile(projectId, filePath);
  if (!result.success) return res.status(404).json(result);
  res.json({ success: true, path: result.data!.path, content: result.data!.content });
}));

// POST /fly/project/:id/file
flyRouter.post('/project/:id/file', asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  const { path: filePath, content } = req.body;
  if (!filePath) throw new ValidationError('path required');

  await fileService.writeFile(projectId, filePath, content || '');

  // Notify agent if container running (for hot reload)
  const session = await sessionService.get(projectId);
  if (session?.agentUrl) {
    fileService.notifyAgent(session.agentUrl, filePath, content || '').catch(() => {});
  }

  res.json({ success: true, path: filePath, message: 'File saved' });
}));

// POST /fly/project/:id/exec
flyRouter.post('/project/:id/exec', asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  const { command, cwd } = req.body;
  if (!command) throw new ValidationError('command required');

  const result = await workspaceService.exec(projectId, command, cwd);
  res.json({ success: true, ...result });
}));

// GET /fly/project/:id/env
flyRouter.get('/project/:id/env', asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  const result = await fileService.readFile(projectId, '.env');
  if (!result.success) return res.json({ success: true, variables: [] });

  const variables = (result.data?.content || '').split('\n')
    .filter(line => line.includes('=') && !line.startsWith('#'))
    .map(line => {
      const [key, ...rest] = line.split('=');
      return { key: key.trim(), value: rest.join('=').trim(), isSecret: false };
    });

  res.json({ success: true, variables });
}));

// POST /fly/project/:id/env
flyRouter.post('/project/:id/env', asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  const { variables } = req.body;
  if (!Array.isArray(variables)) throw new ValidationError('variables array required');

  const content = variables.map((v: any) => `${v.key}=${v.value}`).join('\n') + '\n';
  await fileService.writeFile(projectId, '.env', content);
  res.json({ success: true, message: 'Environment variables saved' });
}));

// POST /fly/project/:id/env/analyze
flyRouter.post('/project/:id/env/analyze', asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  // Simplified: scan config files for env var references
  const configFiles = ['next.config.js', 'next.config.mjs', '.env.example', '.env.local'];
  const variables: { key: string; value: string; required: boolean }[] = [];

  for (const file of configFiles) {
    const result = await fileService.readFile(projectId, file);
    if (result.success && result.data) {
      const envRefs = result.data.content.match(/process\.env\.(\w+)/g) || [];
      for (const ref of envRefs) {
        const key = ref.replace('process.env.', '');
        if (!variables.find(v => v.key === key)) {
          variables.push({ key, value: '', required: true });
        }
      }
    }
  }

  res.json({ success: true, variables });
}));

// POST /fly/heartbeat
flyRouter.post('/heartbeat', asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  if (!projectId) throw new ValidationError('projectId required');

  const session = await sessionService.get(projectId);
  if (session) {
    session.lastUsed = Date.now();
    await sessionService.set(projectId, session);
  }
  res.json({ success: true, machineId: session?.containerId, status: session ? 'active' : 'none' });
}));

// POST /fly/release
flyRouter.post('/release', asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  if (!projectId) throw new ValidationError('projectId required');
  await workspaceService.release(projectId);
  res.json({ success: true, message: 'Container released' });
}));

// POST /fly/reload
flyRouter.post('/reload', asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  if (!projectId) throw new ValidationError('projectId required');
  // With NVMe bind mounts, files are already synced — just notify agent
  const session = await sessionService.get(projectId);
  if (session) {
    // Touch project to trigger file watcher
    res.json({ success: true, message: 'Files already synced via NVMe' });
  } else {
    res.json({ success: true, message: 'No active session' });
  }
}));

// GET /fly/status
flyRouter.get('/status', asyncHandler(async (req, res) => {
  const sessions = await sessionService.getAll();
  const health = await dockerService.healthCheck();
  const containers = await dockerService.listContainers();

  res.json({
    backend: 'docker-ts',
    status: health.healthy ? 'healthy' : 'degraded',
    docker: health,
    activeContainers: sessions.length,
    containers: containers.map(c => ({
      id: c.id.substring(0, 12),
      projectId: c.projectId,
      state: c.state,
      serverId: c.serverId,
    })),
  });
}));

// GET /fly/health
flyRouter.get('/health', (req, res) => {
  res.json({ status: 'ok', backend: 'docker-ts', timestamp: new Date().toISOString() });
});

// GET /fly/vms
flyRouter.get('/vms', asyncHandler(async (req, res) => {
  const containers = await dockerService.listContainers();
  res.json({ success: true, vms: containers });
}));

// GET /fly/diagnostics
flyRouter.get('/diagnostics', asyncHandler(async (req, res) => {
  const sessions = await sessionService.getAll();
  const containers = await dockerService.listContainers();
  const health = await dockerService.healthCheck();

  res.json({
    status: health.healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    backend: 'docker-ts',
    sessions: sessions.length,
    runningContainers: containers.filter(c => c.state === 'running').length,
    totalContainers: containers.length,
  });
}));

// POST /fly/error-report
flyRouter.post('/error-report', asyncHandler(async (req, res) => {
  const { projectId, errorMessage, errorStack, deviceInfo } = req.body;
  log.error(`[ErrorReport] ${projectId}: ${errorMessage}`);
  res.json({ success: true, message: 'Error reported' });
}));

// POST /fly/inspect (AI element inspection — placeholder)
flyRouter.post('/inspect', asyncHandler(async (req, res) => {
  // TODO: Implement with agent-loop in Fase 5
  res.json({ success: false, error: 'Not yet implemented in TS backend' });
}));

// GET /fly/logs/:projectId — SSE log stream from container
flyRouter.get('/logs/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const session = await sessionService.get(projectId);
  if (!session) return res.status(404).json({ error: 'No active session' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Proxy the agent's /logs SSE endpoint
  const axios = (await import('axios')).default;
  try {
    const response = await axios.get(`${session.agentUrl}/logs`, {
      responseType: 'stream',
      timeout: 0,
      params: { since: req.query.since },
    });

    response.data.pipe(res);

    req.on('close', () => {
      response.data.destroy();
    });
  } catch (e: any) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
    res.end();
  }
}));

// POST /fly/session
flyRouter.post('/session', asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  if (!projectId) throw new ValidationError('projectId required');
  const session = await sessionService.get(projectId);
  res.json({ success: true, machineId: session?.containerId, message: session ? 'Session active' : 'No session' });
}));

// POST /fly/pool/recycle
flyRouter.post('/pool/recycle', asyncHandler(async (req, res) => {
  // In the new architecture, we just destroy all idle containers
  const sessions = await sessionService.getAll();
  let destroyed = 0;
  for (const s of sessions) {
    const healthy = await devServerService.isRunning(s.agentUrl).catch(() => false);
    if (!healthy) {
      await workspaceService.release(s.projectId).catch(() => {});
      destroyed++;
    }
  }
  res.json({ success: true, destroyed });
}));
