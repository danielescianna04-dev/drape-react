import { Router, Request, Response } from 'express';
import * as path from 'path';
import { promises as fs } from 'fs';
import { asyncHandler } from '../middleware/async-handler';
import { ValidationError } from '../middleware/error-handler';
import { verifyProjectOwnership } from '../middleware/auth';
import { workspaceService } from '../services/workspace.service';
import { sessionService } from '../services/session.service';
import { fileService } from '../services/file.service';
import { dockerService } from '../services/docker.service';
import { devServerService } from '../services/dev-server.service';
import { previewService } from '../services/preview.service';
import { projectDetectorService } from '../services/project-detector.service';
import { firebaseService } from '../services/firebase.service';
import { log } from '../utils/logger';
import { config } from '../config';
import { execShell, validateProjectId } from '../utils/helpers';

export const flyRouter = Router();

// POST /fly/clone — Quick warmup
flyRouter.post('/clone', asyncHandler(async (req: Request, res: Response) => {
  const { workstationId, projectId, repositoryUrl, githubToken } = req.body;
  const id = projectId || workstationId;
  const uid = req.userId!;
  if (!id) throw new ValidationError('workstationId or projectId required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, id);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${id} without ownership (clone)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const result = await workspaceService.warmProject(id, uid, repositoryUrl, githubToken);
  const session = await sessionService.get(id, uid);

  res.json({
    success: true,
    machineId: session?.containerId,
    projectInfo: session?.projectInfo,
  });
}));

// POST /fly/preview/start — Start preview (SSE streaming)
flyRouter.post('/preview/start', asyncHandler(async (req: Request, res: Response) => {
  const { projectId, repositoryUrl, githubToken } = req.body;
  const uid = req.userId!;
  if (!projectId) throw new ValidationError('projectId required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (preview/start)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

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
      uid,
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
    log.error('[Fly] Preview start error:', e);
    send({ type: 'error', step: 'error', message: 'Failed to start preview' });
  }

  res.end();
}));

// POST /fly/preview/stop
flyRouter.post('/preview/stop', asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  const uid = req.userId!;
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
  validateProjectId(projectId);
  const uid = req.userId!;

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (list-files)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const files = await workspaceService.listFiles(projectId);
  res.json({ success: true, files, count: files.length, timestamp: new Date().toISOString() });
}));

// GET /fly/project/:id/file
flyRouter.get('/project/:id/file', asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const uid = req.userId!;
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
  const uid = req.userId!;
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
  const session = await sessionService.getByProjectId(projectId);
  if (session?.agentUrl) {
    fileService.notifyAgent(session.agentUrl, filePath, content || '').catch(() => {});
  }

  res.json({ success: true, path: filePath, message: 'File saved' });
}));

// POST /fly/project/:id/upload-files (bulk upload)
flyRouter.post('/project/:id/upload-files', asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const uid = req.userId!;
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
  const uid = req.userId!;
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
  const uid = req.userId!;

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
  const uid = req.userId!;
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
  const uid = req.userId!;

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (env/analyze)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

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
  const uid = req.userId!;
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
  const uid = req.userId!;
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
  const uid = req.userId!;
  if (!projectId) throw new ValidationError('projectId required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (reload)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  // With NVMe bind mounts, files are already synced — just notify agent
  const session = await sessionService.getByProjectId(projectId);
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
  const uid = req.userId!;

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (logs)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const session = await sessionService.getByProjectId(projectId);
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
    log.error(`[Fly] Log stream error for ${req.params.projectId}:`, e);
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to connect to log stream' })}\n\n`);
    res.end();
  }
}));

// POST /fly/session
flyRouter.post('/session', asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  const uid = req.userId!;
  if (!projectId) throw new ValidationError('projectId required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (session)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const session = await sessionService.get(projectId, uid);
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
  const uid = req.userId!;

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
  const uid = req.userId!;

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

  log.info(`[Publish] Unpublished ${projectId} (slug: ${slug})`);
  res.json({ success: true });
}));

// POST /fly/project/:id/publish — Build and publish project as static site
flyRouter.post('/project/:id/publish', asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const { slug } = req.body;
  const userId = req.userId!;
  if (!slug) throw new ValidationError('slug required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(userId, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${userId} tried to access project ${projectId} without ownership (publish)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

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

  // 3. Check if project has a build script
  const pkgResult = await fileService.readFile(projectId, 'package.json');
  let hasBuildScript = false;
  if (pkgResult.success && pkgResult.data) {
    try {
      const pkg = JSON.parse(pkgResult.data.content);
      hasBuildScript = !!pkg.scripts?.build;
    } catch {}
  }

  let srcDir: string;

  if (hasBuildScript) {
    // 4a. Build project in container
    log.info(`[Publish] Building project ${projectId} for slug "${cleanSlug}"...`);
    const buildResult = await workspaceService.exec(projectId, userId, 'npm run build', '/home/coder/project');
    if (buildResult.exitCode !== 0) {
      log.error(`[Publish] Build failed for ${projectId}:`, buildResult.stderr);
      res.status(500).json({ error: 'Build failed', stderr: buildResult.stderr?.substring(0, 500) });
      return;
    }

    // 4b. Detect build output directory
    const outputDirs = ['dist', 'build', 'out', '.next/standalone'];
    let outputDir: string | null = null;
    for (const dir of outputDirs) {
      if (await fileService.exists(projectId, dir)) {
        outputDir = dir;
        break;
      }
    }
    if (!outputDir) {
      res.status(500).json({ error: 'No build output found (checked: dist, build, out, .next/standalone)' });
      return;
    }
    srcDir = path.join(config.projectsRoot, projectId, outputDir);
  } else {
    // 4c. No build step — publish project root directly (HTML/CSS/JS)
    log.info(`[Publish] No build script found, publishing project root for ${projectId}`);
    srcDir = path.join(config.projectsRoot, projectId);
  }

  // 5. Copy to published directory using Node.js fs (no shell injection)
  const destDir = path.join(config.publishedRoot, cleanSlug);
  await fs.mkdir(config.publishedRoot, { recursive: true });
  await fs.rm(destDir, { recursive: true, force: true });
  await fs.cp(srcDir, destDir, { recursive: true });
  // Clean up node_modules and .git from published dir if copied from root
  if (!hasBuildScript) {
    await fs.rm(path.join(destDir, 'node_modules'), { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(destDir, '.git'), { recursive: true, force: true }).catch(() => {});
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
  log.info(`[Publish] Published ${projectId} → ${url}`);
  res.json({ success: true, url, slug: cleanSlug });
}));
