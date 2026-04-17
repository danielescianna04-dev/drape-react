import axios from 'axios';
import { Session, ProjectInfo } from '../types';
import { log } from '../utils/logger';
import { dockerService } from './docker.service';
import { dependencyService } from './dependency.service';
import { shellEscape, sleep } from '../utils/helpers';
import { DEV_SERVER_PORT } from '../utils/constants';
import { appendRuntimeAction } from './build-report.service';
import { isLikelyDependencyCorruption } from '../utils/install-integrity';

class DevServerService {
  private startLocks = new Map<string, Promise<boolean>>();

  /**
   * Start the dev server inside a container.
   * Per-project lock prevents concurrent starts (warmup + preview race).
   */
  async start(session: Session, info: ProjectInfo): Promise<boolean> {
    const existing = this.startLocks.get(session.projectId);
    if (existing) {
      log.info(`[DevServer] Start already in progress for ${session.projectId} — waiting...`);
      return existing;
    }

    const promise = this.doStart(session, info);
    this.startLocks.set(session.projectId, promise);
    try {
      return await promise;
    } finally {
      this.startLocks.delete(session.projectId);
    }
  }

  private async doStart(
    session: Session,
    info: ProjectInfo,
    opts: { dependencyRepairAttempted?: boolean } = {},
  ): Promise<boolean> {
    const { agentUrl } = session;
    const startTime = Date.now();

    // Console projects: skip — frontend interactive terminal handles execution via WebSocket PTY
    if (info.hasWebUI === false) {
      log.info(`[DevServer] Console project — skipping (PTY terminal will execute)`);
      return true;
    }

    // Check if already running
    if (await this.isRunning(agentUrl)) {
      log.info(`[DevServer] Already running for ${session.projectId}`);
      return true;
    }

    log.info(`[DevServer] Starting: ${info.startCommand}`);

    // Next.js: clear stale .next cache before dev start — prevents ENOENT middleware-manifest.json.
    // .next is a bind mount (host: /data/cache/next-build/<project>), so we can't remove the
    // directory itself — only its contents. `find -mindepth 1 -delete` handles this correctly.
    if (info.type === 'nextjs') {
      try {
        await axios.post(`${agentUrl}/exec`, {
          command: 'find /home/coder/project/.next -mindepth 1 -delete 2>/dev/null || true',
          cwd: '/home/coder/project',
        }, { timeout: 10000, headers: { 'Content-Type': 'application/json' } });
        log.info(`[DevServer] Cleared .next cache contents for ${session.projectId}`);
      } catch {
        // ignore — might not exist
      }
    }

    // Use the agent's /setup endpoint for streaming output
    try {
      await axios.post(`${agentUrl}/setup`, {
        command: info.startCommand,
        cwd: '/home/coder/project',
      }, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      // /setup might not return immediately — that's fine
    }

    // Flutter still needs generous timeouts (build step).
    // Next.js now uses dev mode (fast startup, no build), so standard timeouts suffice.
    const isFlutter = info.type === 'flutter';
    const needsBuild = isFlutter;
    const readyTimeout = needsBuild ? 120000 : 60000;
    const crashDelay = needsBuild ? 90000 : 8000;

    // Wait for dev server to respond
    let result = await this.waitForReady(agentUrl, readyTimeout, crashDelay);
    if (!result.ready && await this.hasGracefulEarlyExit(agentUrl)) {
      log.warn(`[DevServer] /setup process exited early for ${session.projectId}; retrying detached start`);
      await this.startDetached(session, info.startCommand);
      // Skip crash detection during retry — the agent log buffer still has stale
      // "Process exited (code: 0)" from the /setup attempt which would false-positive.
      // The detached process writes to server.log but getRecentLogs prefers the agent
      // buffer, so detectCrash never sees the new process output.
      result = await this.waitForReady(agentUrl, 45000, 45000);
    }
    const elapsed = Date.now() - startTime;

    if (result.ready) {
      // Server responds, but check if it's returning 500 with known errors
      const appError = await this.checkResponseForErrors(agentUrl);
      if (appError) {
        log.warn(`[DevServer] Server running but app broken for ${session.projectId}: ${appError.substring(0, 100)}`);
        if (!opts.dependencyRepairAttempted && isLikelyDependencyCorruption(appError, info.type)) {
          log.warn(`[DevServer] Dependency corruption detected for ${session.projectId}, forcing reinstall before failing...`);
          await this.stop(session).catch(() => {});
          await dependencyService.repairCorruptedInstall(
            session.projectId,
            session,
            info,
            appError,
          );
          return this.doStart(session, info, { dependencyRepairAttempted: true });
        }
        throw new Error(appError);
      }
      log.info(`[DevServer] Ready in ${elapsed}ms for ${session.projectId}`);
      return true;
    }

    // If crash is a Next.js cache corruption (stale chunks, missing manifest, pack.gz ENOENT,
    // webpack module registry out of sync), clear .next contents and retry once.
    // Matches English and Italian error messages.
    const nextCacheCorruption = /Modulo non trovato: \.\/\d+\.js|Cannot find module '\.\/\d+\.js'|routes-manifest\.json|middleware-manifest\.json|webpack\/[^']+\.pack\.gz|MODULE_NOT_FOUND.*next\/dist\/server|__webpack_modules__\[[^\]]+\] is not a function|__webpack_require__\([^)]+\) is not a function|Loading chunk \d+ failed/;
    if (result.error && nextCacheCorruption.test(result.error)) {
      log.warn(`[DevServer] Next.js cache corruption detected for ${session.projectId}, clearing and retrying...`);
      await appendRuntimeAction(session.projectId, 'dev-server', 'Next.js cache corruption', {
        status: 'fixed',
        error: result.error.substring(0, 500),
        fix: 'Cleared .next cache contents and restarted dev server',
      });
      await dockerService.exec(session.agentUrl, 'find .next -mindepth 1 -delete 2>/dev/null || true', '/home/coder/project', 30000).catch(() => {});
      // Wait a moment for filesystem to settle after mass delete
      await new Promise(r => setTimeout(r, 500));
      await this.startDetached(session, info.startCommand);
      const retryResult = await this.waitForReady(agentUrl, readyTimeout, crashDelay);
      if (retryResult.ready) {
        log.info(`[DevServer] Ready after .next cache clear in ${Date.now() - startTime}ms for ${session.projectId}`);
        return true;
      }
      await appendRuntimeAction(session.projectId, 'dev-server', 'Dev server failed to start after cache clear', {
        status: 'failed',
        error: (retryResult.error || 'unknown').substring(0, 500),
      });
      throw new Error(retryResult.error || 'Il dev server non è riuscito ad avviarsi.');
    }

    if (result.error && !opts.dependencyRepairAttempted && isLikelyDependencyCorruption(result.error, info.type)) {
      log.warn(`[DevServer] Dependency corruption detected before readiness for ${session.projectId}, forcing reinstall...`);
      await this.stop(session).catch(() => {});
      await dependencyService.repairCorruptedInstall(
        session.projectId,
        session,
        info,
        result.error,
      );
      return this.doStart(session, info, { dependencyRepairAttempted: true });
    }

    log.warn(`[DevServer] Not ready after ${elapsed}ms for ${session.projectId}`);
    await appendRuntimeAction(session.projectId, 'dev-server', 'Dev server failed to start', {
      status: 'failed',
      error: (result.error || 'timeout').substring(0, 500),
      details: `Timeout after ${elapsed}ms`,
    });
    throw new Error(result.error || 'Il dev server non è riuscito ad avviarsi.');
  }

  /**
   * Clear the .next cache and restart the dev server. Used for runtime recovery
   * when the log-watcher detects webpack cache corruption errors AFTER the
   * server has been up and running. Rate-limited externally (log-watcher) to
   * avoid restart loops.
   */
  async clearCacheAndRestart(session: Session, info: ProjectInfo): Promise<boolean> {
    const { agentUrl } = session;
    log.info(`[DevServer] Runtime cache clear + restart for ${session.projectId}`);
    try {
      // Kill the current dev process
      await dockerService.exec(agentUrl,
        `pkill -f 'next dev' 2>/dev/null; pkill -f 'vite' 2>/dev/null; sleep 0.5`,
        '/home/coder/project', 10000, true,
      ).catch(() => {});

      // Clear .next cache contents (bind mount — can't rm the dir itself)
      if (info.type === 'nextjs') {
        await dockerService.exec(agentUrl,
          'find /home/coder/project/.next -mindepth 1 -delete 2>/dev/null || true',
          '/home/coder/project', 10000, true,
        ).catch(() => {});
      }

      // Restart the dev server detached
      await this.startDetached(session, info.startCommand);
      await new Promise(r => setTimeout(r, 800));

      // Wait briefly for readiness — don't block too long, this is a runtime recovery
      const result = await this.waitForReady(agentUrl, 30000, 5000);
      return result.ready;
    } catch (err: any) {
      log.warn(`[DevServer] Runtime cache clear + restart failed for ${session.projectId}: ${err.message}`);
      return false;
    }
  }

  private async startDetached(session: Session, command: string): Promise<void> {
    const escapedCommand = shellEscape(command);
    const wrapped = [
      'PRIMARY_LOG=/home/coder/server.log',
      'LOG_FILE="$PRIMARY_LOG"',
      'if [ -e "$PRIMARY_LOG" ] && [ ! -w "$PRIMARY_LOG" ]; then rm -f "$PRIMARY_LOG" 2>/dev/null || true; fi',
      'touch "$PRIMARY_LOG" 2>/dev/null || true',
      'if [ ! -w "$PRIMARY_LOG" ]; then LOG_FILE=/tmp/drape-server.log; touch "$LOG_FILE" 2>/dev/null || true; fi',
      `RUN_CMD=${escapedCommand}`,
      'bash -c "$RUN_CMD" >> "$LOG_FILE" 2>&1',
    ].join('; ');

    await dockerService.execDetached(
      session.containerId,
      wrapped,
      '/home/coder/project',
      true,
    );
  }

  private async hasGracefulEarlyExit(agentUrl: string): Promise<boolean> {
    const lines = await this.getRecentLogs(agentUrl, 80);
    if (lines.length === 0) return false;
    return lines.some((line) => /Process exited \(code:\s*0/i.test(this.stripAnsi(line)));
  }

  /**
   * Stop the dev server inside a container
   */
  async stop(session: Session): Promise<void> {
    // Clear any pending start lock so new containers don't wait on dead promises
    this.startLocks.delete(session.projectId);
    try {
      await dockerService.exec(
        session.agentUrl,
        `pkill -f "node.*dev" 2>/dev/null; fuser -k ${DEV_SERVER_PORT}/tcp 2>/dev/null; true`,
        '/home/coder',
        5000,
        true,
      );
      log.info(`[DevServer] Stopped for ${session.projectId}`);
    } catch { /* ignore */ }
  }

  /**
   * Check if dev server is responding inside the container
   */
  async isRunning(agentUrl: string): Promise<boolean> {
    try {
      const result = await dockerService.exec(
        agentUrl,
        `curl -s -o /dev/null -w "%{http_code}" http://localhost:${DEV_SERVER_PORT}/ 2>/dev/null || echo "000"`,
        '/home/coder',
        4000,
        true,
      );
      const statusCode = parseInt((result.stdout || '').trim()) || 0;
      // Accept any HTTP response (including 500) as "server is running"
      // App errors like missing env vars still mean the server started
      return statusCode >= 200;
    } catch {
      return false;
    }
  }

  /**
   * Check if the server responds with a 500 containing known app errors.
   * Returns error message if broken, null if OK.
   */
  async checkResponseForErrors(agentUrl: string): Promise<string | null> {
    try {
      const result = await dockerService.exec(
        agentUrl,
        `curl -s -w "\\n__STATUS__%{http_code}" http://localhost:${DEV_SERVER_PORT}/ 2>/dev/null`,
        '/home/coder',
        5000,
        true,
      );
      const output = result.stdout || '';
      const statusMatch = output.match(/__STATUS__(\d+)/);
      const statusCode = statusMatch ? parseInt(statusMatch[1]) : 200;

      // Only check body if server returned 500
      if (statusCode < 500) return null;

      const body = this.stripAnsi(output.replace(/__STATUS__\d+/, ''));

      // Check for missing env vars patterns
      const envPatterns = [
        /Invalid env[^\n]*provided/i,
        /Invalid environment variables/i,
        /missing or invalid.*variables/i,
        /Environment variable[s]? .* (?:is |are )?(?:not set|missing|required|undefined)/i,
      ];

      for (const pattern of envPatterns) {
        if (pattern.test(body)) {
          // Extract variable names from the body
          const missingVars = new Set<string>();

          // Pattern: "- VAR_NAME: Required" or "- VAR_NAME: invalid"
          const dashVarMatches = body.matchAll(/[-•]\s*(\w+)\s*:\s*(Required|invalid|missing)/gi);
          for (const m of dashVarMatches) missingVars.add(m[1]);

          // Pattern: "VAR_NAME: [ 'Required' ]" (t3-env style)
          const t3Matches = body.matchAll(/^\s*(\w+):\s*\[\s*'Required'\s*\]/gm);
          for (const m of t3Matches) missingVars.add(m[1]);

          // Pattern: "NEXT_PUBLIC_..." or "DATABASE_URL" after "missing" context
          if (missingVars.size === 0) {
            const contextVarMatches = body.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g);
            const candidates = new Set<string>();
            for (const m of contextVarMatches) {
              // Filter out common non-env words
              if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'HTTP', 'HTTPS', 'HTML', 'JSON', 'XML', 'ERROR', 'WARNING', 'NULL', 'TRUE', 'FALSE', 'UNDEFINED', 'NAN'].includes(m[1])) {
                candidates.add(m[1]);
              }
            }
            if (candidates.size > 0 && candidates.size <= 10) {
              for (const v of candidates) missingVars.add(v);
            }
          }

          if (missingVars.size > 0) {
            return `Il progetto richiede variabili d'ambiente non configurate:\n\n${[...missingVars].map(v => `• ${v}`).join('\n')}\n\nConfigura un file .env nella root del progetto.`;
          }
          return 'Il progetto richiede variabili d\'ambiente non configurate. Controlla il file .env.';
        }
      }

      // Check for MODULE_NOT_FOUND in 500 response
      if (body.includes('MODULE_NOT_FOUND') || body.includes('Cannot find module')) {
        const moduleMatch = body.match(/Cannot find module '([^']+)'/);
        return `Modulo non trovato: ${moduleMatch ? moduleMatch[1] : 'sconosciuto'}\n\nProva a reinstallare le dipendenze.`;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Public accessor for the log-watcher. Returns recent runtime logs via
   * the workspace-agent SSE buffer (the true source of Next.js/Vite dev
   * output, since their stdout is connected to the agent socket, not a file).
   */
  async fetchRecentLogs(agentUrl: string, lines = 100): Promise<string[]> {
    return this.getRecentLogs(agentUrl, lines);
  }

  /**
   * Read recent runtime logs.
   * Prefer agent SSE log buffer (real-time and independent from file permissions),
   * fallback to file tail when streaming is unavailable.
   */
  private async getRecentLogs(agentUrl: string, lines = 50): Promise<string[]> {
    const bufferedLogs = await this.getRecentLogsFromAgentBuffer(agentUrl, lines);
    if (bufferedLogs.length > 0) return bufferedLogs.slice(-lines);

    try {
      const result = await dockerService.exec(
        agentUrl,
        `tail -${lines} /home/coder/server.log /tmp/drape-server.log 2>/dev/null || echo ""`,
        '/home/coder',
        3000,
        true,
      );
      return (result.stdout || '')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('==>'));
    } catch {
      return [];
    }
  }

  /**
   * Read initial buffered lines from agent /logs SSE endpoint.
   * The agent keeps a circular in-memory buffer with the latest runtime output.
   */
  private async getRecentLogsFromAgentBuffer(agentUrl: string, lines = 80): Promise<string[]> {
    try {
      const response = await axios.get(`${agentUrl}/logs?since=0`, {
        responseType: 'stream',
        timeout: 3500,
      });

      const stream = response.data;
      let rawBuffer = '';
      const out: string[] = [];
      let finalized = false;
      let connectedSeen = false;

      return await new Promise<string[]>((resolve) => {
        const hardTimeout = setTimeout(() => finalize(), 2200);
        let softTimeout: ReturnType<typeof setTimeout> | null = null;

        const finalize = () => {
          if (finalized) return;
          finalized = true;
          clearTimeout(hardTimeout);
          if (softTimeout) clearTimeout(softTimeout);
          try { stream.destroy(); } catch { /* ignore */ }
          resolve(out.slice(-lines));
        };

        const scheduleSoftClose = () => {
          if (softTimeout) clearTimeout(softTimeout);
          softTimeout = setTimeout(() => finalize(), 180);
        };

        const parseDataLine = (payload: string) => {
          if (!payload) return;
          try {
            const parsed = JSON.parse(payload);
            if (parsed?.type === 'connected') {
              connectedSeen = true;
              scheduleSoftClose();
              return;
            }
            const text = typeof parsed?.text === 'string'
              ? parsed.text
              : (typeof parsed?.message === 'string' ? parsed.message : '');
            if (text) out.push(text);
          } catch {
            out.push(payload);
          }
        };

        stream.on('data', (chunk: Buffer) => {
          rawBuffer += chunk.toString().replace(/\r/g, '\n');
          let lineEnd = rawBuffer.indexOf('\n');
          while (lineEnd !== -1) {
            const line = rawBuffer.slice(0, lineEnd).trim();
            rawBuffer = rawBuffer.slice(lineEnd + 1);
            if (line.startsWith('data:')) {
              parseDataLine(line.slice(5).trim());
            }
            lineEnd = rawBuffer.indexOf('\n');
          }
          if (connectedSeen) scheduleSoftClose();
        });

        stream.on('end', () => finalize());
        stream.on('error', () => finalize());
      });
    } catch {
      return [];
    }
  }

  /**
   * Check if the dev server process has crashed by reading server.log.
   * Returns crash reason if crashed, null if still alive/starting.
   */
  private async detectCrash(agentUrl: string): Promise<string | null> {
    const rawLines = await this.getRecentLogs(agentUrl, 80);
    if (rawLines.length === 0) return null;

    // Strip ANSI and clean up lines
    const lines = rawLines.map(l => {
      let clean = this.stripAnsi(l);
      clean = clean.replace(/^\[[\dT:.Z-]+\]\s*\[\w+\]\s*/, '');
      clean = clean.replace(/^\d{4}\s+/, '');
      return clean.trim();
    }).filter(l => l);

    // Detect process exits (both non-zero and unexpected zero exits).
    const exitRegex = /exited with code [0-9]+|Process exited \(code:\s*[0-9]+/;
    const exitLines = lines.filter(l => exitRegex.test(l));
    if (exitLines.length === 0) return null;

    // Check if there is a restart marker after the last exit
    const lastExitIdx = lines.length - 1 - [...lines].reverse().findIndex(l => exitRegex.test(l));
    const hasRestartAfterExit = lastExitIdx >= 0
      ? lines.slice(lastExitIdx + 1).some(l => l.includes('Starting:'))
      : false;

    // Fail fast even on a single crash if there is no restart underway.
    if (!hasRestartAfterExit) {
      return this.parseCrashReason(rawLines);
    }

    // If it's repeatedly crashing, fail immediately regardless of restart markers.
    if (exitLines.length >= 2) {
      return this.parseCrashReason(rawLines);
    }

    return null;
  }

  /**
   * Try to infer a concrete startup/build issue from recent logs even when the
   * process has not emitted an explicit "exited with code" marker yet.
   */
  private async detectStartupIssue(agentUrl: string): Promise<string | null> {
    const rawLines = await this.getRecentLogs(agentUrl, 120);
    if (rawLines.length === 0) return null;

    const normalized = rawLines
      .map(l => {
        let clean = this.stripAnsi(l);
        clean = clean.replace(/^\[[\dT:.Z-]+\]\s*\[\w+\]\s*/, '');
        clean = clean.replace(/^\d{4}\s+/, '');
        return clean.trim();
      })
      .filter(Boolean);
    const fullLog = normalized.join('\n');

    const actionablePattern = /Invalid environment variables|MODULE_NOT_FOUND|Cannot find module|Module not found:.*Can't resolve|Failed to compile|error TS\d+|SyntaxError:|EADDRINUSE|routes-manifest\.json|middleware-manifest\.json|vendor-chunks|Loading chunk \d+ failed|couldn't find the next\.js package|inferred your workspace root/i;
    if (!actionablePattern.test(fullLog)) return null;

    const parsed = this.parseCrashReason(rawLines);
    return parsed === 'Il dev server è crashato. Controlla i log per maggiori dettagli.'
      ? null
      : parsed;
  }

  /**
   * Strip ANSI escape codes from text
   */
  private stripAnsi(text: string): string {
    return text.replace(/\x1B\[[0-9;]*[a-zA-Z]|\[[\d;]*m/g, '');
  }

  /**
   * Parse log lines to extract a human-readable crash reason.
   * Handles ANSI escape codes in server.log output.
   */
  private parseCrashReason(rawLines: string[]): string {
    // Strip ANSI codes and timestamp prefixes from all lines
    const lines = rawLines.map(l => {
      let clean = this.stripAnsi(l);
      // Remove timestamp prefix like "[2026-02-02T13:04:07.724Z] [stdout] "
      clean = clean.replace(/^\[[\dT:.Z-]+\]\s*\[\w+\]\s*/, '');
      // Remove concurrently prefix like "3000 "
      clean = clean.replace(/^\d{4}\s+/, '');
      return clean.trim();
    }).filter(l => l);
    const fullLog = lines.join('\n');

    // Check for missing environment variables (t3-env, dotenv, etc.)
    if (fullLog.includes('Invalid environment variables')) {
      const missingVars = new Set<string>();
      for (const line of lines) {
        const varMatch = line.match(/^\s*(\w+):\s*\[\s*'Required'\s*\]/);
        if (varMatch) missingVars.add(varMatch[1]);
      }
      if (missingVars.size > 0) {
        return `Il progetto richiede variabili d'ambiente non configurate:\n\n${[...missingVars].map(v => `• ${v}`).join('\n')}\n\nConfigura un file .env nella root del progetto.`;
      }
      return 'Il progetto richiede variabili d\'ambiente non configurate. Controlla il file .env.';
    }

    // Check for MODULE_NOT_FOUND (Node.js) or ModuleNotFoundError / No module named (Python)
    if (fullLog.includes('MODULE_NOT_FOUND') || fullLog.includes('Cannot find module')) {
      const moduleMatch = fullLog.match(/Cannot find module '([^']+)'/);
      const moduleName = moduleMatch ? moduleMatch[1] : 'sconosciuto';
      return `Modulo non trovato: ${moduleName}\n\nProva a reinstallare le dipendenze.`;
    }
    if (/Module not found:.*Can't resolve/i.test(fullLog)) {
      const resolveMatch = fullLog.match(/Module not found:.*Can't resolve ['"]([^'"]+)['"]/i);
      const moduleName = resolveMatch ? resolveMatch[1] : 'sconosciuto';
      return `Import non risolto: ${moduleName}\n\nControlla path, alias e file esportati.`;
    }
    if (fullLog.includes('ModuleNotFoundError') || fullLog.includes('No module named')) {
      const pyMatch = fullLog.match(/No module named ['"]?([^\s'"]+)/);
      const moduleName = pyMatch ? pyMatch[1] : 'sconosciuto';
      return `Modulo Python non trovato: ${moduleName}\n\nProva a reinstallare le dipendenze (pip install -r requirements.txt).`;
    }

    // Next.js workspace root / missing next package inference error
    // Note: avoid matching "next/package.json" in the start command echo (e.g. NEXT_MAJOR=...)
    if (
      /couldn't find the next\.js package/i.test(fullLog) ||
      /inferred your workspace root/i.test(fullLog) ||
      // Only match next/package.json when it appears in an error context (not in the $ echo of the start cmd)
      /error.*next\/package\.json|next\/package\.json.*error/i.test(fullLog)
    ) {
      return 'Dipendenze Next.js non trovate nel workspace attivo. Verifica package.json e lockfile nella root usata dalla preview, poi riprova.';
    }

    // Check for syntax/build errors
    if (/Failed to compile/.test(fullLog)) {
      const relevantLines = lines
        .filter(l =>
          /Failed to compile|Module not found|Can't resolve|error TS\d+|SyntaxError:|ReferenceError:|TypeError:/.test(l),
        )
        .slice(0, 5);
      if (relevantLines.length > 0) {
        return `Build fallita:\n\n${relevantLines.join('\n')}`;
      }
      return 'Build fallita durante l’avvio del dev server.';
    }
    if (/error TS\d+:/.test(fullLog)) {
      const tsLine = lines.find(l => /error TS\d+:/.test(l));
      return `Errore TypeScript in avvio:\n${tsLine || 'Controlla i file TypeScript del progetto.'}`;
    }
    if (fullLog.includes('SyntaxError:')) {
      const syntaxMatch = fullLog.match(/SyntaxError:\s*(.+)/);
      return `Errore di sintassi nel codice:\n${syntaxMatch ? syntaxMatch[1] : 'Controlla il codice sorgente.'}`;
    }

    // Check for port already in use
    if (fullLog.includes('EADDRINUSE')) {
      return 'La porta del dev server è già in uso. Riprova tra qualche secondo.';
    }

    // Check for generic "exited with code"
    const exitMatch = fullLog.match(/exited with code (\d+)/);
    if (exitMatch) {
      // Try to find the most relevant error lines
      const errorLines = lines.filter(l =>
        /\b(Error|error|ERR|❌|failed|FATAL)\b/.test(l) &&
        !l.includes('exited with code') &&
        !l.includes('at ') // skip stack traces
      ).slice(-3);
      if (errorLines.length > 0) {
        return `Il dev server è crashato (exit code ${exitMatch[1]}):\n\n${errorLines.join('\n')}`;
      }
      return `Il dev server è crashato con exit code ${exitMatch[1]}.`;
    }

    return 'Il dev server è crashato. Controlla i log per maggiori dettagli.';
  }

  /**
   * Wait for dev server to become responsive.
   * Detects crash loops by reading server.log and fails fast with specific error.
   */
  async waitForReady(agentUrl: string, timeoutMs = 60000, crashDetectionDelayMs = 8000): Promise<{ ready: boolean; error?: string }> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (await this.isRunning(agentUrl)) return { ready: true };

      // After crashDetectionDelayMs, start checking server.log for crash loops
      // (gives enough time for process to start, crash, restart, crash again)
      if (Date.now() - start > crashDetectionDelayMs) {
        const crashReason = await this.detectCrash(agentUrl);
        if (crashReason) {
          const elapsed = Date.now() - start;
          log.warn(`[DevServer] Crash loop detected after ${elapsed}ms`);
          return { ready: false, error: crashReason };
        }

        const startupIssue = await this.detectStartupIssue(agentUrl);
        if (startupIssue) {
          const elapsed = Date.now() - start;
          log.warn(`[DevServer] Startup issue detected after ${elapsed}ms`);
          return { ready: false, error: startupIssue };
        }
      }

      await sleep(2000);
    }
    // Timeout — try to get crash reason from logs anyway
    const reason = await this.detectCrash(agentUrl) || await this.detectStartupIssue(agentUrl);
    return {
      ready: false,
      error: reason || 'Il dev server non ha risposto entro il timeout. Potrebbe esserci un errore di build o dipendenze mancanti.',
    };
  }
}

export const devServerService = new DevServerService();
