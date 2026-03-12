import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';
import { log } from '../utils/logger';
import { Session, ProjectInfo, ExecResult } from '../types';
import { dockerService } from './docker.service';
import { shellEscape } from '../utils/helpers';

const NODE_MODULES_CACHE_DIR = '/data/cache/node-modules';
const HASH_FILE = '.package-json-hash';
type InstallProgress = (message: string) => void;
type InstallLogCallback = (line: string) => void;

class DependencyService {
  private installLocks = new Map<string, Promise<void>>();

  /**
   * Install dependencies inside a container.
   * Uses hash-based caching: if package.json hasn't changed, skip install entirely.
   * Per-project lock prevents concurrent installs (warmup + preview race).
   */
  async install(
    projectId: string,
    session: Session,
    info: ProjectInfo,
    onProgress?: InstallProgress,
    onLog?: InstallLogCallback,
  ): Promise<void> {
    // If another install is in progress for this project, wait for it
    const existing = this.installLocks.get(projectId);
    if (existing) {
      log.info(`[Deps] Install already in progress for ${projectId} — waiting...`);
      onProgress?.('Install already in progress, waiting for completion...');
      await existing;
      return;
    }

    const promise = this.doInstall(projectId, session, info, onProgress, onLog);
    this.installLocks.set(projectId, promise);
    try {
      await promise;
    } finally {
      this.installLocks.delete(projectId);
    }
  }

  private async doInstall(
    projectId: string,
    session: Session,
    info: ProjectInfo,
    onProgress?: InstallProgress,
    onLog?: InstallLogCallback,
  ): Promise<void> {
    const { agentUrl } = session;
    const projectDir = path.join(config.projectsRoot, projectId);
    const startTime = Date.now();

    // Detect monorepo subdirectory from installCommand (e.g. "cd client && npm install")
    const subdir = this.extractSubdir(info.installCommand);
    const effectiveDir = subdir ? path.join(projectDir, subdir) : projectDir;
    const containerCwd = subdir ? `/home/coder/project/${subdir}` : '/home/coder/project';

    // 1. Calculate current hash from package.json + lockfile
    onProgress?.('Analyzing dependency state...');
    let currentHash = await this.calculateHash(effectiveDir, info.packageManager);
    if (!currentHash) {
      // Some app-router layouts bootstrap package.json during installCommand
      // (e.g. copy app/package.json -> root before npm install).
      if (!info.installCommand) {
        log.info(`[Deps] No package.json found in ${subdir || 'root'} — skipping install`);
        onProgress?.('No package.json found, skipping dependency install');
        return;
      }

      log.info(`[Deps] No package.json hash in ${subdir || 'root'} — running bootstrap install command`);
      onProgress?.('Running bootstrap dependency install...');
      await this.runInstallWithRetry(agentUrl, info.installCommand, onProgress, onLog);

      // Recompute hash after bootstrap install; if still unavailable, just return.
      currentHash = await this.calculateHash(effectiveDir, info.packageManager);
      if (!currentHash) {
        log.warn(`[Deps] Bootstrap install completed but package.json hash is still unavailable in ${subdir || 'root'}`);
        onProgress?.('Bootstrap install completed, but hash is still unavailable');
        return;
      }

      await this.saveHash(effectiveDir, currentHash);
      await this.saveToCache(agentUrl, currentHash, containerCwd).catch(e =>
        log.warn(`[Deps] Failed to save cache: ${e.message}`)
      );
      onProgress?.('Bootstrap dependency install completed');
      log.info(`[Deps] Bootstrap install completed in ${Date.now() - startTime}ms`);
      return;
    }

    // 2. Check saved hash (LIVELLO 1: same project, same container)
    const savedHash = await this.getSavedHash(effectiveDir);
    if (savedHash && savedHash === currentHash) {
      // Verify node_modules actually exists
      const nmExists = await this.nodeModulesExists(effectiveDir);
      if (nmExists) {
        // Also verify native binaries aren't truncated (SIGBUS protection)
        const binariesOk = await this.verifyNativeBinaries(agentUrl);
        if (binariesOk) {
          log.info(`[Deps] Hash match (${currentHash.substring(0, 8)}) — SKIP INSTALL`);
          onProgress?.('Dependencies already installed (cache hit), skipping install');
          return;
        }
        log.warn(`[Deps] Hash match but native binaries are corrupt — reinstalling`);
        onProgress?.('Corrupted native binaries detected, reinstalling...');
        await this.cleanupBeforeRetry(agentUrl);
        await this.saveHash(effectiveDir, '');
      } else {
        log.info(`[Deps] Hash matches but node_modules missing — reinstalling`);
        onProgress?.('Dependencies hash matched, but node_modules is missing. Reinstalling...');
      }
    }

    // 3. Try to restore from NVMe cache (LIVELLO 2)
    onProgress?.('Checking NVMe dependency cache...');
    const cacheRestored = await this.restoreFromCache(agentUrl, currentHash, containerCwd);
    if (cacheRestored) {
      // Verify restored cache isn't corrupt
      const restoredOk = await this.verifyNativeBinaries(agentUrl);
      if (restoredOk) {
        log.info(`[Deps] Restored from NVMe cache in ${Date.now() - startTime}ms`);
        await this.saveHash(effectiveDir, currentHash);
        onProgress?.('Dependencies restored from NVMe cache');
        return;
      }
      log.warn(`[Deps] Cache restored but native binaries are corrupt — fresh install needed`);
      onProgress?.('Cache corrupted, performing fresh install...');
      await this.cleanupBeforeRetry(agentUrl);
      await this.deleteCacheEntry(currentHash);
    }

    // 4. Fresh install (LIVELLO 3) — with retry
    // Always clean node_modules before fresh install. A previous install may have been
    // killed mid-write (e.g. warmProject container destroyed while npm was extracting),
    // leaving truncated native binaries on the shared NVMe mount. npm won't re-extract
    // packages it thinks are already installed, so we must start clean.
    log.info(`[Deps] Fresh install with ${info.packageManager || 'npm'} in ${subdir || 'root'}...`);
    onProgress?.(`Cleaning up and running ${info.packageManager || 'npm'} install...`);
    await this.cleanupBeforeRetry(agentUrl);
    const installCmd = info.installCommand || 'npm install';
    await this.runInstallWithRetry(agentUrl, installCmd, onProgress, onLog);

    log.info(`[Deps] Install completed in ${Date.now() - startTime}ms`);
    onProgress?.('Dependency install completed');

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
        .update(config.workspaceImage)
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
    await this.pruneNodeModulesCache();
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
   * Keep node_modules cache bounded on NVMe to avoid unbounded disk growth.
   * Evicts oldest tarballs first until we're back under 85% of max size.
   */
  private async pruneNodeModulesCache(): Promise<void> {
    const maxBytes = config.nodeModulesCacheMaxMb * 1024 * 1024;
    const targetBytes = Math.floor(maxBytes * 0.85);

    try {
      const entries = await fs.readdir(NODE_MODULES_CACHE_DIR, { withFileTypes: true }).catch(() => []);
      const files = entries
        .filter(e => e.isFile() && e.name.endsWith('.tar.gz'))
        .map(e => path.join(NODE_MODULES_CACHE_DIR, e.name));

      if (files.length === 0) return;

      const stats = await Promise.all(files.map(async (filePath) => {
        const st = await fs.stat(filePath);
        return { filePath, size: st.size, mtimeMs: st.mtimeMs };
      }));

      let totalSize = stats.reduce((sum, f) => sum + f.size, 0);
      if (totalSize <= maxBytes) return;

      const byOldestFirst = [...stats].sort((a, b) => a.mtimeMs - b.mtimeMs);
      let removed = 0;
      let freed = 0;
      for (const file of byOldestFirst) {
        if (totalSize <= targetBytes) break;
        await fs.rm(file.filePath, { force: true });
        totalSize -= file.size;
        freed += file.size;
        removed++;
      }

      if (removed > 0) {
        log.info(`[Deps] Cache eviction: removed ${removed} tarballs, freed ${(freed / 1024 / 1024).toFixed(1)}MB`);
      }
    } catch (e: any) {
      log.warn(`[Deps] Cache eviction skipped: ${e.message}`);
    }
  }

  /**
   * Extract subdirectory from installCommand like "cd client && npm install" → "client"
   */
  private extractSubdir(installCommand?: string): string | null {
    if (!installCommand) return null;
    const match = installCommand.match(/^cd\s+(\S+)\s+&&/);
    return match ? match[1] : null;
  }

  private withLiveInstallLogging(command: string): string {
    const escapedCommand = shellEscape(command);
    const wrapped = [
      'PRIMARY_LOG=/home/coder/server.log',
      'LOG_FILE="$PRIMARY_LOG"',
      // Some old sessions left server.log owned by root; recreate it as coder when possible.
      'if [ -e "$PRIMARY_LOG" ] && [ ! -w "$PRIMARY_LOG" ]; then rm -f "$PRIMARY_LOG" 2>/dev/null || true; fi',
      'touch "$PRIMARY_LOG" 2>/dev/null || true',
      'if [ ! -w "$PRIMARY_LOG" ]; then LOG_FILE=/tmp/drape-server.log; touch "$LOG_FILE" 2>/dev/null || true; fi',
      // Force non-interactive output so package managers emit line logs (not hidden TTY spinners).
      'export CI=1 TERM=dumb FORCE_COLOR=0 npm_config_color=false npm_config_progress=false npm_config_loglevel=info YARN_ENABLE_PROGRESS_BARS=0',
      `RUN_CMD=${escapedCommand}`,
      // Force line-buffered output so install logs are visible in near real-time via /fly/logs SSE.
      'if command -v stdbuf >/dev/null 2>&1; then stdbuf -oL -eL bash -c "$RUN_CMD" 2>&1 | tee -a "$LOG_FILE"; EXIT_CODE=${PIPESTATUS[0]}; else bash -c "$RUN_CMD" 2>&1 | tee -a "$LOG_FILE"; EXIT_CODE=${PIPESTATUS[0]}; fi',
      // If fallback file was used, mirror recent lines back to primary log when writable.
      'if [ "$LOG_FILE" != "$PRIMARY_LOG" ] && [ -f "$LOG_FILE" ] && [ -w "$PRIMARY_LOG" ]; then tail -n 500 "$LOG_FILE" >> "$PRIMARY_LOG" 2>/dev/null || true; fi',
      'exit $EXIT_CODE',
    ].join('; ');
    return `bash -c ${shellEscape(wrapped)}`;
  }

  private async runInstallWithRetry(
    agentUrl: string,
    installCmd: string,
    onProgress?: InstallProgress,
    onLog?: InstallLogCallback,
  ): Promise<void> {
    const maxInstallAttempts = 3;
    let effectiveCmd = installCmd;

    // Prevent bun lockfile migration issues: if using bun and the project has
    // package-lock.json but no bun.lockb, remove package-lock.json preemptively.
    // Bun 1.3.x has a known bug where migrating npm lockfiles causes IntegrityCheckFailed.
    // Fresh resolve from package.json works fine and avoids the migration entirely.
    if (effectiveCmd.includes('bun')) {
      try {
        const checkResult = await dockerService.exec(
          agentUrl,
          `test -f package-lock.json && ! test -f bun.lockb && ! test -f bun.lock && echo "NEEDS_CLEANUP" || echo "OK"`,
          '/home/coder/project',
          5000,
          true,
        );
        if ((checkResult.stdout || '').trim() === 'NEEDS_CLEANUP') {
          await dockerService.exec(agentUrl, 'rm -f package-lock.json', '/home/coder/project', 5000, true);
          log.info(`[Deps] Removed package-lock.json to prevent bun migration issues`);
        }
      } catch {
        // Best effort — if check fails, proceed normally
      }
    }

    for (let attempt = 1; attempt <= maxInstallAttempts; attempt++) {
      await this.prepareInstallLogFile(agentUrl, true);
      onProgress?.(`Installing dependencies (attempt ${attempt}/${maxInstallAttempts})...`);
      onLog?.(`$ ${effectiveCmd}`);
      let nextLine = 1;
      let polling = false;

      const flushNewLogs = async () => {
        if (polling) return;
        polling = true;
        try {
          const result = await dockerService.exec(
            agentUrl,
            this.buildInstallLogReadCommand(nextLine),
            '/home/coder',
            8000,
            true,
          );
          const lines = this.parseInstallLogChunk(result.stdout || '');
          if (lines.length > 0) {
            nextLine += lines.length;
            for (const line of lines) onLog?.(line);
          }
        } catch {
          // Best effort only; install command itself is authoritative.
        } finally {
          polling = false;
        }
      };

      const pollTimer = setInterval(() => {
        void flushNewLogs();
      }, 650);

      let result: ExecResult;
      try {
        const streamedInstallCmd = this.withLiveInstallLogging(effectiveCmd);
        result = await dockerService.exec(agentUrl, streamedInstallCmd, '/home/coder/project', 300000);

        // Retry without --frozen-lockfile if lockfile is incompatible
        if (result.exitCode !== 0 && effectiveCmd.includes('--frozen-lockfile')) {
          const errOutput = (result.stderr || result.stdout || '').trim();
          if (errOutput.includes('LOCKFILE_BREAKING_CHANGE') || errOutput.includes('not compatible') || errOutput.includes('IntegrityCheckFailed')) {
            const retryCmd = effectiveCmd.replace(/\s*--frozen-lockfile\s*/, ' ').trim();
            log.warn(`[Deps] Lockfile incompatible, retrying without --frozen-lockfile: ${retryCmd}`);
            onProgress?.('Lockfile incompatibile, retry senza --frozen-lockfile...');
            onLog?.(`$ ${retryCmd}`);
            result = await dockerService.exec(agentUrl, this.withLiveInstallLogging(retryCmd), '/home/coder/project', 300000);
          }
        }
      } catch (e: any) {
        result = {
          exitCode: 1,
          stdout: '',
          stderr: e?.message || 'Dependency install command failed',
        };
      } finally {
        clearInterval(pollTimer);
        await flushNewLogs();
      }

      if (result.exitCode === 0) {
        // Verify native binaries aren't truncated (e.g. SWC for Next.js).
        // A truncated .node file causes SIGBUS when Node tries to dlopen it.
        const integrityOk = await this.verifyNativeBinaries(agentUrl);
        if (integrityOk) return;

        log.warn(`[Deps] Install succeeded but native binaries are corrupt — treating as failure`);
        onProgress?.('Native binaries are corrupted, will retry install...');
        onLog?.('Warning: native binary integrity check failed after install');
        // Fall through to retry logic
        result = { exitCode: 1, stdout: '', stderr: 'Native binary integrity check failed' };
      }

      const errOutput = ((result.stderr || '') + '\n' + (result.stdout || '')).trim();
      const lines = errOutput.split('\n').filter(l => l.trim());
      const lastLines = lines.slice(-10).join('\n');

      if (attempt < maxInstallAttempts) {
        log.warn(`[Deps] Install attempt ${attempt}/${maxInstallAttempts} failed (exit ${result.exitCode}), retrying in 3s...`);
        onProgress?.(`Install attempt ${attempt} failed, retrying...`);
        onLog?.(`Install attempt ${attempt}/${maxInstallAttempts} failed (exit ${result.exitCode}). Retrying...`);

        // Detect bun integrity/migration failures.
        // Bun 1.3.x has a known bug where it miscalculates integrity hashes when
        // migrating from package-lock.json, causing IntegrityCheckFailed for certain packages.
        const isBunIntegrityError = errOutput.includes('IntegrityCheckFailed') ||
          errOutput.includes('Integrity check failed') ||
          errOutput.includes('migrated lockfile');

        if (isBunIntegrityError && effectiveCmd.includes('bun')) {
          if (attempt === 1) {
            // Attempt 2: retry bun WITHOUT the npm lockfile (fresh resolve, no migration).
            // The migration is what causes the integrity error — without package-lock.json,
            // bun resolves fresh from package.json and generates its own bun.lockb.
            log.warn(`[Deps] Bun integrity error on migration, will retry bun without npm lockfile`);
            onProgress?.('Errore migrazione lockfile, riprovo senza lockfile npm...');
            onLog?.(`Retrying bun install without package-lock.json (fresh resolve)`);
            await this.cleanupBeforeRetry(agentUrl, { clearBunCache: true, removeLockfiles: true });
          } else {
            // Attempt 3: bun failed twice, fall back to npm as last resort.
            effectiveCmd = effectiveCmd.replace(/\bbun\b/g, 'npm');
            log.warn(`[Deps] Bun failed twice, falling back to npm: ${effectiveCmd}`);
            onProgress?.('Bun incompatibile, fallback a npm...');
            onLog?.(`Switching to npm due to repeated bun integrity error`);
            // Restore package-lock.json from git for npm, clean bun artifacts
            await this.cleanupBeforeRetry(agentUrl, { clearBunCache: true, restoreLockfile: true });
          }
        } else {
          // Non-bun error: standard cleanup
          await this.cleanupBeforeRetry(agentUrl, {});
        }

        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      log.error(`[Deps] Install failed after ${maxInstallAttempts} attempts (exit ${result.exitCode}): ${lastLines.substring(0, 500)}`);
      throw new Error(`Installazione dipendenze fallita:\n${lastLines.substring(0, 300)}`);
    }
  }

  private async prepareInstallLogFile(agentUrl: string, truncate = false): Promise<void> {
    const prepCommand = [
      'PRIMARY_LOG=/home/coder/server.log',
      'FALLBACK_LOG=/tmp/drape-server.log',
      'if [ -e "$PRIMARY_LOG" ] && [ ! -w "$PRIMARY_LOG" ]; then rm -f "$PRIMARY_LOG" 2>/dev/null || true; fi',
      'touch "$PRIMARY_LOG" 2>/dev/null || true',
      'chmod 664 "$PRIMARY_LOG" 2>/dev/null || true',
      'touch "$FALLBACK_LOG" 2>/dev/null || true',
      truncate ? ': > "$PRIMARY_LOG" 2>/dev/null || true' : 'true',
      truncate ? ': > "$FALLBACK_LOG" 2>/dev/null || true' : 'true',
      'test -w "$PRIMARY_LOG" || test -w "$FALLBACK_LOG"',
    ].join('; ');

    try {
      const result = await dockerService.exec(
        agentUrl,
        `bash -c ${shellEscape(prepCommand)}`,
        '/home/coder',
        10000,
        true,
      );
      if (result.exitCode !== 0) {
        log.warn('[Deps] /home/coder/server.log not writable before install: live logs may be incomplete');
      }
    } catch (e: any) {
      log.warn(`[Deps] Failed to prepare install log file: ${e.message}`);
    }
  }

  private buildInstallLogReadCommand(startLine: number): string {
    const safeStart = Math.max(1, Math.floor(startLine));
    const command = [
      'PRIMARY_LOG=/home/coder/server.log',
      'FALLBACK_LOG=/tmp/drape-server.log',
      'LOG_FILE="$PRIMARY_LOG"',
      'if [ -f "$FALLBACK_LOG" ] && [ ! -f "$PRIMARY_LOG" ]; then LOG_FILE="$FALLBACK_LOG"; fi',
      'if [ -f "$FALLBACK_LOG" ] && [ -f "$PRIMARY_LOG" ] && [ "$FALLBACK_LOG" -nt "$PRIMARY_LOG" ]; then LOG_FILE="$FALLBACK_LOG"; fi',
      'if [ ! -f "$LOG_FILE" ]; then exit 0; fi',
      `awk 'NR>=${safeStart} { print }' "$LOG_FILE" 2>/dev/null`,
    ].join('; ');
    return `bash -c ${shellEscape(command)}`;
  }

  private async deleteCacheEntry(hash: string): Promise<void> {
    try {
      const cachePath = path.join(NODE_MODULES_CACHE_DIR, `${hash}.tar.gz`);
      await fs.rm(cachePath, { force: true });
      log.info(`[Deps] Deleted corrupt cache entry: ${hash.substring(0, 8)}.tar.gz`);
    } catch { /* ignore */ }
  }

  /**
   * Kill lingering install processes and remove corrupted node_modules before retry.
   * Prevents the race condition where a timed-out npm still writes while a new npm starts.
   */
  private async cleanupBeforeRetry(agentUrl: string, opts: { clearBunCache?: boolean; removeLockfiles?: boolean; restoreLockfile?: boolean } = {}): Promise<void> {
    try {
      const parts: string[] = [];
      if (opts.removeLockfiles) parts.push('rm -f package-lock.json yarn.lock');
      if (opts.clearBunCache) parts.push('rm -rf ~/.bun/install/cache 2>/dev/null');
      // Restore package-lock.json from git when falling back to npm
      if (opts.restoreLockfile) parts.push('git checkout package-lock.json 2>/dev/null || true');
      const extraCleanup = parts.length > 0 ? '; ' + parts.join('; ') : '';
      await dockerService.exec(
        agentUrl,
        // Kill any install processes, then remove node_modules and corrupted bun lockfile
        `pkill -f 'npm install' 2>/dev/null; pkill -f 'yarn install' 2>/dev/null; pkill -f 'pnpm install' 2>/dev/null; pkill -f 'bun install' 2>/dev/null; sleep 1; rm -rf node_modules bun.lockb${extraCleanup}`,
        '/home/coder/project',
        30000,
        true,
      );
      log.info(`[Deps] Cleanup before retry: node_modules + bun.lockb${opts.removeLockfiles ? ' + lockfiles' : ''}${opts.clearBunCache ? ' + bun cache' : ''}${opts.restoreLockfile ? ' + restored lockfile' : ''}`);
    } catch (e: any) {
      log.warn(`[Deps] Cleanup before retry failed: ${e.message}`);
    }
  }

  /**
   * Verify that native .node binaries are not truncated.
   * Checks ELF section header offset against actual file size.
   * A truncated binary causes SIGBUS when Node.js tries to dlopen it.
   */
  private async verifyNativeBinaries(agentUrl: string): Promise<boolean> {
    try {
      // Find all .node native binaries and check their ELF integrity
      const result = await dockerService.exec(
        agentUrl,
        `node -e "
const fs = require('fs');
const path = require('path');
if (!require('fs').existsSync('node_modules')) process.exit(0);
const glob = require('child_process').execSync(
  'find node_modules -name \"*.node\" -type f 2>/dev/null || true',
  { encoding: 'utf8', maxBuffer: 1024*1024 }
).trim().split('\\n').filter(Boolean);
let ok = true;
for (const f of glob) {
  try {
    const buf = Buffer.alloc(64);
    const fd = fs.openSync(f, 'r');
    fs.readSync(fd, buf, 0, 64, 0);
    fs.closeSync(fd);
    const fileSize = fs.statSync(f).size;
    if (fileSize < 64) continue;
    // ELF magic: 0x7f 'E' 'L' 'F'
    if (buf[0] !== 0x7f || buf[1] !== 0x45 || buf[2] !== 0x4c || buf[3] !== 0x46) continue;

    // EI_CLASS: 1=ELF32, 2=ELF64
    // EI_DATA: 1=little-endian, 2=big-endian
    const elfClass = buf[4];
    const elfData = buf[5];
    const littleEndian = elfData === 1;
    if (!(elfClass === 1 || elfClass === 2)) continue;
    if (!(elfData === 1 || elfData === 2)) continue;

    let shOff = 0;
    if (elfClass === 1) {
      // ELF32 section header offset @ 0x20 (4 bytes)
      shOff = littleEndian ? buf.readUInt32LE(32) : buf.readUInt32BE(32);
    } else {
      // ELF64 section header offset @ 0x28 (8 bytes)
      const off64 = littleEndian ? buf.readBigUInt64LE(40) : buf.readBigUInt64BE(40);
      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
      if (off64 > maxSafe) continue;
      shOff = Number(off64);
    }

    // shOff=0 is valid for binaries without section headers.
    if (shOff === 0) continue;
    if (shOff >= fileSize) {
      console.error('TRUNCATED:' + f + ':shoff=' + shOff + ':size=' + fileSize);
      ok = false;
    }
  } catch(e) { /* skip non-ELF files */ }
}
process.exit(ok ? 0 : 1);
"`,
        '/home/coder/project',
        15000,
        true,
      );

      if (result.exitCode !== 0) {
        log.warn(`[Deps] Native binary integrity check FAILED: ${result.stderr || result.stdout}`);
        return false;
      }
      return true;
    } catch (e: any) {
      log.warn(`[Deps] Native binary integrity check error: ${e.message}`);
      // On error, assume OK to avoid blocking installs
      return true;
    }
  }

  private parseInstallLogChunk(rawChunk: string): string[] {
    if (!rawChunk) return [];
    return rawChunk
      .replace(/\r/g, '\n')
      .replace(/\u0000/g, '')
      .split('\n')
      .map(line => line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trimEnd())
      .filter(line => line.trim().length > 0);
  }
}

export const dependencyService = new DependencyService();
