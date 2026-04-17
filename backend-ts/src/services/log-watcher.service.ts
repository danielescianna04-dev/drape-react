/**
 * Log Watcher Service
 *
 * Continuously tails the container's ~/server.log and parses it for error
 * patterns. Every matched error is appended to .drape/build-report.json so
 * it surfaces in the project history UI.
 *
 * Runs one poll per project every POLL_INTERVAL_MS. Tracks last-read line
 * number so we never re-process old lines. Deduplicates errors within a
 * rolling window so identical crashes don't spam the history.
 */

import { log } from '../utils/logger';
import { appendRuntimeAction } from './build-report.service';
import { devServerService } from './dev-server.service';

const POLL_INTERVAL_MS = 5000;          // tail every 5s
const MAX_LINES_PER_POLL = 200;          // cap tail to avoid huge payloads
const DEDUPE_WINDOW_MS = 600_000;        // 10 min — stale lines in SSE buffer stay deduped
const MAX_APPENDS_PER_PROJECT_PER_MIN = 20;
const MAX_RECOVERIES_PER_PROJECT = 3;    // hard cap to prevent recovery loops

interface WatcherState {
  agentUrl: string;
  recentHashes: Map<string, number>;  // hash → timestamp (dedupe across polls)
  appendCount: number;                 // in current minute
  countResetAt: number;
  stopped: boolean;
  lastRestartAt: number;                // cooldown for runtime recovery
  recoveryCount: number;                // total recoveries attempted for this project
  recoveredErrorHashes: Set<string>;    // error hashes that have already triggered a recovery
}

const RESTART_COOLDOWN_MS = 180_000;    // 3 min — recovery itself causes transient errors
// Pattern that triggers a runtime cache-clear + restart
const CACHE_CORRUPTION_REGEX = /__webpack_modules__\[[^\]]+\] is not a function|__webpack_require__\([^)]+\) is not a function|Cannot find module '\.\/\d+\.js'|Loading chunk \d+ failed|ENOENT.*routes-manifest\.json|ENOENT.*middleware-manifest\.json|Cannot find module ['"]?.*vendor-chunks/;

interface ErrorPattern {
  regex: RegExp;
  step: string;
  title: string;
  status: 'failed' | 'fixed';
  severity: 'error' | 'warning';
}

// Patterns ordered by specificity — first match wins
const ERROR_PATTERNS: ErrorPattern[] = [
  // Next.js / webpack cache corruption
  {
    regex: /\[Error: ENOENT:.*routes-manifest\.json/,
    step: 'runtime',
    title: 'Next.js routes-manifest.json missing',
    status: 'failed',
    severity: 'error',
  },
  {
    regex: /\[Error: ENOENT:.*middleware-manifest\.json/,
    step: 'runtime',
    title: 'Next.js middleware-manifest.json missing',
    status: 'failed',
    severity: 'error',
  },
  {
    regex: /Cannot find module '\.\/\d+\.js'/,
    step: 'runtime',
    title: 'Stale webpack chunk',
    status: 'failed',
    severity: 'error',
  },
  {
    regex: /Cannot find module ['"]([^'"]+)['"]/,
    step: 'runtime',
    title: 'Module not found',
    status: 'failed',
    severity: 'error',
  },
  {
    regex: /Module not found:.*Can't resolve ['"]([^'"]+)['"]/,
    step: 'runtime',
    title: 'Module not resolved',
    status: 'failed',
    severity: 'error',
  },
  // Compilation errors
  {
    regex: /Failed to compile/,
    step: 'compile',
    title: 'Failed to compile',
    status: 'failed',
    severity: 'error',
  },
  {
    regex: /error TS\d+:/,
    step: 'compile',
    title: 'TypeScript error',
    status: 'failed',
    severity: 'error',
  },
  {
    regex: /CssSyntaxError/,
    step: 'compile',
    title: 'CSS syntax error',
    status: 'failed',
    severity: 'error',
  },
  {
    regex: /SyntaxError:/,
    step: 'compile',
    title: 'JavaScript syntax error',
    status: 'failed',
    severity: 'error',
  },
  // Runtime JS errors
  {
    regex: /(?:Unhandled Runtime Error|unhandledRejection)/,
    step: 'runtime',
    title: 'Unhandled runtime error',
    status: 'failed',
    severity: 'error',
  },
  {
    regex: /Hydration failed/,
    step: 'runtime',
    title: 'React hydration failed',
    status: 'failed',
    severity: 'error',
  },
  {
    regex: /TypeError:\s*(.+)/,
    step: 'runtime',
    title: 'TypeError',
    status: 'failed',
    severity: 'error',
  },
  {
    regex: /ReferenceError:\s*(.+)/,
    step: 'runtime',
    title: 'ReferenceError',
    status: 'failed',
    severity: 'error',
  },
  // Network / port errors
  {
    regex: /EADDRINUSE/,
    step: 'dev-server',
    title: 'Port already in use',
    status: 'failed',
    severity: 'error',
  },
  {
    regex: /ECONNREFUSED/,
    step: 'runtime',
    title: 'Connection refused',
    status: 'failed',
    severity: 'error',
  },
  // Webpack warnings (non-fatal)
  {
    regex: /\[webpack\.cache\.PackFileCacheStrategy\] Caching failed/,
    step: 'compile',
    title: 'Webpack cache warning',
    status: 'fixed',
    severity: 'warning',
  },
  // Database errors
  {
    regex: /password authentication failed/,
    step: 'database',
    title: 'Database authentication failed',
    status: 'failed',
    severity: 'error',
  },
  {
    regex: /relation "([^"]+)" does not exist/,
    step: 'database',
    title: 'Database table missing',
    status: 'failed',
    severity: 'error',
  },
];

class LogWatcherService {
  private watchers = new Map<string, { state: WatcherState; timer: ReturnType<typeof setInterval> }>();

  /**
   * Start watching the container log for a project. Idempotent — calling
   * start() on an already-watched project is a no-op.
   */
  start(projectId: string, agentUrl: string): void {
    if (this.watchers.has(projectId)) {
      return;
    }

    const state: WatcherState = {
      agentUrl,
      recentHashes: new Map(),
      appendCount: 0,
      countResetAt: Date.now() + 60_000,
      stopped: false,
      lastRestartAt: 0,
      recoveryCount: 0,
      recoveredErrorHashes: new Set(),
    };

    const timer = setInterval(() => {
      if (state.stopped) return;
      this.poll(projectId, state).catch(err => {
        log.warn(`[LogWatcher] Poll failed for ${projectId}: ${err.message}`);
      });
    }, POLL_INTERVAL_MS);

    this.watchers.set(projectId, { state, timer });
    log.info(`[LogWatcher] Started for ${projectId}`);
  }

  /**
   * Stop watching for a project. Called when the session is destroyed or
   * the container is stopped.
   */
  stop(projectId: string): void {
    const w = this.watchers.get(projectId);
    if (!w) return;
    w.state.stopped = true;
    clearInterval(w.timer);
    this.watchers.delete(projectId);
    log.info(`[LogWatcher] Stopped for ${projectId}`);
  }

  /**
   * Called by session cleanup to tear down all watchers.
   */
  stopAll(): void {
    for (const id of [...this.watchers.keys()]) {
      this.stop(id);
    }
  }

  private async poll(projectId: string, state: WatcherState): Promise<void> {
    // Fetch recent log lines from the workspace-agent SSE buffer.
    // This is the real source of Next.js/Vite dev server output — tailing
    // /home/coder/server.log only sees the install log, not runtime.
    let lines: string[] = [];
    try {
      lines = await devServerService.fetchRecentLogs(state.agentUrl, MAX_LINES_PER_POLL);
    } catch {
      return;
    }

    if (lines.length === 0) return;

    // Process lines — batch multi-line errors by looking at surrounding context
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      for (const pattern of ERROR_PATTERNS) {
        if (!pattern.regex.test(line)) continue;

        // Include next 2 lines for context (stack traces)
        const context = lines.slice(i, Math.min(i + 3, lines.length)).join('\n').substring(0, 500);
        const hash = this.hashError(pattern.title, context);

        if (this.isDuplicate(state, hash)) break;
        if (!this.tryIncrementAppendCount(state)) {
          log.warn(`[LogWatcher] Rate limit hit for ${projectId}, skipping log entries`);
          return;
        }

        state.recentHashes.set(hash, Date.now());
        await appendRuntimeAction(projectId, pattern.step, pattern.title, {
          status: pattern.status,
          error: context,
          details: pattern.severity === 'warning' ? 'Non-fatal warning from dev server' : 'Dev server error',
          metadata: { severity: pattern.severity, source: 'log-watcher' },
        }).catch(() => {});

        // Runtime recovery: if this error is a cache corruption pattern, trigger
        // clear + restart of the dev server. Multiple guards to prevent recovery loops:
        //  1. MAX_RECOVERIES_PER_PROJECT: hard cap across whole session
        //  2. RESTART_COOLDOWN_MS: long cooldown between any two recoveries
        //  3. recoveredErrorHashes: don't re-recover for an error we already recovered
        //     (even if the same stale line reappears in the SSE buffer later)
        if (CACHE_CORRUPTION_REGEX.test(line)) {
          const now = Date.now();
          const alreadyRecovered = state.recoveredErrorHashes.has(hash);
          if (state.recoveryCount >= MAX_RECOVERIES_PER_PROJECT) {
            // Hit the hard cap — silently skip further recovery attempts
          } else if (alreadyRecovered) {
            // Same error already triggered a recovery — don't loop
          } else if (now - state.lastRestartAt < RESTART_COOLDOWN_MS) {
            // Cooldown active
          } else {
            state.lastRestartAt = now;
            state.recoveryCount++;
            state.recoveredErrorHashes.add(hash);
            this.triggerRecovery(projectId, state.agentUrl).catch(() => {});
          }
        }
        break; // one pattern match per line
      }
    }

    // Garbage collect old hashes
    const now = Date.now();
    for (const [h, ts] of state.recentHashes) {
      if (now - ts > DEDUPE_WINDOW_MS) state.recentHashes.delete(h);
    }
  }

  /**
   * Fire-and-forget recovery: look up the session for this project and call
   * devServerService.clearCacheAndRestart. Runs out-of-band so it doesn't
   * block the poll loop.
   */
  private async triggerRecovery(projectId: string, agentUrl: string): Promise<void> {
    try {
      const { sessionService } = await import('./session.service');
      const { projectDetectorService } = await import('./project-detector.service');
      const session = await sessionService.getByProjectId(projectId);
      if (!session) {
        log.warn(`[LogWatcher] Recovery: no session found for ${projectId}, skipping`);
        return;
      }
      const info = session.projectInfo || await projectDetectorService.detect(projectId);
      if (!info) return;
      log.info(`[LogWatcher] Triggering runtime recovery for ${projectId}`);
      const recovered = await devServerService.clearCacheAndRestart(session, info);
      await appendRuntimeAction(projectId, 'dev-server', recovered ? 'Runtime recovery applied' : 'Runtime recovery failed', {
        status: recovered ? 'fixed' : 'failed',
        fix: recovered ? 'Cleared .next cache and restarted dev server' : undefined,
        error: recovered ? undefined : 'Restart did not reach ready state',
      });
    } catch (err: any) {
      log.warn(`[LogWatcher] Recovery failed for ${projectId}: ${err.message}`);
    }
  }

  private hashError(title: string, context: string): string {
    const normalized = context
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line =>
        line
          .replace(/\/home\/coder\/project\/[^\s'"]+/g, '<project-file>')
          .replace(/:\d+:\d+/g, ':L:C')
          .replace(/\b\d+\b/g, '#')
      )
      .join(' ')
      .substring(0, 180);
    return `${title}::${normalized}`;
  }

  private isDuplicate(state: WatcherState, hash: string): boolean {
    const ts = state.recentHashes.get(hash);
    if (!ts) return false;
    return Date.now() - ts < DEDUPE_WINDOW_MS;
  }

  private tryIncrementAppendCount(state: WatcherState): boolean {
    const now = Date.now();
    if (now > state.countResetAt) {
      state.appendCount = 0;
      state.countResetAt = now + 60_000;
    }
    if (state.appendCount >= MAX_APPENDS_PER_PROJECT_PER_MIN) return false;
    state.appendCount++;
    return true;
  }
}

export const logWatcherService = new LogWatcherService();
