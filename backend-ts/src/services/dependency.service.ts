import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';
import { log } from '../utils/logger';
import { Session, ProjectInfo, ExecResult } from '../types';
import { dockerService } from './docker.service';

const NODE_MODULES_CACHE_DIR = '/data/cache/node-modules';
const HASH_FILE = '.package-json-hash';

class DependencyService {
  private installLocks = new Map<string, Promise<void>>();

  /**
   * Install dependencies inside a container.
   * Uses hash-based caching: if package.json hasn't changed, skip install entirely.
   * Per-project lock prevents concurrent installs (warmup + preview race).
   */
  async install(projectId: string, session: Session, info: ProjectInfo): Promise<void> {
    // If another install is in progress for this project, wait for it
    const existing = this.installLocks.get(projectId);
    if (existing) {
      log.info(`[Deps] Install already in progress for ${projectId} — waiting...`);
      await existing;
      return;
    }

    const promise = this.doInstall(projectId, session, info);
    this.installLocks.set(projectId, promise);
    try {
      await promise;
    } finally {
      this.installLocks.delete(projectId);
    }
  }

  private async doInstall(projectId: string, session: Session, info: ProjectInfo): Promise<void> {
    const { agentUrl } = session;
    const projectDir = path.join(config.projectsRoot, projectId);
    const startTime = Date.now();

    // Detect monorepo subdirectory from installCommand (e.g. "cd client && npm install")
    const subdir = this.extractSubdir(info.installCommand);
    const effectiveDir = subdir ? path.join(projectDir, subdir) : projectDir;
    const containerCwd = subdir ? `/home/coder/project/${subdir}` : '/home/coder/project';

    // 1. Calculate current hash from package.json + lockfile
    const currentHash = await this.calculateHash(effectiveDir, info.packageManager);
    if (!currentHash) {
      log.info(`[Deps] No package.json found in ${subdir || 'root'} — skipping install`);
      return;
    }

    // 2. Check saved hash (LIVELLO 1: same project, same container)
    const savedHash = await this.getSavedHash(effectiveDir);
    if (savedHash && savedHash === currentHash) {
      // Verify node_modules actually exists
      const nmExists = await this.nodeModulesExists(effectiveDir);
      if (nmExists) {
        log.info(`[Deps] Hash match (${currentHash.substring(0, 8)}) — SKIP INSTALL`);
        return;
      }
      log.info(`[Deps] Hash matches but node_modules missing — reinstalling`);
    }

    // 3. Try to restore from NVMe cache (LIVELLO 2)
    const cacheRestored = await this.restoreFromCache(agentUrl, currentHash, containerCwd);
    if (cacheRestored) {
      log.info(`[Deps] Restored from NVMe cache in ${Date.now() - startTime}ms`);
      await this.saveHash(effectiveDir, currentHash);
      return;
    }

    // 4. Fresh install (LIVELLO 3)
    log.info(`[Deps] Fresh install with ${info.packageManager || 'npm'} in ${subdir || 'root'}...`);
    let installCmd = info.installCommand || 'npm install';
    let result = await dockerService.exec(agentUrl, installCmd, '/home/coder/project', 300000);

    // Retry without --frozen-lockfile if lockfile is incompatible
    if (result.exitCode !== 0 && installCmd.includes('--frozen-lockfile')) {
      const errOutput = (result.stderr || result.stdout || '').trim();
      if (errOutput.includes('LOCKFILE_BREAKING_CHANGE') || errOutput.includes('not compatible')) {
        const retryCmd = installCmd.replace(/\s*--frozen-lockfile\s*/, ' ').trim();
        log.warn(`[Deps] Lockfile incompatible, retrying without --frozen-lockfile: ${retryCmd}`);
        result = await dockerService.exec(agentUrl, retryCmd, '/home/coder/project', 300000);
      }
    }

    if (result.exitCode !== 0) {
      // pnpm/npm may write errors to stdout or stderr — capture both
      const errOutput = (result.stderr || result.stdout || '').trim();
      // Extract the most useful part: last few lines often contain the real error
      const lines = errOutput.split('\n').filter(l => l.trim());
      const lastLines = lines.slice(-10).join('\n');
      log.error(`[Deps] Install failed (exit ${result.exitCode}): ${lastLines.substring(0, 500)}`);
      throw new Error(`Installazione dipendenze fallita:\n${lastLines.substring(0, 300)}`);
    }

    log.info(`[Deps] Install completed in ${Date.now() - startTime}ms`);

    // Save hash and cache
    await this.saveHash(effectiveDir, currentHash);
    await this.saveToCache(agentUrl, currentHash, containerCwd).catch(e =>
      log.warn(`[Deps] Failed to save cache: ${e.message}`)
    );
  }

  async calculateHash(projectDir: string, packageManager?: string): Promise<string | null> {
    try {
      const pkgPath = path.join(projectDir, 'package.json');
      const pkgContent = await fs.readFile(pkgPath, 'utf-8');

      let lockContent = '';
      const lockFiles = [
        packageManager === 'pnpm' ? 'pnpm-lock.yaml' : null,
        packageManager === 'yarn' ? 'yarn.lock' : null,
        'package-lock.json',
        'pnpm-lock.yaml',
        'yarn.lock',
      ].filter(Boolean) as string[];

      for (const lockFile of lockFiles) {
        try {
          lockContent = await fs.readFile(path.join(projectDir, lockFile), 'utf-8');
          break;
        } catch { continue; }
      }

      return crypto.createHash('md5')
        .update(pkgContent)
        .update(lockContent)
        .update(packageManager || 'npm')
        .digest('hex');
    } catch {
      return null;
    }
  }

  private async getSavedHash(projectDir: string): Promise<string | null> {
    try {
      return (await fs.readFile(path.join(projectDir, HASH_FILE), 'utf-8')).trim();
    } catch {
      return null;
    }
  }

  private async saveHash(projectDir: string, hash: string): Promise<void> {
    try {
      await fs.writeFile(path.join(projectDir, HASH_FILE), hash);
    } catch { /* ignore */ }
  }

  private async nodeModulesExists(projectDir: string): Promise<boolean> {
    try {
      await fs.access(path.join(projectDir, 'node_modules'));
      return true;
    } catch {
      return false;
    }
  }

  private async restoreFromCache(agentUrl: string, hash: string, containerCwd = '/home/coder/project'): Promise<boolean> {
    try {
      const cachePath = `${NODE_MODULES_CACHE_DIR}/${hash}.tar.gz`;
      const result = await dockerService.exec(
        agentUrl,
        `test -f ${cachePath} && tar -xzf ${cachePath} -C ${containerCwd} && echo "RESTORED" || echo "MISS"`,
        '/home/coder',
        60000,
        true,
      );
      return result.stdout.includes('RESTORED');
    } catch {
      return false;
    }
  }

  private async saveToCache(agentUrl: string, hash: string, containerCwd = '/home/coder/project'): Promise<void> {
    const cachePath = `${NODE_MODULES_CACHE_DIR}/${hash}.tar.gz`;
    await dockerService.exec(
      agentUrl,
      `mkdir -p ${NODE_MODULES_CACHE_DIR} && tar -czf ${cachePath} -C ${containerCwd} node_modules`,
      '/home/coder',
      120000,
      true,
    );
    log.info(`[Deps] Cached node_modules as ${hash.substring(0, 8)}.tar.gz`);
  }

  /**
   * Extract subdirectory from installCommand like "cd client && npm install" → "client"
   */
  private extractSubdir(installCommand?: string): string | null {
    if (!installCommand) return null;
    const match = installCommand.match(/^cd\s+(\S+)\s+&&/);
    return match ? match[1] : null;
  }
}

export const dependencyService = new DependencyService();
