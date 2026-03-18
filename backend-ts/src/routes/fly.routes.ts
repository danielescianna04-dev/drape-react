import { Router, Request, Response } from 'express';
import * as path from 'path';
import { promises as fs } from 'fs';
import { asyncHandler } from '../middleware/async-handler';
import { ValidationError } from '../middleware/error-handler';
import { verifyProjectOwnership, getUserPlan, getPlanProjectLimits, countUserProjects, getUserStorageMb, getLifetimeCreationCounts, incrementCreationCounter } from '../middleware/auth';
import { workspaceService } from '../services/workspace.service';
import { sessionService } from '../services/session.service';
import { fileService } from '../services/file.service';
import { dockerService } from '../services/docker.service';
import { devServerService } from '../services/dev-server.service';
import { projectDetectorService } from '../services/project-detector.service';
import { firebaseService } from '../services/firebase.service';
import { log } from '../utils/logger';
import { config } from '../config';
import { execShell, validateProjectId } from '../utils/helpers';
import { auditService } from '../services/audit.service';

export const flyRouter = Router();

// POST /fly/clone — Quick warmup
flyRouter.post('/clone', asyncHandler(async (req: Request, res: Response) => {
  const { workstationId, projectId, repositoryUrl, githubToken, branch } = req.body;
  const id = projectId || workstationId;
  const uid = req.userId || 'anonymous';
  if (!id) throw new ValidationError('workstationId or projectId required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, id);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${id} without ownership (clone)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  // Enforce clone + storage limits using lifetime creation counts
  if (uid !== 'anonymous' && repositoryUrl) {
    const planId = await getUserPlan(uid);
    const limits = getPlanProjectLimits(planId);
    const lifetimeCounts = await getLifetimeCreationCounts(uid);
    if (lifetimeCounts.cloned >= limits.maxCloned) {
      return res.status(403).json({
        success: false,
        error: 'CLONE_LIMIT_EXCEEDED',
        limits: { maxCloned: limits.maxCloned, current: lifetimeCounts.cloned },
        message: `Hai raggiunto il limite di ${limits.maxCloned} repository clonati per il piano ${planId}`,
      });
    }
    const storageMb = await getUserStorageMb(uid);
    if (storageMb >= limits.maxStorageMb) {
      return res.status(403).json({
        success: false,
        error: 'STORAGE_LIMIT_EXCEEDED',
        limits: { maxStorageMb: limits.maxStorageMb, usedMb: storageMb },
        message: `Hai raggiunto il limite di ${limits.maxStorageMb}MB di storage per il piano ${planId}`,
      });
    }
  }

  const result = await workspaceService.warmProject(id, uid, repositoryUrl, githubToken, branch);
  const session = await sessionService.get(id, uid);

  res.json({
    success: true,
    machineId: session?.containerId,
    previewToken: session?.accessToken,
    projectInfo: session?.projectInfo,
  });
}));

// POST /fly/preview/start — Start preview (SSE streaming)
flyRouter.post('/preview/start', asyncHandler(async (req: Request, res: Response) => {
  const { projectId, repositoryUrl, githubToken } = req.body;
  const uid = req.userId || 'anonymous';
  if (!projectId) throw new ValidationError('projectId required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (preview/start)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  // Enforce preview limit per project (free: 5, go: 20, pro: 75, team: 300)
  const previewLimits: Record<string, number> = { free: 5, go: 20, pro: 75, team: 300 };
  const userPlan = await getUserPlan(uid);
  const maxPreviews = previewLimits[userPlan] || previewLimits.free;
  const fbDb = firebaseService.getFirestore();
  if (fbDb) {
    const projectRef = fbDb.collection('user_projects').doc(projectId as string);
    const projectDoc = await projectRef.get();
    const currentCount = projectDoc.exists ? (projectDoc.data()?.previewCount || 0) : 0;
    log.info(`[Fly] Preview count for ${projectId}: ${currentCount}/${maxPreviews} (plan: ${userPlan})`);
    if (currentCount >= maxPreviews) {
      log.warn(`[Fly] Preview limit reached for project ${projectId}: ${currentCount}/${maxPreviews}`);
      return res.status(403).json({
        error: 'PREVIEW_LIMIT_EXCEEDED',
        message: `Hai raggiunto il limite di ${maxPreviews} preview per questo progetto.`,
        limits: { current: currentCount, max: maxPreviews },
      });
    }
    // Increment — use set with merge to handle both existing and new docs
    await projectRef.set({ previewCount: currentCount + 1 }, { merge: true });
    log.info(`[Fly] Preview count incremented to ${currentCount + 1} for ${projectId}`);
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }
  };

  try {
    const result = await workspaceService.startPreview(
      projectId as string,
      uid,
      (step, message) => send({ type: 'step', step, message }),
      repositoryUrl as string,
      githubToken as string,
      (line) => send({ type: 'log', text: line }),
    );

    // Send 'ready' with previewUrl (iOS app expects type:'step' + step:'ready')
    send({
      type: 'step',
      step: 'ready',
      message: 'Preview ready',
      previewUrl: result.previewUrl,
      agentUrl: result.agentUrl,
      machineId: result.containerId,
      previewToken: result.previewToken,
      projectInfo: result.projectInfo,
      hasWebUI: result.hasWebUI,
    });
  } catch (e: any) {
    log.error('[Fly] Preview start error:', e);
    send({ type: 'error', step: 'error', message: e.message || 'Failed to start preview' });
  }

  res.end();
}));

// POST /fly/preview/stop
flyRouter.post('/preview/stop', asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  const uid = req.userId || 'anonymous';
  if (!projectId) throw new ValidationError('projectId required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (preview/stop)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  await workspaceService.stopPreview(projectId, uid);
  res.json({ success: true, message: 'Preview stopped' });
}));

// POST /fly/project/create
flyRouter.post('/project/create', asyncHandler(async (req, res) => {
  const { projectId, repositoryUrl, githubToken, source, branch } = req.body;
  const uid = req.userId || 'anonymous';
  if (!projectId) throw new ValidationError('projectId required');

  // Enforce project limits using lifetime creation counts (never reset on delete)
  if (uid !== 'anonymous') {
    const planId = await getUserPlan(uid);
    const limits = getPlanProjectLimits(planId);
    const lifetimeCounts = await getLifetimeCreationCounts(uid);
    const isLocal = source === 'local';
    const isClone = !!repositoryUrl;

    if (isLocal && lifetimeCounts.local >= limits.maxLocal) {
      return res.status(403).json({
        success: false,
        error: 'LOCAL_LIMIT_EXCEEDED',
        limits: { maxLocal: limits.maxLocal, current: lifetimeCounts.local },
        message: `Hai raggiunto il limite di ${limits.maxLocal} progetti locali per il piano ${planId}`,
      });
    }
    if (isClone && lifetimeCounts.cloned >= limits.maxCloned) {
      return res.status(403).json({
        success: false,
        error: 'CLONE_LIMIT_EXCEEDED',
        limits: { maxCloned: limits.maxCloned, current: lifetimeCounts.cloned },
        message: `Hai raggiunto il limite di ${limits.maxCloned} repository clonati per il piano ${planId}`,
      });
    }
    const storageMb = await getUserStorageMb(uid);
    if (storageMb >= limits.maxStorageMb) {
      return res.status(403).json({
        success: false,
        error: 'STORAGE_LIMIT_EXCEEDED',
        limits: { maxStorageMb: limits.maxStorageMb, usedMb: storageMb },
        message: `Hai raggiunto il limite di ${limits.maxStorageMb}MB di storage per il piano ${planId}`,
      });
    }
  }

  await fileService.ensureProjectDir(projectId);

  if (repositoryUrl) {
    const cloneResult = await workspaceService.cloneRepository(projectId, repositoryUrl, githubToken, branch);
    if (!cloneResult.success) {
      // Clean up empty project directory
      await fileService.deleteProject(projectId).catch(() => {});
      return res.status(400).json({
        success: false,
        error: 'CLONE_FAILED',
        message: cloneResult.error || 'Failed to clone repository',
      });
    }
  }

  const files = await workspaceService.listFiles(projectId);

  // Validate that clone produced files — don't create empty projects
  if (repositoryUrl && files.length === 0) {
    await fileService.deleteProject(projectId).catch(() => {});
    return res.status(400).json({
      success: false,
      error: 'NO_FILES',
      message: 'No files found after cloning. The repository may be empty or the URL may be invalid.',
    });
  }

  // Increment lifetime creation counter only after successful clone
  const createType = source === 'local' ? 'local' : repositoryUrl ? 'cloned' : 'created';
  incrementCreationCounter(uid, createType).catch(() => {});

  auditService.log({ userId: uid, action: 'project_create', resource: projectId, details: `type: ${createType}`, ip: req.ip });
  res.json({ success: true, projectId, filesCount: files.length, files });
}));

// GET /fly/project/:id/files
flyRouter.get('/project/:id/files', asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const uid = req.userId || 'anonymous';

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (list-files)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const files = await workspaceService.listFiles(projectId);
  log.info(`[Files] Listed ${files.length} files for project ${projectId} (user ${uid})`);
  res.json({ success: true, files, count: files.length, timestamp: new Date().toISOString() });
}));

// GET /fly/preview/context/:projectId — lightweight project context for AI helper flows
flyRouter.get('/preview/context/:projectId', asyncHandler(async (req, res) => {
  const projectId = req.params.projectId;
  validateProjectId(projectId);
  const uid = req.userId || 'anonymous';

  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (preview/context)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const filesResult = await fileService.listAllFiles(projectId);
  const files = (filesResult.data || []).map(f => f.path).slice(0, 500);

  const keyFiles = [
    'package.json',
    'next.config.js',
    'next.config.mjs',
    'vite.config.ts',
    'vite.config.js',
    'tsconfig.json',
    '.env.example',
    'README.md',
  ];

  const interestingSourceFiles = files.filter(f =>
    /\.(tsx?|jsx?|py|go|rb|php|vue|svelte|mdx?)$/i.test(f)
    && !f.includes('node_modules/')
  ).slice(0, 12);

  const toRead = [...new Set([...keyFiles, ...interestingSourceFiles])];
  const contents: Record<string, string> = {};

  for (const filePath of toRead) {
    const read = await fileService.readFile(projectId, filePath);
    if (read.success && read.data && !read.data.isBinary) {
      contents[filePath] = read.data.content.slice(0, 12000);
    }
  }

  res.json({ success: true, projectContext: { files, contents } });
}));

// GET /fly/project/:id/file
flyRouter.get('/project/:id/file', asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const uid = req.userId || 'anonymous';
  const filePath = req.query.path as string;
  if (!filePath) throw new ValidationError('path required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (read-file)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const result = await fileService.readFile(projectId, filePath);
  if (!result.success) return res.status(404).json(result);
  res.json({ success: true, path: result.data!.path, content: result.data!.content });
}));

// POST /fly/project/:id/file
flyRouter.post('/project/:id/file', asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const uid = req.userId || 'anonymous';
  const { path: filePath, content } = req.body;
  if (!filePath) throw new ValidationError('path required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (write-file)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  await fileService.writeFile(projectId, filePath, content || '');

  // Notify agent if container running
  const session = await sessionService.get(projectId, uid);
  if (session?.agentUrl) {
    fileService.notifyAgent(session.agentUrl, filePath, content || '').catch(() => {});
  }

  res.json({ success: true, path: filePath, message: 'File saved' });
}));

// POST /fly/project/:id/folder — Create folder
flyRouter.post('/project/:id/folder', asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const uid = req.userId || 'anonymous';
  const { path: folderPath } = req.body;
  if (!folderPath) throw new ValidationError('path required');

  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (create-folder)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const result = await fileService.createFolder(projectId, folderPath);
  res.json(result);
}));

// POST /fly/project/:id/move — Move/rename file or folder
flyRouter.post('/project/:id/move', asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const uid = req.userId || 'anonymous';
  const { from, to } = req.body;
  if (!from || !to) throw new ValidationError('from and to paths required');

  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (move-file)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const result = await fileService.moveFile(projectId, from, to);
  res.json(result);
}));

// POST /fly/project/:id/upload-files (bulk upload)
flyRouter.post('/project/:id/upload-files', asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const uid = req.userId || 'anonymous';
  const { files } = req.body;
  if (!files || !Array.isArray(files)) throw new ValidationError('files array required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (upload-files)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  await fileService.ensureProjectDir(projectId);

  let uploaded = 0;
  for (const file of files) {
    if (file.path && file.content !== undefined) {
      await fileService.writeFile(projectId, file.path, file.content);
      uploaded++;
    }
  }

  res.json({ success: true, filesCount: uploaded });
}));

// POST /fly/project/:id/exec
flyRouter.post('/project/:id/exec', asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const { command, cwd } = req.body;
  const uid = req.userId || 'anonymous';
  if (!command) throw new ValidationError('command required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (exec)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const result = await workspaceService.exec(projectId, uid, command, cwd);
  res.json({ success: true, ...result });
}));

// GET /fly/project/:id/env
flyRouter.get('/project/:id/env', asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const uid = req.userId || 'anonymous';

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (env read)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

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
  validateProjectId(projectId);
  const uid = req.userId || 'anonymous';
  const { variables } = req.body;

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (env write)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }
  if (!Array.isArray(variables)) throw new ValidationError('variables array required');

  const content = variables.map((v: any) => `${v.key}=${v.value}`).join('\n') + '\n';
  await fileService.writeFile(projectId, '.env', content);
  res.json({ success: true, message: 'Environment variables saved' });
}));

// POST /fly/project/:id/env/analyze
flyRouter.post('/project/:id/env/analyze', asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const uid = req.userId || 'anonymous';

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (env/analyze)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  // Scan config files and env templates for env var references
  const configFiles = [
    'next.config.js', 'next.config.mjs', 'next.config.ts',
    '.env.example', '.env.local', '.env.dev', '.env.development',
    '.env.sample', '.env.template',
    'vite.config.js', 'vite.config.ts',
    'nuxt.config.js', 'nuxt.config.ts',
  ];
  const variables: { key: string; value: string; required: boolean }[] = [];

  for (const file of configFiles) {
    const result = await fileService.readFile(projectId, file);
    if (result.success && result.data) {
      const content = result.data.content;
      const isEnvFile = file.startsWith('.env');

      if (isEnvFile) {
        // Parse .env-style files: extract KEY=value lines (skip comments and empty)
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.substring(0, eqIdx).trim();
            const value = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (/^[A-Z_][A-Z0-9_]*$/.test(key) && !variables.find(v => v.key === key)) {
              variables.push({ key, value, required: true });
            }
          }
        }
      } else {
        // Scan code files for process.env.XXX and import.meta.env.XXX
        const processEnvRefs = content.match(/process\.env\.([A-Z_][A-Z0-9_]*)/g) || [];
        for (const ref of processEnvRefs) {
          const key = ref.replace('process.env.', '');
          if (!variables.find(v => v.key === key)) {
            variables.push({ key, value: '', required: true });
          }
        }
        const metaEnvRefs = content.match(/import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g) || [];
        for (const ref of metaEnvRefs) {
          const key = ref.replace('import.meta.env.', '');
          if (!variables.find(v => v.key === key)) {
            variables.push({ key, value: '', required: true });
          }
        }
      }
    }
  }

  res.json({ success: true, variables });
}));

// POST /fly/heartbeat
flyRouter.post('/heartbeat', asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  const uid = req.userId || 'anonymous';
  if (!projectId) throw new ValidationError('projectId required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (heartbeat)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const session = await sessionService.get(projectId, uid);
  if (session) {
    session.lastUsed = Date.now();
    await sessionService.set(projectId, uid, session);
  }
  res.json({ success: true, machineId: session?.containerId, status: session ? 'active' : 'none' });
}));

// POST /fly/release
flyRouter.post('/release', asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  const uid = req.userId || 'anonymous';
  if (!projectId) throw new ValidationError('projectId required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (release)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  await workspaceService.release(projectId, uid);
  res.json({ success: true, message: 'Container released' });
}));

// POST /fly/reload
flyRouter.post('/reload', asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  const uid = req.userId || 'anonymous';
  if (!projectId) throw new ValidationError('projectId required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (reload)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  // With NVMe bind mounts, files are already synced — just notify agent
  const session = await sessionService.get(projectId, uid);
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

// GET /fly/logs/:projectId — SSE log stream from container (proxy agent /logs)
flyRouter.get('/logs/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const uid = req.userId || 'anonymous';

  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (logs)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const previewToken = typeof req.query.previewToken === 'string'
    ? req.query.previewToken
    : (typeof req.query.pt === 'string' ? req.query.pt : '');
  const session = previewToken
    ? await sessionService.getByProjectIdAndAccessToken(projectId, previewToken)
    : await sessionService.get(projectId, uid);
  if (!session) return res.status(404).json({ error: 'No active session' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const keepAlive = setInterval(() => {
    try { res.write(':keepalive\n\n'); } catch { /* ignore */ }
  }, 15000);

  log.info(`[Logs] Proxying agent /logs for ${projectId} → ${session.agentUrl}`);

  const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\[[\d;]*m/g, '');
  const sendSse = (payload: Record<string, any>) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  const emitLogText = (text: string, ts?: number, logId?: number) => {
    const clean = stripAnsi(String(text || ''))
      .replace(/\r/g, '')
      .replace(/\u0000/g, '')
      .trim();
    if (!clean || clean === ':keepalive') return;
    const timestamp = Number.isFinite(ts as number)
      ? Math.floor(ts as number)
      : Math.floor(Date.now() / 1000);
    const payload: Record<string, any> = { type: 'log', text: clean, timestamp };
    const normalizedLogId = Number(logId || 0);
    if (Number.isFinite(normalizedLogId) && normalizedLogId > 0) {
      payload.id = Math.floor(normalizedLogId);
    }
    sendSse(payload);
  };

  const axios = (await import('axios')).default;
  const querySince = typeof req.query.since === 'string' ? req.query.since.trim() : '';
  const parsedSince = Number.parseInt(querySince, 10);
  // Agent /logs expects an incremental log-id cursor, not a unix timestamp.
  // If client sends a timestamp (legacy behavior), fallback to 0 to avoid skipping buffered logs.
  const sinceId = Number.isFinite(parsedSince) && parsedSince >= 0 && parsedSince < 1_000_000_000
    ? parsedSince
    : 0;
  const since = String(sinceId);
  try {
    const response = await axios.get(`${session.agentUrl}/logs?since=${encodeURIComponent(since)}`, {
      responseType: 'stream',
      timeout: 0,
    });

    let buffer = '';
    response.data.on('data', (chunk: Buffer) => {
      // npm/yarn/pnpm often emit carriage-return progress updates without '\n'.
      // Convert them to line breaks so the UI can stream updates in real-time.
      buffer += chunk.toString().replace(/\r/g, '\n');
      let lineEnd;
      while ((lineEnd = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, lineEnd);
        buffer = buffer.substring(lineEnd + 1);
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.substring(6));
            const timestamp = Number(data.timestamp || data.ts || Math.floor(Date.now() / 1000));
            const logId = Number(data.id || 0);
            if (typeof data.text === 'string') {
              emitLogText(data.text, timestamp, logId);
            } else if (typeof data.message === 'string') {
              emitLogText(data.message, timestamp, logId);
            } else {
              sendSse(data);
            }
          } catch {
            emitLogText(trimmed.substring(6));
          }
          continue;
        }
        if (
          trimmed.startsWith(':') ||
          trimmed.startsWith('event:') ||
          trimmed.startsWith('id:') ||
          trimmed.startsWith('retry:')
        ) {
          continue;
        }
        emitLogText(trimmed);
      }
      if (typeof (res as any).flush === 'function') (res as any).flush();
    });

    response.data.on('end', () => {
      if (buffer.trim()) emitLogText(buffer.trim());
      clearInterval(keepAlive);
      res.end();
    });
    response.data.on('error', (err: Error) => {
      log.error(`[Logs] Stream error for ${projectId}: ${err.message}`);
      clearInterval(keepAlive);
      res.end();
    });

    req.on('close', () => {
      clearInterval(keepAlive);
      response.data.destroy();
    });
  } catch (e: any) {
    log.error(`[Logs] Stream error for ${projectId}: ${e.message}`);
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to connect to log stream' })}\n\n`);
    clearInterval(keepAlive);
    res.end();
  }
}));

// POST /fly/session
flyRouter.post('/session', asyncHandler(async (req, res) => {
  const { projectId, machineId } = req.body || {};
  const uid = req.userId || 'anonymous';
  if (!projectId && !machineId) throw new ValidationError('projectId or machineId required');

  let session = null as Awaited<ReturnType<typeof sessionService.get>> | null;

  if (projectId) {
    const isOwner = await verifyProjectOwnership(uid, projectId);
    if (!isOwner) {
      log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (session)`);
      return res.status(403).json({ error: 'Access denied: you do not own this project' });
    }
    session = await sessionService.get(projectId, uid);
  }

  // Backward-compatible path: some clients still send machineId.
  if (!session && machineId) {
    const byContainer = await sessionService.getByContainerId(machineId);
    if (byContainer) {
      const isOwner = await verifyProjectOwnership(uid, byContainer.projectId);
      if (!isOwner) {
        log.warn(`[AUTH] User ${uid} tried to access machine ${machineId} for project ${byContainer.projectId} without ownership (session)`);
        return res.status(403).json({ error: 'Access denied: you do not own this project' });
      }
      if (byContainer.userId === 'legacy') {
        const adopted = { ...byContainer, userId: uid, lastUsed: Date.now() };
        await sessionService.set(byContainer.projectId, uid, adopted);
        session = adopted;
      } else if (byContainer.userId !== uid) {
        return res.status(403).json({ error: 'Session belongs to another user' });
      } else {
        session = byContainer;
      }
    }
  }

  if (session) {
    session.lastUsed = Date.now();
    await sessionService.set(session.projectId, session.userId, session);
  }

  res.json({
    success: true,
    machineId: session?.containerId,
    projectId: session?.projectId,
    previewToken: session?.accessToken,
    message: session ? 'Session active' : 'No session',
  });
}));

// POST /fly/pool/recycle
flyRouter.post('/pool/recycle', asyncHandler(async (req, res) => {
  // In the new architecture, we just destroy all idle containers
  const sessions = await sessionService.getAll();
  let destroyed = 0;
  for (const s of sessions) {
    const healthy = await devServerService.isRunning(s.agentUrl).catch(() => false);
    if (!healthy) {
      await workspaceService.release(s.projectId, s.userId).catch(() => {});
      destroyed++;
    }
  }
  res.json({ success: true, destroyed });
}));

// GET /fly/project/:id/published — Check if project is already published
flyRouter.get('/project/:id/published', asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const uid = req.userId || 'anonymous';

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (published-check)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const db = firebaseService.getFirestore();
  if (!db) { res.json({ published: false }); return; }

  const snapshot = await db.collection('published_sites').where('projectId', '==', projectId).limit(1).get();
  if (snapshot.empty) { res.json({ published: false }); return; }

  const data = snapshot.docs[0].data();
  res.json({ published: true, slug: data.slug, url: data.url, publishedAt: data.publishedAt });
}));

// DELETE /fly/project/:id/published — Remove published site
flyRouter.delete('/project/:id/published', asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const uid = req.userId || 'anonymous';

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (unpublish)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const db = firebaseService.getFirestore();
  if (!db) { res.json({ success: false, error: 'No database' }); return; }

  const snapshot = await db.collection('published_sites').where('projectId', '==', projectId).limit(1).get();
  if (snapshot.empty) { res.json({ success: false, error: 'Not published' }); return; }

  const data = snapshot.docs[0].data();
  const slug = data.slug;

  // Remove files using Node.js fs (no shell injection)
  const destDir = path.join(config.publishedRoot, slug);
  await fs.rm(destDir, { recursive: true, force: true }).catch(() => {});

  // Remove from Firestore
  await db.collection('published_sites').doc(snapshot.docs[0].id).delete();

  auditService.log({ userId: uid, action: 'unpublish', resource: projectId, details: `slug: ${slug}`, ip: req.ip });
  log.info(`[Publish] Unpublished ${projectId} (slug: ${slug})`);
  res.json({ success: true });
}));

// POST /fly/project/:id/publish — Build and publish project as static site
flyRouter.post('/project/:id/publish', asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const { slug } = req.body;
  const userId = req.userId || 'anonymous';
  if (!slug) throw new ValidationError('slug required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(userId, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${userId} tried to access project ${projectId} without ownership (publish)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  // Publish is a paid feature
  const publishUserPlan = await getUserPlan(userId);
  if (publishUserPlan === 'free') {
    log.warn(`[Publish] Free user ${userId} tried to publish project ${projectId}`);
    return res.status(403).json({
      error: 'PUBLISH_REQUIRES_PAID',
      message: 'La pubblicazione è disponibile con il piano Go.',
    });
  }

  // Publish can kill the dev server (cache deletion, config patching).
  // Always restart it afterwards.
  const previewSession = await sessionService.get(projectId, userId);
  const shouldResumePreview = !!previewSession;

  const isAgentTransportError = (error: any): boolean => {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'EHOSTUNREACH',
      'EAI_AGAIN',
    ].includes(code) || /EHOSTUNREACH|ECONNREFUSED|ECONNRESET|socket hang up|aborted/i.test(message);
  };

  const execForPublish = async (
    command: string,
    cwd = '/home/coder/project',
    step = 'command',
  ) => {
    try {
      return await workspaceService.exec(projectId, userId, command, cwd);
    } catch (error: any) {
      if (!isAgentTransportError(error)) throw error;

      log.warn(`[Publish] Agent unavailable during ${step} for ${projectId}, recreating container and retrying once`);
      await workspaceService.getOrCreateContainer(projectId, userId);
      return await workspaceService.exec(projectId, userId, command, cwd);
    }
  };

  try {
    // 1. Sanitize slug
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!cleanSlug) throw new ValidationError('Invalid slug');

    // 2. Check slug availability in Firestore
    const db = firebaseService.getFirestore();
    if (db) {
      const existing = await db.collection('published_sites').doc(cleanSlug).get();
      if (existing.exists && existing.data()?.projectId !== projectId) {
        res.status(409).json({ error: 'Slug already taken', slug: cleanSlug });
        return;
      }
    }

    // 3. Detect project type and build strategy
    const pkgResult = await fileService.readFile(projectId, 'package.json');
    const hasPnpmLock = await fileService.exists(projectId, 'pnpm-lock.yaml');
    const hasYarnLock = await fileService.exists(projectId, 'yarn.lock');
    const hasBunLock = await fileService.exists(projectId, 'bun.lockb') || await fileService.exists(projectId, 'bun.lock');
    const hasPackageLock = await fileService.exists(projectId, 'package-lock.json');
    const hasYarnPnp = await fileService.exists(projectId, '.pnp.cjs') || await fileService.exists(projectId, '.pnp.js');

    let hasBuildScript = false;
    let hasGenerateScript = false;
    let isNextJs = false;
    let isNuxt = false;
    let isVite = false;
    let isCRA = false;
    let packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' = 'npm';

    if (hasPnpmLock) packageManager = 'pnpm';
    else if (hasYarnLock || hasYarnPnp) packageManager = 'yarn';
    else if (hasBunLock) packageManager = 'bun';
    else if (hasPackageLock) packageManager = 'npm';

    if (pkgResult.success && pkgResult.data) {
      try {
        const pkg = JSON.parse(pkgResult.data.content);
        hasBuildScript = !!pkg.scripts?.build;
        hasGenerateScript = !!pkg.scripts?.generate;
        isNextJs = !!(pkg.dependencies?.next || pkg.devDependencies?.next);
        isNuxt = !!(pkg.dependencies?.nuxt || pkg.devDependencies?.nuxt);
        isVite = !isNextJs && !isNuxt && !!(pkg.devDependencies?.vite || pkg.dependencies?.vite);
        isCRA = !!(pkg.dependencies?.['react-scripts'] || pkg.devDependencies?.['react-scripts']);
        const pmFromPackageJson = String(pkg.packageManager || '').toLowerCase();
        if (pmFromPackageJson.startsWith('pnpm@')) packageManager = 'pnpm';
        else if (pmFromPackageJson.startsWith('yarn@')) packageManager = 'yarn';
        else if (pmFromPackageJson.startsWith('bun@')) packageManager = 'bun';
        else if (pmFromPackageJson.startsWith('npm@')) packageManager = 'npm';
      } catch {}
    }

    const installCommandsByPm: Record<'npm' | 'pnpm' | 'yarn' | 'bun', string[]> = {
      npm: ['npm install --legacy-peer-deps'],
      pnpm: ['pnpm install --frozen-lockfile', 'pnpm install', 'npm install --legacy-peer-deps'],
      yarn: ['yarn install --frozen-lockfile', 'yarn install', 'npm install --legacy-peer-deps'],
      bun: ['bun install --frozen-lockfile', 'bun install', 'npm install --legacy-peer-deps'],
    };

    // CRA: set PUBLIC_URL so asset paths resolve under /p/{slug}/
    const craBaseEnv = isCRA ? `PUBLIC_URL=/p/${cleanSlug}/ ` : '';

    const buildCommandsByPm: Record<'npm' | 'pnpm' | 'yarn' | 'bun', string[]> = {
      npm: [`${craBaseEnv}CI=false npm_config_update_notifier=false npm run build`],
      pnpm: [`${craBaseEnv}CI=false pnpm run build`, `${craBaseEnv}CI=false npm_config_update_notifier=false npm run build`],
      yarn: [`${craBaseEnv}CI=false yarn build`, `${craBaseEnv}CI=false npm_config_update_notifier=false npm run build`],
      bun: [`${craBaseEnv}CI=false bun run build`, `${craBaseEnv}CI=false npm_config_update_notifier=false npm run build`],
    };

    const generateCommandsByPm: Record<'npm' | 'pnpm' | 'yarn' | 'bun', string[]> = {
      npm: ['npm run generate'],
      pnpm: ['pnpm run generate', 'npm run generate'],
      yarn: ['yarn generate', 'npm run generate'],
      bun: ['bun run generate', 'npm run generate'],
    };

    const runCommandCandidates = async (commands: string[], step: string) => {
      let lastResult: Awaited<ReturnType<typeof execForPublish>> | null = null;
      for (const command of commands) {
        const result = await execForPublish(command, '/home/coder/project', `${step}: ${command}`);
        lastResult = result;
        if (result.exitCode === 0) {
          return result;
        }
        log.warn(`[Publish] ${step} command failed for ${projectId}: ${command}`);
      }
      return lastResult;
    };
    const hasPubspec = await fileService.exists(projectId, 'pubspec.yaml');
    const isFlutter = hasPubspec;
    const isServerSide = await fileService.exists(projectId, 'manage.py') // Django
      || await fileService.exists(projectId, 'artisan')                   // Laravel
      || false;

    // Check for Python server frameworks (Flask/FastAPI) — these can't be published as static
    if (!hasBuildScript && !isFlutter) {
      const reqResult = await fileService.readFile(projectId, 'requirements.txt');
      if (reqResult.success && reqResult.data) {
        const reqs = reqResult.data.content.toLowerCase();
        if (reqs.includes('flask') || reqs.includes('fastapi') || reqs.includes('django')) {
          res.status(400).json({ error: 'Server-side frameworks (Flask, Django, FastAPI) cannot be published as static sites. Use the live preview instead.' });
          return;
        }
      }
    }
    if (isServerSide) {
      res.status(400).json({ error: 'Server-side frameworks (Django, Laravel) cannot be published as static sites. Use the live preview instead.' });
      return;
    }

    // License compliance check — only for projects with package.json and node_modules
    if (pkgResult.success && pkgResult.data) {
      const hasNodeModulesForCheck = await fileService.exists(projectId, 'node_modules');
      if (hasNodeModulesForCheck) {
        try {
          const licenseCheck = await execForPublish(
            'npx --yes license-checker --json --failOn "GPL-2.0;GPL-3.0;AGPL-3.0;AGPL-1.0;SSPL-1.0;CC-BY-NC-4.0;CC-BY-NC-SA-4.0" 2>/dev/null || echo "LICENSE_CHECK_FAILED"',
            '/home/coder/project',
            'license-check'
          );

          if (licenseCheck.stdout.includes('LICENSE_CHECK_FAILED') || licenseCheck.exitCode !== 0) {
            let problematicPackages: string[] = [];
            try {
              const licenseData = JSON.parse(licenseCheck.stderr || licenseCheck.stdout);
              problematicPackages = Object.entries(licenseData)
                .filter(([_, info]: [string, any]) => {
                  const license = (info.licenses || '').toString();
                  return /GPL|AGPL|SSPL|CC-BY-NC/i.test(license);
                })
                .map(([name, info]: [string, any]) => `${name}: ${(info as any).licenses}`);
            } catch { /* parsing failed, still block if packages found */ }

            if (problematicPackages.length > 0) {
              res.status(400).json({
                error: 'license_violation',
                message: 'Project contains dependencies with restrictive licenses that prevent publication',
                packages: problematicPackages,
                suggestion: 'Replace these packages with MIT/Apache-2.0/ISC alternatives, or remove them before publishing.',
              });
              return;
            }
          }
        } catch (licErr: any) {
          log.warn(`[Publish] License check failed for ${projectId}, proceeding: ${licErr.message}`);
        }
      }
    }

    let srcDir: string;
    const projectHostPath = path.join(config.projectsRoot, projectId);

    if (isNuxt) {
      // 4-nuxt. Nuxt requires `nuxi generate` for static pre-rendered output.
      // Runs inside the container as `coder` user to avoid root-owned file permission issues.
      log.info(`[Publish] Generating static Nuxt site for ${projectId} slug "${cleanSlug}"...`);
      const hasNodeModules = await fileService.exists(projectId, 'node_modules');
      if (!hasNodeModules && !hasYarnPnp) {
        log.info(`[Publish] Installing dependencies for ${projectId} with ${packageManager}...`);
        const installResult = await runCommandCandidates(installCommandsByPm[packageManager], 'install deps');
        if (!installResult || installResult.exitCode !== 0) {
          res.status(500).json({ error: 'Dependency install failed', stderr: (installResult?.stderr || installResult?.stdout)?.substring(0, 500) });
          return;
        }
      }

      const withNuxtBuildDir = (cmd: string) =>
        `rm -rf .output /tmp/.nuxt-publish && NUXT_BUILD_DIR=/tmp/.nuxt-publish ${cmd}`;
      const generateCommands = [
        ...(hasGenerateScript ? generateCommandsByPm[packageManager] : []),
        'npx --yes nuxi generate',
        './node_modules/.bin/nuxi generate',
      ].map(withNuxtBuildDir);

      // Use a separate build dir so nuxi generate doesn't corrupt the running dev server's .nuxt/
      const buildResult = await runCommandCandidates(generateCommands, 'nuxt generate');
      if (!buildResult || buildResult.exitCode !== 0) {
        const errorOutput = buildResult?.stderr || buildResult?.stdout || 'Unknown error';
        log.error(`[Publish] Nuxt generate failed for ${projectId}:`, errorOutput);
        res.status(500).json({ error: 'Nuxt generate failed', stderr: errorOutput.substring(0, 500) });
        return;
      }
      srcDir = path.join(projectHostPath, '.output', 'public');
    } else if (isFlutter) {
      // 4-flutter. Build Flutter Web
      log.info(`[Publish] Building Flutter Web for ${projectId} slug "${cleanSlug}"...`);
      const buildResult = await execForPublish('flutter build web --release', '/home/coder/project', 'flutter build');
      if (buildResult.exitCode !== 0) {
        const errorOutput = buildResult.stderr || buildResult.stdout || 'Unknown error';
        log.error(`[Publish] Flutter build failed for ${projectId}:`, errorOutput);
        res.status(500).json({ error: 'Flutter build failed', stderr: errorOutput.substring(0, 500) });
        return;
      }
      srcDir = path.join(config.projectsRoot, projectId, 'build/web');
    } else if (hasBuildScript) {
      // 4a. Install deps if node_modules is missing
      const hasNodeModules = await fileService.exists(projectId, 'node_modules');
      if (!hasNodeModules && !hasYarnPnp) {
        log.info(`[Publish] Installing dependencies for ${projectId} with ${packageManager}...`);
        const installResult = await runCommandCandidates(installCommandsByPm[packageManager], 'install deps');
        if (!installResult || installResult.exitCode !== 0) {
          log.error(`[Publish] Dependency install failed for ${projectId}:`, installResult?.stderr || installResult?.stdout);
          res.status(500).json({ error: 'Dependency install failed', stderr: (installResult?.stderr || installResult?.stdout)?.substring(0, 500) });
          return;
        }
      }

      // 4b. Build project in container (clear .next cache first to avoid stale chunk errors)
      log.info(`[Publish] Building project ${projectId} for slug "${cleanSlug}"...`);
      // Clear .next cache from HOST side first — the container rm may fail for root-owned files
      // (bind-mounted dir: /data/cache/next-build/{id} → container /home/coder/project/.next)
      const nextCachePath = path.join(config.cacheRoot, 'next-build', projectId);
      try {
        const entries = await fs.readdir(nextCachePath).catch(() => []);
        await Promise.all(entries.map(e =>
          fs.rm(path.join(nextCachePath, e), { recursive: true, force: true }).catch(() => {})
        ));
        log.info(`[Publish] Cleared .next cache on host for ${projectId}`);
      } catch (e: any) {
        log.warn(`[Publish] Could not clear .next cache on host: ${e.message}`);
      }
      // For Next.js: patch next.config on the HOST to add output: 'export' for static publishing.
      // The backend runs as root and has direct access to project files — no container needed.
      // We restore the original config after the build regardless of success/failure.
      let nextConfigRestore: { path: string; mode: 'restore' | 'delete'; original?: string } | null = null;
      if (isNextJs) {
        let configFound = false;
        for (const name of ['next.config.ts', 'next.config.mjs', 'next.config.js']) {
          const cfgPath = path.join(projectHostPath, name);
          try {
            const content = await fs.readFile(cfgPath, 'utf8');
            configFound = true;
            if (/output\s*:\s*["']export["']/.test(content)) {
              log.info(`[Publish] ${name} already has output: 'export'`);
              break;
            }
            // First try: inject output into object-literal export/module config.
            let patched = content.replace(
              /(const\s+\w[\w<>:, ]*\s*=\s*\{|module\.exports\s*=\s*\{|export\s+default\s*\{)/,
              "$1\n  output: 'export',"
            );
            // Fallback for "export default nextConfig" style files.
            if (patched === content) {
              patched = content.replace(
                /export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/,
                "$1.output = 'export';\nexport default $1"
              );
            }
            // Fallback for "module.exports = nextConfig" style files.
            if (patched === content) {
              patched = content.replace(
                /module\.exports\s*=\s*([A-Za-z_$][\w$]*)\s*;?/,
                "$1.output = 'export';\nmodule.exports = $1"
              );
            }
            if (patched !== content) {
              nextConfigRestore = { path: cfgPath, mode: 'restore', original: content };
              await fs.writeFile(cfgPath, patched, 'utf8');
              log.info(`[Publish] Patched ${name} with output: 'export' for static build`);
            } else {
              log.warn(`[Publish] Could not auto-patch ${name}; build may require manual output: 'export'`);
            }
            break;
          } catch { /* config file not found, try next */ }
        }

        // No next.config file at all: create a temporary one for static export.
        if (!configFound) {
          const createdPath = path.join(projectHostPath, 'next.config.mjs');
          const createdContent = "const nextConfig = {\n  output: 'export',\n};\n\nexport default nextConfig;\n";
          await fs.writeFile(createdPath, createdContent, 'utf8');
          nextConfigRestore = { path: createdPath, mode: 'delete' };
          log.info('[Publish] Created temporary next.config.mjs with output: export');
        }
      }

      // For Vite: patch vite.config to set base: '/p/{slug}/' so all asset paths
      // (including dynamic imports in JS) resolve correctly under the published subdirectory.
      let viteConfigRestore: { path: string; original: string } | null = null;
      if (isVite) {
        for (const name of ['vite.config.ts', 'vite.config.mts', 'vite.config.mjs', 'vite.config.js']) {
          const cfgPath = path.join(projectHostPath, name);
          try {
            const content = await fs.readFile(cfgPath, 'utf8');
            if (/base\s*:/.test(content)) {
              log.info(`[Publish] ${name} already has base config, skipping patch`);
              break;
            }
            let patched = content;
            // Try: defineConfig({ ... })
            patched = content.replace(
              /(defineConfig\s*\(\s*\{)/,
              `$1\n  base: '/p/${cleanSlug}/',`
            );
            // Fallback: export default { ... }
            if (patched === content) {
              patched = content.replace(
                /(export\s+default\s*\{)/,
                `$1\n  base: '/p/${cleanSlug}/',`
              );
            }
            if (patched !== content) {
              viteConfigRestore = { path: cfgPath, original: content };
              await fs.writeFile(cfgPath, patched, 'utf8');
              log.info(`[Publish] Patched ${name} with base: '/p/${cleanSlug}/'`);
            } else {
              log.warn(`[Publish] Could not auto-patch ${name} with base path`);
            }
            break;
          } catch { /* config file not found, try next */ }
        }
      }

      await fs.rm(path.join(projectHostPath, '.next'), { recursive: true, force: true }).catch(() => {});
      await fs.rm(path.join(projectHostPath, 'dist'), { recursive: true, force: true }).catch(() => {});
      await fs.rm(path.join(projectHostPath, 'build'), { recursive: true, force: true }).catch(() => {});
      await fs.rm(path.join(projectHostPath, 'out'), { recursive: true, force: true }).catch(() => {});
      await fs.rm(path.join(projectHostPath, '.output'), { recursive: true, force: true }).catch(() => {});

      const buildResult = await runCommandCandidates(buildCommandsByPm[packageManager], 'build');

      // Always restore temporary Vite config changes after build.
      if (viteConfigRestore) {
        await fs.writeFile(viteConfigRestore.path, viteConfigRestore.original, 'utf8').catch(() => {});
        log.info('[Publish] Restored vite.config after build');
      }

      // Always restore temporary Next.js config changes after build.
      if (nextConfigRestore) {
        if (nextConfigRestore.mode === 'restore') {
          await fs.writeFile(nextConfigRestore.path, nextConfigRestore.original || '', 'utf8').catch(() => {});
          log.info('[Publish] Restored next.config after build');
        } else {
          await fs.rm(nextConfigRestore.path, { force: true }).catch(() => {});
          log.info('[Publish] Removed temporary next.config.mjs after build');
        }
      }

      if (!buildResult || buildResult.exitCode !== 0) {
        const errorOutput = buildResult?.stderr || buildResult?.stdout || 'Unknown error';
        log.error(`[Publish] Build failed for ${projectId}:`, errorOutput);
        res.status(500).json({ error: 'Build failed', stderr: errorOutput.substring(0, 500) });
        return;
      }

      // 4c. Detect build output directory on host filesystem.
      let outputDir: string | null = null;
      const outputCandidates = [
        '.output/public',
        '.vercel/output/static',
        'build/web',
        'dist/browser',
        'dist/client',
        'dist',
        'build/client',
        'build',
        'out',
        '.next/standalone',
      ];

      for (const candidate of outputCandidates) {
        try {
          const stat = await fs.stat(path.join(projectHostPath, candidate));
          if (stat.isDirectory()) {
            outputDir = candidate;
            break;
          }
        } catch {
          // Try next candidate
        }
      }

      if (!outputDir) {
        // Angular fallback: dist/{subdir}/browser
        try {
          const distEntries = await fs.readdir(path.join(projectHostPath, 'dist'), { withFileTypes: true });
          const browserDir = distEntries.find((entry) => entry.isDirectory());
          if (browserDir) {
            const maybeBrowser = path.join(projectHostPath, 'dist', browserDir.name, 'browser');
            const stat = await fs.stat(maybeBrowser).catch(() => null);
            if (stat?.isDirectory()) {
              outputDir = path.join('dist', browserDir.name, 'browser');
            }
          }
        } catch {
          // Ignore missing dist dir
        }
      }

      if (!outputDir) {
        res.status(500).json({ error: 'No build output found (checked: dist, build, out, .output/public, build/web, .next/standalone)' });
        return;
      }

      srcDir = path.join(projectHostPath, outputDir);
    } else {
      // 4d. No build step — publish project root directly (HTML/CSS/JS)
      log.info(`[Publish] No build script found, publishing project root for ${projectId}`);
      srcDir = path.join(config.projectsRoot, projectId);
    }

    // 5. Copy to published directory using Node.js fs (no shell injection)
    const destDir = path.join(config.publishedRoot, cleanSlug);
    await fs.mkdir(config.publishedRoot, { recursive: true });
    await fs.rm(destDir, { recursive: true, force: true });
    await fs.cp(srcDir, destDir, { recursive: true });

    // Rewrite root-absolute asset paths in HTML/CSS files so they resolve
    // correctly when served under /p/{slug}/.
    // e.g. src="/assets/index.js" → src="/p/po9/assets/index.js"
    // Handles: Vite (/assets/), Next.js (/_next/), and any other root-absolute paths.
    const rewriteAssetPaths = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await rewriteAssetPaths(fullPath);
          continue;
        }
        if (!entry.isFile()) continue;

        const ext = entry.name.split('.').pop()?.toLowerCase();
        if (ext !== 'html' && ext !== 'css' && ext !== 'js' && ext !== 'mjs') continue;

        let content = await fs.readFile(fullPath, 'utf8');
        let rewritten = content;

        if (ext === 'html') {
          // Rewrite src="/...", href="/...", action="/..." attributes
          // Skip: protocol-relative (//), already prefixed (/p/), data URIs
          rewritten = rewritten.replace(
            /((?:src|href|action)\s*=\s*["'])\/(?!\/|p\/)/gi,
            `$1/p/${cleanSlug}/`
          );
          // Rewrite url() in inline <style> blocks
          rewritten = rewritten.replace(
            /(url\s*\(\s*["']?)\/(?!\/|p\/|data:)/gi,
            `$1/p/${cleanSlug}/`
          );
        } else if (ext === 'css') {
          // CSS: rewrite url() paths
          rewritten = rewritten.replace(
            /(url\s*\(\s*["']?)\/(?!\/|p\/|data:)/gi,
            `$1/p/${cleanSlug}/`
          );
        } else {
          // JS/MJS: rewrite Vite-style asset paths in string literals
          // e.g. "/assets/index-abc.css" → "/p/{slug}/assets/index-abc.css"
          // Also handles /_next/, /@vite/, and other root-absolute asset refs
          rewritten = rewritten.replace(
            /(["'])\/assets\//g,
            `$1/p/${cleanSlug}/assets/`
          );
          rewritten = rewritten.replace(
            /(["'])\/_next\//g,
            `$1/p/${cleanSlug}/_next/`
          );
        }

        if (rewritten !== content) {
          await fs.writeFile(fullPath, rewritten, 'utf8');
        }
      }
    };

    await rewriteAssetPaths(destDir);
    log.info(`[Publish] Rewrote asset paths for slug ${cleanSlug}`);

    // Clean up node_modules and .git from published dir if copied from root
    if (!hasBuildScript) {
      await fs.rm(path.join(destDir, 'node_modules'), { recursive: true, force: true }).catch(() => {});
      await fs.rm(path.join(destDir, '.git'), { recursive: true, force: true }).catch(() => {});
    }

    // Basic content moderation scan — log suspicious patterns for manual review (non-blocking)
    try {
      const suspiciousPattern = /password.*input|login.*form|credit.card|phishing/i;
      const flaggedFiles: string[] = [];
      const scanDir = async (dir: string) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (flaggedFiles.length >= 5) return;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await scanDir(fullPath);
          } else if (entry.isFile() && entry.name.endsWith('.html')) {
            const content = await fs.readFile(fullPath, 'utf8');
            if (suspiciousPattern.test(content)) {
              flaggedFiles.push(fullPath.replace(destDir, ''));
            }
          }
        }
      };
      await scanDir(destDir);
      if (flaggedFiles.length > 0) {
        log.warn(`[Publish] Suspicious content patterns detected in ${projectId} (slug: ${cleanSlug}): ${flaggedFiles.join(', ')}`);
      }
    } catch (scanErr: any) {
      log.warn(`[Publish] Content scan failed for ${projectId}, proceeding: ${(scanErr as Error).message}`);
    }

    // 6. Save to Firestore
    if (db) {
      await db.collection('published_sites').doc(cleanSlug).set({
        projectId,
        userId,
        slug: cleanSlug,
        publishedAt: new Date(),
        url: `${config.publicUrl}/p/${cleanSlug}`,
      });
    }

    // 7. Return URL
    const url = `${config.publicUrl}/p/${cleanSlug}`;
    auditService.log({ userId, action: 'publish', resource: projectId, details: `slug: ${cleanSlug}`, ip: req.ip });
    log.info(`[Publish] Published ${projectId} → ${url}`);
    res.json({ success: true, url, slug: cleanSlug });
  } catch (e: any) {
    if (e instanceof ValidationError) throw e;

    const rawMessage = e?.response?.data?.error || e?.message || 'Unknown error';
    const message = String(rawMessage);
    log.error(`[Publish] Unexpected error for ${projectId}: ${message}`);

    if (!res.headersSent) {
      res.status(500).json({ error: 'Publish failed', stderr: message.substring(0, 500) });
    }
  } finally {
    if (shouldResumePreview) {
      setImmediate(async () => {
        try {
          const resumeSession = await workspaceService.getOrCreateContainer(projectId, userId);

          const alreadyRunning = await devServerService.isRunning(resumeSession.agentUrl);
          if (alreadyRunning) return;

          const projectInfo = resumeSession.projectInfo || await projectDetectorService.detect(projectId);
          resumeSession.projectInfo = projectInfo;
          await devServerService.start(resumeSession, projectInfo);
          resumeSession.preparedAt = Date.now();
          await sessionService.set(projectId, userId, resumeSession);
          log.info(`[Publish] Preview resumed after publish for ${projectId}`);
        } catch (e: any) {
          log.warn(`[Publish] Failed to resume preview after publish for ${projectId}: ${e.message}`);
        }
      });
    }
  }
}));
