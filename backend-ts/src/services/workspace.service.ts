import { log } from '../utils/logger';
import { Session, ProjectInfo, Result, PreviewResult, ExecResult, ProgressCallback } from '../types';
import { dockerService } from './docker.service';
import { sessionService } from './session.service';
import { fileService } from './file.service';
import { fileWatcherService } from './file-watcher.service';
import { projectDetectorService } from './project-detector.service';
import { dependencyService } from './dependency.service';
import { devServerService } from './dev-server.service';
import { containerLifecycleService } from './container-lifecycle.service';
import { execShell } from '../utils/helpers';
import { config } from '../config';
import path from 'path';

class WorkspaceService {
  /**
   * Get or create a container for a project.
   * This is the main entry point — all operations go through here.
   */
  async getOrCreateContainer(projectId: string): Promise<Session> {
    return sessionService.withLock(projectId, async () => {
      // Check existing session
      const existing = await sessionService.get(projectId);
      if (existing) {
        const healthy = await containerLifecycleService.isHealthy(existing.agentUrl);
        if (healthy) {
          existing.lastUsed = Date.now();
          await sessionService.set(projectId, existing);
          return existing;
        }
        // Container dead — clean up and recreate
        log.warn(`[Workspace] Container for ${projectId} unhealthy, recreating`);
        await containerLifecycleService.destroy(projectId).catch(() => {});
      }

      // Create new container — NVMe bind mount means files are immediately available
      const container = await containerLifecycleService.create(projectId);
      const session: Session = {
        containerId: container.id,
        projectId,
        agentUrl: container.agentUrl,
        previewPort: container.previewPort,
        serverId: container.serverId,
        createdAt: container.createdAt,
        lastUsed: Date.now(),
      };

      await sessionService.set(projectId, session);
      return session;
    });
  }

  /**
   * Warm up a project: create container + install deps + start dev server in background.
   * Called by /fly/clone. Returns quickly, work continues in background.
   */
  async warmProject(projectId: string, repoUrl?: string, githubToken?: string): Promise<Result> {
    const session = await this.getOrCreateContainer(projectId);

    // If repo URL provided and no files exist, clone
    if (repoUrl) {
      const hasFiles = await fileService.exists(projectId, 'package.json');
      if (!hasFiles) {
        await this.cloneRepository(projectId, repoUrl, githubToken);
      }
    }

    // Detect project type
    const projectInfo = await projectDetectorService.detect(projectId);
    session.projectInfo = projectInfo;
    await sessionService.set(projectId, session);

    // Check if dev server already running (fast path for re-warm)
    if (await devServerService.isRunning(session.agentUrl)) {
      log.info(`[Workspace] Dev server already running for ${projectId} — skip warming`);
      return { success: true };
    }

    // Background: install + start dev server
    setImmediate(async () => {
      try {
        log.info(`[Workspace] Background warming ${projectId}...`);

        // Install dependencies
        if (projectInfo.type !== 'static' && projectInfo.type !== 'unknown') {
          await dependencyService.install(projectId, session, projectInfo);
        }

        // Start dev server
        await devServerService.start(session, projectInfo);
        session.preparedAt = Date.now();
        await sessionService.set(projectId, session);

        log.info(`[Workspace] Warming complete for ${projectId}`);
      } catch (e: any) {
        log.error(`[Workspace] Background warming failed for ${projectId}: ${e.message}`);
      }
    });

    // Start file watcher
    fileWatcherService.startWatching(projectId).catch(() => {});

    return { success: true };
  }

  /**
   * Start preview for a project. SSE streaming of progress.
   */
  async startPreview(
    projectId: string,
    onProgress?: ProgressCallback,
    repoUrl?: string,
    githubToken?: string,
  ): Promise<PreviewResult> {
    const startTime = Date.now();

    // Fast path: session exists + dev server running
    const existingSession = await sessionService.get(projectId);
    if (existingSession) {
      const devRunning = await devServerService.isRunning(existingSession.agentUrl);
      if (devRunning) {
        // Re-detect project type to catch mismatches (e.g. old "unknown" now detected as monorepo)
        const freshInfo = await projectDetectorService.detect(projectId);
        const storedType = existingSession.projectInfo?.type;
        if (storedType && storedType !== freshInfo.type) {
          log.warn(`[Workspace] Project type changed: ${storedType} → ${freshInfo.type} for ${projectId}, restarting dev server`);
          await devServerService.stop(existingSession).catch(() => {});
          existingSession.projectInfo = freshInfo;
          // Fall through to slow path to reinstall + restart
        } else {
          // Check if server is returning 500 with known errors (env vars, missing modules)
          const appError = await devServerService.checkResponseForErrors(existingSession.agentUrl);
          if (appError) {
            log.warn(`[Workspace] Fast path: app broken for ${projectId}: ${appError.substring(0, 100)}`);
            throw new Error(appError);
          }

          const elapsed = Date.now() - startTime;
          log.info(`[Workspace] Fast path for ${projectId} — ${elapsed}ms`);
          onProgress?.('starting', `Preview ready (fast path, ${elapsed}ms)`);
          return {
            success: true,
            previewUrl: this.buildPreviewUrl(existingSession),
            agentUrl: existingSession.agentUrl,
            containerId: existingSession.containerId,
            projectInfo: existingSession.projectInfo || freshInfo,
          };
        }
      }
    }

    // Slow path: full setup
    onProgress?.('container', 'Creating container...');
    const session = await this.getOrCreateContainer(projectId);

    // Clone if needed
    if (repoUrl) {
      const hasFiles = await fileService.exists(projectId, 'package.json');
      if (!hasFiles) {
        onProgress?.('clone', 'Cloning repository...');
        await this.cloneRepository(projectId, repoUrl, githubToken);
      }
    }

    // Detect project
    onProgress?.('detect', 'Detecting project type...');
    const projectInfo = await projectDetectorService.detect(projectId);
    session.projectInfo = projectInfo;

    // Install deps
    if (projectInfo.type !== 'static' && projectInfo.type !== 'unknown') {
      onProgress?.('install', `Installing dependencies (${projectInfo.packageManager || 'npm'})...`);
      await dependencyService.install(projectId, session, projectInfo);
    }

    // Start dev server — throws with specific error message if it crashes
    onProgress?.('server', `Starting ${projectInfo.type} dev server...`);
    await devServerService.start(session, projectInfo);

    session.preparedAt = Date.now();
    await sessionService.set(projectId, session);

    // Start file watcher
    fileWatcherService.startWatching(projectId).catch(() => {});

    const elapsed = Date.now() - startTime;
    onProgress?.('starting', `Preview ready (${elapsed}ms)`);
    log.info(`[Workspace] Preview started for ${projectId} in ${elapsed}ms`);

    return {
      success: true,
      previewUrl: this.buildPreviewUrl(session),
      agentUrl: session.agentUrl,
      containerId: session.containerId,
      projectInfo,
    };
  }

  /**
   * Stop preview (kill dev server, keep container)
   */
  async stopPreview(projectId: string): Promise<void> {
    const session = await sessionService.get(projectId);
    if (session) {
      await devServerService.stop(session);
    }
  }

  /**
   * Release container entirely
   */
  async release(projectId: string): Promise<void> {
    fileWatcherService.stopWatching(projectId);
    // Kill dev server before destroying container
    const session = await sessionService.get(projectId);
    if (session) {
      await devServerService.stop(session).catch(() => {});
    }
    await containerLifecycleService.destroy(projectId);
  }

  /**
   * Execute a command inside the container
   */
  async exec(projectId: string, command: string, cwd = '/home/coder/project'): Promise<ExecResult> {
    const session = await this.getOrCreateContainer(projectId);
    return dockerService.exec(session.agentUrl, command, cwd);
  }

  /**
   * Clone a repository to the project directory on NVMe
   */
  async cloneRepository(projectId: string, repoUrl: string, token?: string): Promise<Result> {
    const projectDir = path.join(config.projectsRoot, projectId);

    // Skip if directory already has files (already cloned)
    const hasFiles = await fileService.exists(projectId, '.git');
    if (hasFiles) {
      log.info(`[Workspace] Already cloned for ${projectId}, skipping`);
      return { success: true };
    }

    let cloneUrl = repoUrl;
    if (token && repoUrl.includes('github.com') && !repoUrl.includes('@')) {
      cloneUrl = repoUrl.replace('https://', `https://${token}@`);
    }

    log.info(`[Workspace] Cloning ${repoUrl} to ${projectId}`);
    const result = await execShell(
      `git clone --depth 1 "${cloneUrl}" "${projectDir}"`,
      '/tmp',
      120000,
    );

    if (result.exitCode !== 0) {
      log.error(`[Workspace] Clone failed: ${result.stderr}`);
      return { success: false, error: result.stderr };
    }

    log.info(`[Workspace] Clone complete for ${projectId}`);
    return { success: true };
  }

  /**
   * List files for a project (reads NVMe directly, no container needed)
   */
  async listFiles(projectId: string): Promise<{ path: string; size?: number }[]> {
    const result = await fileService.listAllFiles(projectId);
    return result.data || [];
  }

  /**
   * Build the preview URL for a session.
   * Routes through the backend proxy so iOS only needs to reach port 3001.
   */
  private buildPreviewUrl(session: Session): string {
    return `http://localhost:${config.port}/preview/${session.projectId}/`;
  }
}

export const workspaceService = new WorkspaceService();
