import axios from 'axios';
import { Session, ProjectInfo } from '../types';
import { log } from '../utils/logger';
import { dockerService } from './docker.service';
import { sleep } from '../utils/helpers';
import { DEV_SERVER_PORT } from '../utils/constants';

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

  private async doStart(session: Session, info: ProjectInfo): Promise<boolean> {
    const { agentUrl } = session;
    const startTime = Date.now();

    // Check if already running
    if (await this.isRunning(agentUrl)) {
      log.info(`[DevServer] Already running for ${session.projectId}`);
      return true;
    }

    log.info(`[DevServer] Starting: ${info.startCommand}`);

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

    // Wait for dev server to respond
    const result = await this.waitForReady(agentUrl, 60000);
    const elapsed = Date.now() - startTime;

    if (result.ready) {
      // Server responds, but check if it's returning 500 with known errors
      const appError = await this.checkResponseForErrors(agentUrl);
      if (appError) {
        log.warn(`[DevServer] Server running but app broken for ${session.projectId}: ${appError.substring(0, 100)}`);
        throw new Error(appError);
      }
      log.info(`[DevServer] Ready in ${elapsed}ms for ${session.projectId}`);
      return true;
    }

    log.warn(`[DevServer] Not ready after ${elapsed}ms for ${session.projectId}`);
    throw new Error(result.error || 'Il dev server non è riuscito ad avviarsi.');
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
              if (!['GET', 'POST', 'PUT', 'DELETE', 'ERROR', 'HTTP', 'NULL', 'TRUE', 'FALSE', 'HTML', 'JSON'].includes(m[1])) {
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
   * Read the last N lines of the agent's server.log
   */
  private async getRecentLogs(agentUrl: string, lines = 50): Promise<string[]> {
    try {
      const result = await dockerService.exec(
        agentUrl,
        `tail -${lines} /home/coder/server.log 2>/dev/null || echo ""`,
        '/home/coder',
        3000,
        true,
      );
      return (result.stdout || '').split('\n').filter(l => l.trim());
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

    // Count how many times "exited with code" appears (non-zero) — indicates crash loops
    const exitLines = lines.filter(l => /exited with code [1-9]/.test(l) || /Process exited \(code: [1-9]/.test(l));
    if (exitLines.length < 2) return null; // Need at least 2 crashes to confirm it's not a one-time hiccup

    // Check if there's a "Starting:" line AFTER the last exit — means it's being restarted
    const lastExitIdx = lines.length - 1 - [...lines].reverse().findIndex(l =>
      /exited with code [1-9]/.test(l) || /Process exited \(code: [1-9]/.test(l)
    );
    const hasRestartAfterExit = lines.slice(lastExitIdx + 1).some(l => l.includes('Starting:'));

    // If process keeps crash-looping (2+ exits), parse the reason regardless
    if (exitLines.length >= 2) {
      return this.parseCrashReason(rawLines);
    }

    return null;
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

    // Check for MODULE_NOT_FOUND
    if (fullLog.includes('MODULE_NOT_FOUND') || fullLog.includes('Cannot find module')) {
      const moduleMatch = fullLog.match(/Cannot find module '([^']+)'/);
      const moduleName = moduleMatch ? moduleMatch[1] : 'sconosciuto';
      return `Modulo non trovato: ${moduleName}\n\nProva a reinstallare le dipendenze.`;
    }

    // Check for syntax/build errors
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
  async waitForReady(agentUrl: string, timeoutMs = 60000): Promise<{ ready: boolean; error?: string }> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (await this.isRunning(agentUrl)) return { ready: true };

      // After 8s, start checking server.log for crash loops
      // (gives enough time for process to start, crash, restart, crash again)
      if (Date.now() - start > 8000) {
        const crashReason = await this.detectCrash(agentUrl);
        if (crashReason) {
          const elapsed = Date.now() - start;
          log.warn(`[DevServer] Crash loop detected after ${elapsed}ms`);
          return { ready: false, error: crashReason };
        }
      }

      await sleep(2000);
    }
    // Timeout — try to get crash reason from logs anyway
    const reason = await this.detectCrash(agentUrl);
    return {
      ready: false,
      error: reason || 'Il dev server non ha risposto entro il timeout. Potrebbe esserci un errore di build o dipendenze mancanti.',
    };
  }
}

export const devServerService = new DevServerService();
