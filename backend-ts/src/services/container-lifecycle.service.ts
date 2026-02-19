import { config } from '../config';
import { log } from '../utils/logger';
import { ContainerInfo, CreateContainerOptions } from '../types';
import { dockerService } from './docker.service';
import { sessionService } from './session.service';
import { fileService } from './file.service';

class ContainerLifecycleService {
  private reaperInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Create a new container for a project with NVMe bind mounts
   */
  async create(projectId: string): Promise<ContainerInfo> {
    // Ensure project directory and .next cache dir exist on NVMe
    await fileService.ensureProjectDir(projectId);
    const { default: fs } = await import('fs/promises');
    const projectPath = `${config.projectsRoot}/${projectId}`;
    const nextCachePath = `${config.cacheRoot}/next-build/${projectId}`;
    const ownershipMarker = `${config.cacheRoot}/ownership/${projectId}.ok`;
    await fs.mkdir(`${config.cacheRoot}/ownership`, { recursive: true });
    await fs.mkdir(nextCachePath, { recursive: true });

    const { execSync } = await import('child_process');

    // Always chown the .next cache dir — it may be recreated as root on container
    // recreation (mkdir -p runs as root) and must be writable by container user (1000:1000).
    // This dir is typically empty so chown is cheap.
    try {
      execSync(`chown 1000:1000 "${nextCachePath}"`, { timeout: 5000 });
    } catch (e: any) {
      log.warn(`[Lifecycle] chown .next cache failed (non-fatal): ${e.message}`);
    }

    // Fix project dir ownership only once — expensive for large repos.
    let needsOwnershipFix = false;
    try {
      await fs.access(ownershipMarker);
    } catch {
      needsOwnershipFix = true;
    }

    if (needsOwnershipFix) {
      try {
        execSync(`chown -R 1000:1000 "${projectPath}"`, { timeout: 10000 });
        await fs.writeFile(ownershipMarker, `${Date.now()}\n`).catch(() => {});
      } catch (e: any) {
        log.warn(`[Lifecycle] chown project dir failed (non-fatal): ${e.message}`);
      }
    }

    const container = await dockerService.createContainer({ projectId });

    // Wait for agent to be healthy
    const healthy = await dockerService.waitForAgent(container.agentUrl, 30000);
    if (!healthy) {
      log.warn(`[Lifecycle] Agent not healthy for ${container.id.substring(0, 12)}, proceeding anyway`);
    }

    return container;
  }

  /**
   * Destroy a container and clean up session
   */
  async destroy(projectId: string, userId: string): Promise<void> {
    const session = await sessionService.get(projectId, userId);
    if (session) {
      await dockerService.destroyContainer(session.containerId, session.serverId);
      await sessionService.deleteByContainerId(session.containerId);
      log.info(`[Lifecycle] Destroyed container for ${userId}:${projectId}`);
    }
  }

  /**
   * Check if a container is healthy (agent responding)
   */
  async isHealthy(agentUrl: string): Promise<boolean> {
    try {
      const result = await dockerService.exec(agentUrl, 'echo ok', '/home/coder', 3000, true);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Start the idle reaper — checks every 60s for containers idle > timeout
   */
  startIdleReaper(): void {
    if (this.reaperInterval) return;

    this.reaperInterval = setInterval(async () => {
      try {
        const sessions = await sessionService.getAll();
        const now = Date.now();
        const timeout = config.containerIdleTimeoutMs;

        for (const session of sessions) {
          if (now - session.lastUsed > timeout) {
            log.info(`[Lifecycle] Reaping idle container for ${session.userId}:${session.projectId} (idle ${Math.round((now - session.lastUsed) / 60000)}min)`);
            await this.destroy(session.projectId, session.userId).catch(e =>
              log.warn(`[Lifecycle] Reap failed for ${session.userId}:${session.projectId}: ${e.message}`)
            );
          }
        }
      } catch (e: any) {
        log.error(`[Lifecycle] Reaper error: ${e.message}`);
      }
    }, 60000);

    log.info(`[Lifecycle] Idle reaper started (timeout: ${config.containerIdleTimeoutMs / 60000}min)`);
  }

  stopIdleReaper(): void {
    if (this.reaperInterval) {
      clearInterval(this.reaperInterval);
      this.reaperInterval = null;
    }
  }

  /**
   * Adopt existing Docker containers on startup
   */
  async adoptExisting(): Promise<number> {
    const containers = await dockerService.listContainers();
    let adopted = 0;

    for (const c of containers) {
      if (c.state !== 'running' || !c.projectId || !c.agentUrl) continue;

      // Check if any session already has this container
      const existingByContainer = await sessionService.getByContainerId(c.id);
      if (existingByContainer) continue;

      const uid = 'legacy';
      await sessionService.set(c.projectId, uid, {
        containerId: c.id,
        projectId: c.projectId,
        userId: uid,
        agentUrl: c.agentUrl,
        previewPort: c.previewPort,
        serverId: c.serverId,
        createdAt: c.createdAt,
        lastUsed: Date.now(),
      });
      adopted++;
    }

    if (adopted > 0) {
      log.info(`[Lifecycle] Adopted ${adopted} existing containers`);
    }
    return adopted;
  }
}

export const containerLifecycleService = new ContainerLifecycleService();
