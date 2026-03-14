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
import { caseSensitivityService } from './case-sensitivity.service';
import { execShell, shellEscape } from '../utils/helpers';
import { config } from '../config';
import path from 'path';

const HEALTH_CHECK_TTL = 30_000; // 30 seconds

class WorkspaceService {
  /**
   * Get or create a container for a user+project.
   * This is the main entry point — all operations go through here.
   */
  async getOrCreateContainer(projectId: string, userId: string): Promise<Session> {
    return sessionService.withLock(projectId, userId, async () => {
      // Check existing session for this user+project
      const existing = await sessionService.get(projectId, userId);
      if (existing) {
        // Skip health check if recently verified (saves ~100-200ms per message)
        const now = Date.now();
        if (existing.lastHealthCheck && (now - existing.lastHealthCheck) < HEALTH_CHECK_TTL) {
          existing.lastUsed = now;
          await sessionService.set(projectId, userId, existing);
          return existing;
        }

        const healthy = await containerLifecycleService.isHealthy(existing.agentUrl);
        if (healthy) {
          existing.lastUsed = now;
          existing.lastHealthCheck = now;
          await sessionService.set(projectId, userId, existing);
          return existing;
        }
        // Container dead — clean up and recreate
        log.warn(`[Workspace] Container for ${userId}:${projectId} unhealthy, recreating`);
        await containerLifecycleService.destroy(projectId, userId).catch(() => {});
      }

      // Keep multiple active project containers per user up to a bounded limit.
      // Evict least recently used containers when the user exceeds the limit.
      const otherSessions = await sessionService.getByUserId(userId);
      const existingOtherSessions = otherSessions.filter(s => s.projectId !== projectId);
      const maxActive = Math.max(1, config.maxActiveContainersPerUser);
      if (existingOtherSessions.length >= maxActive) {
        const overflow = existingOtherSessions.length - maxActive + 1;
        const toEvict = [...existingOtherSessions]
          .sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0))
          .slice(0, overflow);

        for (const evict of toEvict) {
          log.info(`[Workspace] Evicting LRU container for ${userId}: ${evict.projectId}`);
          fileWatcherService.stopWatching(evict.projectId);
          await devServerService.stop(evict).catch(() => {});
          await containerLifecycleService.destroy(evict.projectId, userId).catch(e =>
            log.warn(`[Workspace] Failed to evict ${evict.projectId}: ${e.message}`)
          );
        }
      }

      // Create new container — NVMe bind mount means files are immediately available
      const container = await containerLifecycleService.create(projectId);
      const session: Session = {
        containerId: container.id,
        projectId,
        userId,
        agentUrl: container.agentUrl,
        previewPort: container.previewPort,
        serverId: container.serverId,
        createdAt: container.createdAt,
        lastUsed: Date.now(),
      };

      await sessionService.set(projectId, userId, session);
      return session;
    });
  }

  /**
   * Warm up a project: create container + install deps + start dev server in background.
   * Called by /fly/clone. Returns quickly, work continues in background.
   */
  async warmProject(projectId: string, userId: string, repoUrl?: string, githubToken?: string, branch?: string): Promise<Result> {
    const session = await this.getOrCreateContainer(projectId, userId);

    // If repo URL provided and no files exist, clone
    if (repoUrl) {
      const hasFiles = await fileService.exists(projectId, 'package.json');
      if (!hasFiles) {
        await this.cloneRepository(projectId, repoUrl, githubToken, branch);
      }
    }

    // Fix macOS→Linux case-sensitivity mismatches in imports
    await caseSensitivityService.fix(projectId);

    // Detect project type
    const projectInfo = await projectDetectorService.detect(projectId);
    session.projectInfo = projectInfo;
    await sessionService.set(projectId, userId, session);

    // Console projects don't have a persistent server — skip isRunning check
    if (projectInfo.hasWebUI !== false) {
      // Check if dev server already running (fast path for re-warm)
      if (await devServerService.isRunning(session.agentUrl)) {
        log.info(`[Workspace] Dev server already running for ${projectId} — skip warming`);
        return { success: true };
      }
    }

    // Background: install + start dev server
    setImmediate(async () => {
      try {
        log.info(`[Workspace] Background warming ${projectId}...`);

        // Install dependencies (skip for console projects without deps and static/unknown)
        const skipInstall = projectInfo.type === 'static' || projectInfo.type === 'unknown'
          || (projectInfo.hasWebUI === false && !projectInfo.installCommand);
        if (!skipInstall) {
          await dependencyService.install(projectId, session, projectInfo);
        }

        // Start dev server (or run console program)
        await devServerService.start(session, projectInfo);
        session.preparedAt = Date.now();
        await sessionService.set(projectId, userId, session);

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
    userId: string,
    onProgress?: ProgressCallback,
    repoUrl?: string,
    githubToken?: string,
    onLog?: (line: string) => void,
  ): Promise<PreviewResult> {
    const startTime = Date.now();

    // Fast path: session exists + dev server running (or console project with container ready)
    const existingSession = await sessionService.get(projectId, userId);
    if (existingSession) {
      // Console projects: if container exists AND agent healthy, return immediately
      // (the frontend interactive terminal handles program execution via WebSocket PTY)
      const storedInfo = existingSession.projectInfo;
      if (storedInfo?.hasWebUI === false) {
        const agentHealthy = await containerLifecycleService.isHealthy(existingSession.agentUrl);
        if (agentHealthy) {
          const freshInfo = await projectDetectorService.detect(projectId);
          if (freshInfo.hasWebUI === false) {
            const elapsed = Date.now() - startTime;
            log.info(`[Workspace] Console fast path for ${projectId} — ${elapsed}ms (container ready, PTY will execute)`);
            onProgress?.('starting', `Terminal ready (${elapsed}ms)`);
            return {
              success: true,
              previewUrl: undefined,
              agentUrl: existingSession.agentUrl,
              containerId: existingSession.containerId,
              previewToken: existingSession.accessToken,
              projectInfo: freshInfo,
              hasWebUI: false,
            };
          }
        } else {
          log.warn(`[Workspace] Console fast path: agent unhealthy for ${projectId}, falling through to slow path`);
        }
      }

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
            // Stale .next cache chunk (e.g. "./828.js") — clear cache and fall through to slow path
            if (/Modulo non trovato: \.\/\d+\.js/.test(appError)) {
              log.warn(`[Workspace] Stale .next cache detected, clearing and restarting for ${projectId}`);
              await devServerService.stop(existingSession).catch(() => {});
              await dockerService.exec(existingSession.agentUrl, 'rm -rf .next', '/home/coder/project', 30000, true).catch(() => {});
              existingSession.projectInfo = freshInfo;
              // Fall through to slow path
            } else {
              throw new Error(appError);
            }
          }

          const elapsed = Date.now() - startTime;
          log.info(`[Workspace] Fast path for ${projectId} — ${elapsed}ms`);
          onProgress?.('starting', `Preview ready (fast path, ${elapsed}ms)`);
          const fastPathInfo = existingSession.projectInfo || freshInfo;
          return {
            success: true,
            previewUrl: fastPathInfo.hasWebUI === false ? undefined : this.buildPreviewUrl(existingSession),
            agentUrl: existingSession.agentUrl,
            containerId: existingSession.containerId,
            previewToken: existingSession.accessToken,
            projectInfo: fastPathInfo,
            hasWebUI: fastPathInfo.hasWebUI !== false,
          };
        }
      }
    }

    // Slow path: full setup
    onProgress?.('container', 'Creating container...');
    const session = await this.getOrCreateContainer(projectId, userId);

    // Clone if needed
    if (repoUrl) {
      const hasFiles = await fileService.exists(projectId, 'package.json');
      if (!hasFiles) {
        onProgress?.('clone', 'Cloning repository...');
        await this.cloneRepository(projectId, repoUrl, githubToken);
      }
    }

    // Fix macOS→Linux case-sensitivity mismatches in imports (e.g. leftbar.scss vs leftBar.scss)
    const caseFixes = await caseSensitivityService.fix(projectId);
    if (caseFixes > 0) {
      log.info(`[Workspace] Fixed ${caseFixes} case-sensitivity mismatch(es) for ${projectId}`);
    }

    // Detect project
    onProgress?.('detect', 'Detecting project type...');
    const projectInfo = await projectDetectorService.detect(projectId);
    session.projectInfo = projectInfo;

    // Install deps (skip for console projects without installCommand and static/unknown)
    const skipInstall = projectInfo.type === 'static' || projectInfo.type === 'unknown'
      || (projectInfo.hasWebUI === false && !projectInfo.installCommand);
    if (!skipInstall) {
      onProgress?.('install', `Installing dependencies (${projectInfo.packageManager || 'bun'})...`);
      await dependencyService.install(projectId, session, projectInfo, (message) => {
        onProgress?.('install', message);
      }, onLog);
    }

    // Start dev server (console projects skip — frontend PTY handles execution)
    if (projectInfo.hasWebUI === false) {
      // Console: container is ready, frontend interactive terminal will execute via WebSocket PTY
      onProgress?.('server', `Terminal ready for ${projectInfo.type}`);
    } else {
      // Web: start dev server via /setup (long-running)
      onProgress?.('server', `Starting ${projectInfo.type} dev server...`);
      onLog?.(`$ ${projectInfo.startCommand}`);
      await devServerService.start(session, projectInfo);
    }

    session.preparedAt = Date.now();
    await sessionService.set(projectId, userId, session);

    // Start file watcher
    fileWatcherService.startWatching(projectId).catch(() => {});

    const elapsed = Date.now() - startTime;
    onProgress?.('starting', projectInfo.hasWebUI === false ? `Terminal ready (${elapsed}ms)` : `Preview ready (${elapsed}ms)`);
    log.info(`[Workspace] Preview started for ${userId}:${projectId} in ${elapsed}ms`);

    return {
      success: true,
      previewUrl: projectInfo.hasWebUI === false ? undefined : this.buildPreviewUrl(session),
      agentUrl: session.agentUrl,
      containerId: session.containerId,
      previewToken: session.accessToken,
      projectInfo,
      hasWebUI: projectInfo.hasWebUI !== false,
    };
  }

  /**
   * Stop preview (kill dev server, keep container)
   */
  async stopPreview(projectId: string, userId: string): Promise<void> {
    const session = await sessionService.get(projectId, userId);
    if (session) {
      await devServerService.stop(session);
    }
  }

  /**
   * Release container entirely
   */
  async release(projectId: string, userId: string): Promise<void> {
    fileWatcherService.stopWatching(projectId);
    // Kill dev server before destroying container
    const session = await sessionService.get(projectId, userId);
    if (session) {
      await devServerService.stop(session).catch(() => {});
    }
    await containerLifecycleService.destroy(projectId, userId);
  }

  /**
   * Execute a command inside the container
   */
  async exec(projectId: string, userId: string, command: string, cwd = '/home/coder/project'): Promise<ExecResult> {
    const session = await this.getOrCreateContainer(projectId, userId);
    return dockerService.exec(session.agentUrl, command, cwd);
  }

  /**
   * Clone a repository to the project directory on NVMe
   * Supports GitHub, GitLab, Bitbucket, and Gitea
   */
  async cloneRepository(projectId: string, repoUrl: string, token?: string, branch?: string): Promise<Result> {
    const projectDir = path.join(config.projectsRoot, projectId);

    // Skip if directory already has files (already cloned)
    const hasFiles = await fileService.exists(projectId, '.git');
    if (hasFiles) {
      log.info(`[Workspace] Already cloned for ${projectId}, skipping`);
      return { success: true };
    }

    let cloneUrl = repoUrl;
    if (token && !repoUrl.includes('@')) {
      // Build authenticated URL based on provider
      const lowerUrl = repoUrl.toLowerCase();

      if (lowerUrl.includes('github.com')) {
        // GitHub: https://{token}@github.com/...
        cloneUrl = repoUrl.replace('https://', `https://${token}@`);
      } else if (lowerUrl.includes('gitlab.com') || lowerUrl.includes('gitlab.')) {
        // GitLab: https://oauth2:{token}@gitlab.com/...
        cloneUrl = repoUrl.replace('https://', `https://oauth2:${token}@`);
      } else if (lowerUrl.includes('bitbucket.org') || lowerUrl.includes('bitbucket.')) {
        // Bitbucket: token is already "username:app_password"
        cloneUrl = repoUrl.replace('https://', `https://${token}@`);
      } else {
        // Generic (Gitea, self-hosted): https://{token}@server/...
        cloneUrl = repoUrl.replace('https://', `https://${token}@`);
      }
    }

    log.info(`[Workspace] Cloning ${repoUrl} to ${projectId}${branch ? ` (branch: ${branch})` : ''}`);
    const branchFlag = branch ? `--branch ${shellEscape(branch)} ` : '';
    const result = await execShell(
      `git -c safe.directory='*' clone --depth 1 ${branchFlag}${shellEscape(cloneUrl)} ${shellEscape(projectDir)}`,
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
    const base = config.publicUrl || `http://localhost:${config.port}`;
    return `${base}/preview/${session.projectId}/`;
  }
}

export const workspaceService = new WorkspaceService();
