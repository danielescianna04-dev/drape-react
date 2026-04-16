/**
 * Preview lifecycle phases.
 *
 * preview_start: warm the project, poll localhost:3000 health. On healthy →
 * go straight to full_verify. On unhealthy → collect diagnostics, classify,
 * and decide whether to fix-and-retry (preview_fix) or escalate to
 * full_verify as a fallback.
 *
 * preview_fix: apply a targeted remediation (dep repair OR AgentLoop fix),
 * restart the server, and loop back to preview_start.
 *
 * Invariant: preview_start / preview_fix never enter full_verify twice —
 * the attempt counter is the only way to exit the cycle.
 */

import { log } from '../../utils/logger';
import { config } from '../../config';
import { workspaceService } from '../workspace.service';
import { fileService } from '../file.service';
import { AgentLoop } from '../agent-loop.service';
import { streamAgentLoopToSse } from '../agent-loop-stream.service';
import {
  isLikelyDependencyCorruption,
  isLikelyHydrationMismatch,
  isLikelyUserImportResolutionError,
} from '../../utils/install-integrity';
import type { PipelineContext, PipelineState, PreviewStartupDiagnostics } from './types';

const PROJECT_FIX_MODEL = config.projectVerifyFixModel;
const PROJECT_FIX_THINKING_LEVEL = config.projectVerifyFixThinkingLevel;

const MAX_PREVIEW_ATTEMPTS = 3;
const MAX_FIX_ITERATIONS = 12;
const PREVIEW_HEALTH_MAX_CHECKS = 4;
const PREVIEW_HEALTH_DELAY_MS = 3000;

async function readRecentBuildReportIssues(projectId: string): Promise<string[]> {
  try {
    const report = await fileService.readFile(projectId, '.drape/build-report.json');
    if (!report.success || !report.data?.content) return [];
    const parsed = JSON.parse(report.data.content);
    const actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
    return actions
      .slice(-10)
      .filter((a: any) =>
        ['warming', 'dev-server', 'runtime', 'compile', 'verify'].includes(a?.step) &&
        ['failed', 'fixed'].includes(a?.status),
      )
      .map((a: any) => {
        const details = [a?.title, a?.error, a?.fix].filter(Boolean).join(' — ');
        return details.substring(0, 300);
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function collectPreviewStartupDiagnostics(
  projectId: string,
  userId: string,
): Promise<PreviewStartupDiagnostics> {
  const issueSet = new Set<string>();
  let serverLogText = '';
  let htmlText = '';

  const reportIssues = await readRecentBuildReportIssues(projectId);
  reportIssues.forEach(i => issueSet.add(i));

  try {
    const serverLog = await workspaceService.exec(
      projectId,
      userId,
      'tail -80 /home/coder/server.log 2>/dev/null; echo "\\n---NEXT-DEV---\\n"; tail -80 /tmp/next-dev.log 2>/dev/null',
    );
    serverLogText = (serverLog.stdout || '').trim();
  } catch {}

  try {
    const htmlContent = await workspaceService.exec(
      projectId,
      userId,
      'curl -s http://localhost:3000 2>/dev/null | head -80',
    );
    htmlText = (htmlContent.stdout || '').trim();
  } catch {}

  const relevantLogLines = serverLogText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l =>
      /Cannot find module|Module not found|Can't resolve|Import non risolto|Modulo non trovato|Failed to compile|error TS\d+|SyntaxError:|ReferenceError:|TypeError:|routes-manifest|middleware-manifest|vendor-chunks|Loading chunk|Invalid environment variables|EADDRINUSE|Server error|HTTP 500/i.test(l),
    )
    .slice(-8);
  relevantLogLines.forEach(i => issueSet.add(i.substring(0, 300)));

  const issues = [...issueSet];
  const genericOnly = issues.length > 0 && issues.every(i =>
    /timeout|did not respond|Warming failed|Dev server failed to start/i.test(i),
  );

  const contextParts = [
    issues.length > 0 ? `Recent reported issues:\n${issues.map(i => `- ${i}`).join('\n')}` : '',
    serverLogText ? `Server log:\n${serverLogText.substring(0, 1800)}` : '',
    htmlText ? `HTML output:\n${htmlText.substring(0, 600)}` : '',
  ].filter(Boolean);

  const context = contextParts.join('\n\n');
  let cause: PreviewStartupDiagnostics['cause'] = 'generic';
  if (isLikelyDependencyCorruption(context, 'nextjs') || issues.some(i => isLikelyDependencyCorruption(i, 'nextjs'))) {
    cause = 'deps';
  } else if (isLikelyHydrationMismatch(context) || issues.some(i => isLikelyHydrationMismatch(i))) {
    cause = 'hydration';
  } else if (isLikelyUserImportResolutionError(context) || issues.some(i => isLikelyUserImportResolutionError(i))) {
    cause = 'imports';
  }

  return {
    issues,
    context,
    actionable: contextParts.length > 0 && !genericOnly,
    cause,
  };
}

async function checkPreviewHealth(projectId: string, userId: string): Promise<boolean> {
  for (let check = 0; check < PREVIEW_HEALTH_MAX_CHECKS; check++) {
    try {
      const curl = await workspaceService.exec(
        projectId,
        userId,
        'curl -s -w "\\n%{http_code}" http://localhost:3000 2>/dev/null || echo "\\n000"',
      );
      const lines = (curl.stdout || '').split('\n');
      const httpCode = lines[lines.length - 1]?.trim() || '000';
      const html = lines.slice(0, -1).join('\n');
      const bytes = html.length;
      const healthy = (httpCode === '200' || httpCode === '304') && bytes > 200;
      log.info(`[Pipeline/preview] Health check ${check + 1}: code=${httpCode}, bytes=${bytes}, healthy=${healthy}`);
      if (healthy) return true;
    } catch {}
    await new Promise(r => setTimeout(r, PREVIEW_HEALTH_DELAY_MS));
  }
  return false;
}

async function restartPreviewServer(projectId: string, userId: string): Promise<void> {
  try {
    await workspaceService.exec(projectId, userId,
      'pkill -f "next\\|vite\\|astro\\|expo" 2>/dev/null; sleep 2 || true',
    );
  } catch {}

  try {
    const warmTimeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('restart timeout')), 120000),
    );
    await Promise.race([workspaceService.warmProject(projectId, userId), warmTimeout]);
  } catch (error: any) {
    log.warn(`[Pipeline/preview] Restart failed for ${projectId}: ${error.message}`);
  }
}

export async function runPreviewStart(state: PipelineState, ctx: PipelineContext): Promise<PipelineState> {
  // First entry to preview: warm the project. On subsequent entries (after
  // preview_fix), warmProject has already run inside restartPreviewServer.
  if (state.previewStartAttempt === 0) {
    ctx.writeSseEvent('status', { type: 'status', message: 'Starting preview...', phase: 'warmup' });
    try {
      await workspaceService.warmProject(ctx.projectId, ctx.userId);
      log.info(`[Pipeline/preview] Warm-up complete for ${ctx.projectId}`);
    } catch (error: any) {
      log.warn(`[Pipeline/preview] Warm-up failed: ${error.message}`);
    }
    await new Promise(r => setTimeout(r, 4000));
  }

  const healthy = await checkPreviewHealth(ctx.projectId, ctx.userId);
  if (healthy) {
    log.info(`[Pipeline/preview] Preview healthy for ${ctx.projectId} — escalating to full_verify`);
    return { ...state, previewOk: true, phase: 'full_verify' };
  }

  const diagnostics = await collectPreviewStartupDiagnostics(ctx.projectId, ctx.userId);
  log.warn(
    `[Pipeline/preview] Startup failed for ${ctx.projectId} (attempt ${state.previewStartAttempt + 1}): ` +
    `${diagnostics.issues.slice(0, 3).join('; ') || 'no concrete diagnostics'} (cause=${diagnostics.cause})`,
  );

  const attemptIndex = state.previewStartAttempt;
  const exhausted = attemptIndex + 1 >= MAX_PREVIEW_ATTEMPTS;

  // Once we've tried a targeted code fix for imports/hydration and failed,
  // escalate straight to the full verifier instead of another targeted fix.
  if (state.targetedCodeFixAttempted && (diagnostics.cause === 'imports' || diagnostics.cause === 'hydration')) {
    log.info(`[Pipeline/preview] Targeted ${diagnostics.cause} fix already tried — escalating to full_verify`);
    return { ...state, previewOk: false, phase: 'full_verify' };
  }

  if (exhausted) {
    log.info(`[Pipeline/preview] Attempts exhausted for ${ctx.projectId} — escalating to full_verify`);
    return { ...state, previewOk: false, phase: 'full_verify' };
  }

  // Not actionable: just restart and retry, no AI call.
  if (!diagnostics.actionable && diagnostics.cause !== 'deps') {
    ctx.writeSseEvent('status', { type: 'status', message: 'Retrying preview startup...', phase: 'warmup' });
    await restartPreviewServer(ctx.projectId, ctx.userId);
    await new Promise(r => setTimeout(r, 4000));
    return { ...state, previewStartAttempt: attemptIndex + 1, lastPreviewDiagnostics: diagnostics, phase: 'preview_start' };
  }

  return {
    ...state,
    previewStartAttempt: attemptIndex + 1,
    lastPreviewDiagnostics: diagnostics,
    phase: 'preview_fix',
  };
}

export async function runPreviewFix(state: PipelineState, ctx: PipelineContext): Promise<PipelineState> {
  const diagnostics = state.lastPreviewDiagnostics;
  if (!diagnostics) {
    // Shouldn't happen — defensive fallback.
    log.warn(`[Pipeline/preview_fix] No diagnostics in state, bouncing to preview_start`);
    return { ...state, phase: 'preview_start' };
  }

  // Dependency corruption: repair without calling LLM.
  if (diagnostics.cause === 'deps' && !state.depRepairAttempted) {
    ctx.writeSseEvent('status', {
      type: 'status',
      message: 'Repairing broken dependencies...',
      phase: 'fix',
    });
    try {
      await workspaceService.repairDependencyInstall(
        ctx.projectId,
        ctx.userId,
        diagnostics.issues.slice(0, 2).join('; ') || 'Preview startup dependency corruption detected',
      );
      await new Promise(r => setTimeout(r, 4000));
    } catch (error: any) {
      log.warn(`[Pipeline/preview_fix] Dependency repair failed: ${error.message}`);
    }
    return { ...state, depRepairAttempted: true, phase: 'preview_start' };
  }

  // Code fix (imports, hydration, or generic) via AgentLoop.
  const fixMessage =
    diagnostics.cause === 'imports' ? 'Fixing broken imports...' :
    diagnostics.cause === 'hydration' ? 'Fixing hydration mismatch...' :
    'Fixing preview startup...';
  ctx.writeSseEvent('status', { type: 'status', message: fixMessage, phase: 'fix' });

  const fixLoop = new AgentLoop({
    projectId: ctx.projectId,
    mode: 'fast',
    model: PROJECT_FIX_MODEL,
    thinkingLevel: PROJECT_FIX_THINKING_LEVEL,
    userId: ctx.userId,
    userPlan: ctx.userPlan || 'free',
    conversationHistory: [],
    usagePhase: 'verify',
  });
  fixLoop.maxIterations = MAX_FIX_ITERATIONS;

  const targetedNow = diagnostics.cause === 'imports' || diagnostics.cause === 'hydration';
  try {
    await streamAgentLoopToSse({
      stream: fixLoop.run(
        `The preview/dev server is not starting correctly. Fix the real startup issue based on these diagnostics.\n\n` +
        `${diagnostics.context}\n\n` +
        `Rules:\n` +
        `- Fix the root cause, not only symptoms.\n` +
        `- If imports are broken, repair the paths/exports and prefer the @/ alias consistently.\n` +
        `- If the issue is hydration mismatch, make the initial server render deterministic. Move Date.now/Math.random/window/localStorage-dependent UI into useEffect or gate it behind a mounted flag.\n` +
        `- If Next.js build artifacts are stale and code errors also exist, fix the code first.\n` +
        `- If middleware imports server-only libraries, simplify it.\n` +
        `- If there are compile/runtime errors, read the broken files and fix them.\n` +
        `- Save files, then ensure the preview can boot.`,
      ),
      isClientConnected: ctx.isClientConnected,
      writeSseEvent: ctx.writeSseEvent,
    });
  } catch (error: any) {
    log.warn(`[Pipeline/preview_fix] Fix loop error: ${error.message}`);
  }

  await restartPreviewServer(ctx.projectId, ctx.userId);
  await new Promise(r => setTimeout(r, 4000));

  return {
    ...state,
    targetedCodeFixAttempted: state.targetedCodeFixAttempted || targetedNow,
    phase: 'preview_start',
  };
}
