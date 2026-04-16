/**
 * Wait for the dev server inside a project container to reach a verifiable
 * "ready" state. Event-based (scans server.log for ready/failure signals and
 * polls HTTP) rather than time-based, so we don't waste 60s sleeping when the
 * server is already up or crashed.
 *
 * Also exposes restartDevServer — kill + warm cycle used between auto-fix
 * attempts.
 */

import { log } from '../../utils/logger';
import { workspaceService } from '../workspace.service';
import { extractLogErrors } from './error-classifier';

const VERIFY_SERVER_WAIT_MS = 20_000;
const MAX_SERVER_READY_TAIL_LINES = 25;
const MAX_SERVER_CRASH_TAIL_LINES = 20;
export const MAX_SERVER_ERROR_TAIL_LINES = 60;

export interface ServerWaitResult {
  /** True when the HTTP endpoint responded at least once (any status code other than 000). */
  reachable: boolean;
  httpCode: string;
  htmlBody: string;
  /** If reachable=false, crashErrors contains any log lines extracted from server.log. */
  crashErrors: string[];
}

export async function waitForServerReady(projectId: string, userId: string): Promise<ServerWaitResult> {
  let httpCode = '000';
  let htmlBody = '';
  const startTime = Date.now();

  for (let wait = 0; (Date.now() - startTime) < VERIFY_SERVER_WAIT_MS; wait++) {
    // Check server.log for completion signals
    try {
      const buildLog = await workspaceService.exec(
        projectId,
        userId,
        `cat /home/coder/server.log 2>/dev/null | tail -${MAX_SERVER_READY_TAIL_LINES}`,
      );
      const buildText = buildLog.stdout || '';

      // Build/server READY signals
      const isReady = buildText.includes('Ready in') ||           // next dev/start
        buildText.includes('ready started server') ||              // next start
        buildText.includes('Local:') ||                            // vite, astro
        buildText.includes('listening on') ||                      // generic
        buildText.includes('started server on') ||                 // next
        buildText.includes('Server running');                      // custom

      // Build FAILED signals
      const hasFailed = buildText.includes('Failed to compile') ||
        buildText.includes('Build error') ||
        buildText.includes('Process exited with code: 1') ||
        buildText.includes('exited with code 1') ||
        buildText.includes('ELIFECYCLE') ||
        buildText.includes('falling back to dev mode');

      if (isReady || hasFailed) {
        if (hasFailed) log.info(`[Verify] Build failed — checking if fallback started`);
        // Give the server 3s to fully bind the port after logging "Ready"
        await new Promise(r => setTimeout(r, 3000));
        break;
      }
    } catch {}

    // Also try HTTP — if server responds, it's ready regardless of logs
    const curlResult = await workspaceService.exec(
      projectId,
      userId,
      'curl -s -w "\\n%{http_code}" http://localhost:3000 2>/dev/null || echo "\\n000"',
    );
    const curlLines = (curlResult.stdout || '').split('\n');
    httpCode = curlLines[curlLines.length - 1]?.trim() || '000';
    htmlBody = curlLines.slice(0, -1).join('\n');
    if (httpCode !== '000') break;

    log.info(`[Verify] Waiting for server... (${Math.round((Date.now() - startTime) / 1000)}s)`);
    await new Promise(r => setTimeout(r, 5000));
  }

  // Final HTTP check if we exited via log signals
  if (httpCode === '000') {
    const curlResult = await workspaceService.exec(
      projectId,
      userId,
      'curl -s -w "\\n%{http_code}" http://localhost:3000 2>/dev/null || echo "\\n000"',
    );
    const curlLines = (curlResult.stdout || '').split('\n');
    httpCode = curlLines[curlLines.length - 1]?.trim() || '000';
    htmlBody = curlLines.slice(0, -1).join('\n');
  }

  if (httpCode === '000') {
    const crashErrors: string[] = ['Server not running after 60s — check server.log for crash'];
    try {
      const crashLog = await workspaceService.exec(
        projectId,
        userId,
        `cat /home/coder/server.log 2>/dev/null | tail -${MAX_SERVER_CRASH_TAIL_LINES}`,
      );
      const extracted = extractLogErrors(crashLog.stdout || '');
      for (const e of extracted) crashErrors.push(e);
    } catch {}
    return { reachable: false, httpCode, htmlBody, crashErrors };
  }

  return { reachable: true, httpCode, htmlBody, crashErrors: [] };
}

export async function restartDevServer(projectId: string, userId: string): Promise<void> {
  try {
    // Kill existing server processes — next dev picks up changes via HMR,
    // but a full restart ensures clean state after fix attempts
    await workspaceService.exec(
      projectId,
      userId,
      'pkill -f "next\\|vite\\|astro\\|expo" 2>/dev/null; sleep 2',
    );
    const warmTimeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('restart timeout')), 120000),
    );
    await Promise.race([workspaceService.warmProject(projectId, userId), warmTimeout]);
  } catch (err: any) {
    log.warn(`[Verify] Dev server restart failed: ${err.message}`);
  }
}
