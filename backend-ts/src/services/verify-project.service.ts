/**
 * Top-level verify orchestrator.
 *
 * Drives up to 3 verify/auto-fix cycles (plus bonus/escalation slots),
 * persists the verification report, and runs SSR capture on success.
 *
 * The four responsibility areas that used to live here are now in verify/:
 * - verify/error-classifier.ts — regex + pure helpers
 * - verify/server-wait.ts      — wait for dev server + restart
 * - verify/runner.ts           — single verify pass (qa-agent/e2e-check + route enumeration)
 * - verify/auto-fix-orchestrator.ts — LLM auto-fix cycle + cost readers
 */

import { log } from '../utils/logger';
import { workspaceService } from './workspace.service';
import { fileService } from './file.service';
import { appendRuntimeAction, mergeBuildReportSummary } from './build-report.service';
import { config } from '../config';
import { getProjectAIBudgetCaps, shouldAllowPremiumEscalation } from './project-ai-policy';
import { metricsService } from './metrics.service';
import { enqueueBatchFailureReview } from './anthropic-batch-review.service';
import {
  CACHE_CORRUPTION_ERROR_REGEX,
  STRUCTURAL_FIXABLE_ERROR_REGEX,
  buildErrorCluster,
  estimateImpactedFiles,
  hasBlankPageVisibleContentError,
  hasHydrationMismatch,
  hasOnlyCheapFixErrors,
  hasOnlyHydrationStyleFailures,
  hasReactChildRenderError,
  hasRepeatedFailureCluster,
  hasUserImportResolutionErrors,
  isProjectNearlyWorking,
  shouldEscalateAutoFix,
  shouldStopLostProject,
} from './verify/error-classifier';
import { restartDevServer } from './verify/server-wait';
import { verify } from './verify/runner';
import {
  autoFix,
  readProjectAICostSummary,
  readProjectComplexity,
} from './verify/auto-fix-orchestrator';
import type { AutoFixOptions, VerifyOptions, VerifyResult } from './verify/types';

export type { VerifyResult, VerifyOptions } from './verify/types';

const VERIFY_MAX_ATTEMPTS = 3;
const VERIFY_BONUS_ATTEMPTS_FOR_NEW_FIXABLE_ERROR = 1;
const VERIFY_QA_INFRA_RETRIES_PER_ATTEMPT = 1;

// Puppeteer/Chromium infrastructure failures — NOT real app bugs.
// When qa-agent crashes at the protocol level, the attempt is wasted.
// Detect and retry in place without spending an attempt slot.
const QA_INFRA_CRASH_REGEX = /QA agent fatal error:.*(Protocol error|Connection closed|Target closed|Session closed|Page has been closed|Navigation timeout|net::ERR_)/i;
function isQaInfraCrash(errors: string[]): boolean {
  if (errors.length !== 1) return false;
  return QA_INFRA_CRASH_REGEX.test(errors[0]);
}

const PROJECT_FIX_MODEL = config.projectVerifyFixModel;
const PROJECT_FIX_THINKING_LEVEL = config.projectVerifyFixThinkingLevel;
const PROJECT_FIX_ESCALATION_MODEL = config.projectVerifyEscalationModel;
const PROJECT_FIX_ESCALATION_THINKING_LEVEL = config.projectVerifyEscalationThinkingLevel;
const PROJECT_FIX_ESCALATION_MAX_COST_EUR = config.projectVerifyEscalationMaxCostEur;
const PROJECT_AI_MAX_COST_EUR = config.projectAiMaxCostEur;
const PROJECT_FIX_ESCALATION_MAX_IMPACTED_FILES = config.projectVerifyEscalationMaxImpactedFiles;

/**
 * Verify a project is working correctly using Puppeteer E2E.
 * If verification fails, auto-fix with AI and re-verify (max 3 attempts).
 * Returns only when project is verified OR max attempts exhausted.
 */
export async function verifyAndFixProject(opts: VerifyOptions): Promise<VerifyResult> {
  const { projectId, userId, technology, onProgress } = opts;
  // Flow: verify → auto-fix → reverify.
  // qa-agent.js does internal fix cycles too, but the outer auto-fix handles
  // e2e-check.js fallback cases where qa-agent timed out.
  let maxAttempts = VERIFY_MAX_ATTEMPTS;
  let bonusAttemptsGranted = 0;

  // ── Verification report accumulator ────────────────────────────────────────
  const verificationReport: any = {
    projectId,
    createdAt: new Date().toISOString(),
    completedAt: '',
    status: 'passed' as string,
    backendVerification: {
      attempts: [] as any[],
      totalDuration: 0,
    },
    qaReport: null as any,
  };
  const reportStartTime = Date.now();

  let lastResult: VerifyResult = { passed: false, errors: [], screenshots: new Map(), serverLog: '' };
  let previousErrorCluster: string[] | null = null;
  let previousAttemptHadFix = false;
  let escalationAttempted = false;
  let lastEscalationDecisionReason: string | null = null;
  let qaInfraRetriesUsedThisAttempt = 0;
  let totalVerifyCheapCostEur = 0;
  let totalVerifyCheapTokens = 0;
  let totalVerifyEscalationCostEur = 0;
  let totalVerifyEscalationTokens = 0;
  const projectComplexity = await readProjectComplexity(projectId, technology);
  const budgetCaps = getProjectAIBudgetCaps(
    technology,
    projectComplexity.level,
    {
      maxProjectCostEur: PROJECT_AI_MAX_COST_EUR,
      maxEscalationCostEur: PROJECT_FIX_ESCALATION_MAX_COST_EUR,
    },
  );

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isRetry = attempt > 0;
    const verifyProgress = 82 + attempt * 6;
    onProgress?.(
      verifyProgress,
      isRetry ? `Verifying after fix (attempt ${attempt + 1})...` : 'Verifying preview...',
      isRetry ? 'Re-Verify' : 'Verify',
    );

    if (isRetry) await new Promise(r => setTimeout(r, 3000));

    const attemptStartTime = Date.now();
    lastResult = await verify(projectId, userId, {
      preferQaAgent: true,
      allowQaFallback: true,
    });
    const attemptDuration = Date.now() - attemptStartTime;

    // Puppeteer protocol/connection crashes are QA infra failures, not app bugs.
    // Don't burn a real attempt slot on them — retry in place up to N times.
    if (!lastResult.passed && isQaInfraCrash(lastResult.errors) && qaInfraRetriesUsedThisAttempt < VERIFY_QA_INFRA_RETRIES_PER_ATTEMPT) {
      qaInfraRetriesUsedThisAttempt += 1;
      log.warn(
        `[Verify] Project ${projectId} QA infra crash on attempt ${attempt + 1} (retry ${qaInfraRetriesUsedThisAttempt}/${VERIFY_QA_INFRA_RETRIES_PER_ATTEMPT}) — not counting this attempt`,
      );
      await appendRuntimeAction(projectId, 'verify', `QA infra crash — retrying (attempt ${attempt + 1})`, {
        status: 'fixed',
        error: lastResult.errors[0] || '',
        details: 'Puppeteer/browser crashed; retrying verify in place without consuming an attempt slot',
      }).catch(() => {});
      attempt -= 1;
      continue;
    }
    qaInfraRetriesUsedThisAttempt = 0;

    // Build attempt record for the report
    const attemptRecord: any = {
      attemptNumber: attempt + 1,
      timestamp: new Date().toISOString(),
      duration: attemptDuration,
      status: lastResult.passed ? 'passed' : 'failed',
      pages: lastResult.pages || [],
      navigation: lastResult.navigation || [],
      errors: lastResult.errors || [],
    };

    // Persist qaReport at top level of verification report (latest wins)
    if (lastResult.qaReport) {
      verificationReport.qaReport = lastResult.qaReport;
    }

    if (lastResult.passed) {
      log.info(`[Verify] Project ${projectId} passed on attempt ${attempt + 1}`);
      verificationReport.backendVerification.attempts.push(attemptRecord);
      break;
    }

    log.info(`[Verify] Project ${projectId} failed on attempt ${attempt + 1}: ${lastResult.errors.length} errors — ${lastResult.errors.slice(0, 3).join('; ')}`);

    const currentErrorCluster = buildErrorCluster(lastResult.errors);

    await appendRuntimeAction(projectId, 'verify', `Verification attempt ${attempt + 1} failed`, {
      status: 'failed',
      error: lastResult.errors.slice(0, 5).join('\n').substring(0, 500),
      details: `${lastResult.errors.length} error(s) found`,
    }).catch(() => {});

    if (previousAttemptHadFix && hasRepeatedFailureCluster(previousErrorCluster, currentErrorCluster)) {
      log.warn(
        `[Verify] Project ${projectId} repeated the same failure cluster after auto-fix on attempt ${attempt + 1} — stopping early`,
      );
      verificationReport.backendVerification.attempts.push({
        ...attemptRecord,
        metadata: {
          ...(attemptRecord.metadata || {}),
          repeatedFailureCluster: currentErrorCluster,
        },
      });
      await appendRuntimeAction(projectId, 'verify', `Repeated failure cluster detected (attempt ${attempt + 1})`, {
        status: 'failed',
        error: currentErrorCluster.slice(0, 3).join('\n').substring(0, 500),
        details: 'Stopping early because the same error cluster repeated after an auto-fix attempt',
      }).catch(() => {});
      await appendRuntimeAction(projectId, 'verify', 'Verification exhausted all attempts', {
        status: 'failed',
        error: 'Stopped early after repeated failure cluster with no meaningful progress',
      }).catch(() => {});
      break;
    }

    // Cache corruption (vendor-chunks, stale webpack) can look similar to real code bugs.
    // If we also have structural/runtime/module errors, do a real AI fix instead of looping
    // forever on ".next cache cleared + restart".
    const cacheCorruptionErrors = lastResult.errors.filter((e) => CACHE_CORRUPTION_ERROR_REGEX.test(e));
    const structuralErrors = lastResult.errors.filter((e) => STRUCTURAL_FIXABLE_ERROR_REGEX.test(e));
    const isCacheCorruption = cacheCorruptionErrors.length > 0;
    const hasStructuralFixableErrors = structuralErrors.length > 0;
    const hydrationMismatchDetected = hasHydrationMismatch(lastResult.errors);
    const importResolutionDetected = hasUserImportResolutionErrors(lastResult.errors);
    const reactChildRenderDetected = hasReactChildRenderError(lastResult.errors);
    const blankPageDetected = hasBlankPageVisibleContentError(lastResult.errors);
    const impactedFilesCount = estimateImpactedFiles(lastResult.errors);
    const escalationDecision = shouldAllowPremiumEscalation({
      summary: await readProjectAICostSummary(projectId),
      alreadyAttempted: escalationAttempted,
      hasEligibleErrors: shouldEscalateAutoFix(lastResult.errors) && attempt >= maxAttempts - 1,
      maxProjectCostEur: budgetCaps.maxProjectCostEur,
      maxEscalationCostEur: budgetCaps.maxEscalationCostEur,
      isProjectNearlyWorking: isProjectNearlyWorking(lastResult),
      impactedFilesCount,
      maxImpactedFiles: PROJECT_FIX_ESCALATION_MAX_IMPACTED_FILES,
      cheapFixOnly: hasOnlyCheapFixErrors(lastResult.errors),
    });
    lastEscalationDecisionReason = escalationDecision.reason;
    const shouldTryEscalatedFix = escalationDecision.allowed;

    if (shouldStopLostProject(lastResult, attempt, previousAttemptHadFix)) {
      log.warn(
        `[Verify] Project ${projectId} still has broad fast-failure errors after cheap fixes — stopping early to avoid more AI spend`,
      );
      verificationReport.backendVerification.attempts.push({
        ...attemptRecord,
        metadata: {
          ...(attemptRecord.metadata || {}),
          stoppedAsLostProject: true,
          impactedFilesCount,
        },
      });
      await appendRuntimeAction(projectId, 'verify', `Stopping early on unrecoverable verify pattern (attempt ${attempt + 1})`, {
        status: 'failed',
        error: currentErrorCluster.slice(0, 4).join('\n').substring(0, 500),
        details: 'The project still shows broad compile/runtime failures after cheap auto-fix, so extra AI retries were skipped to save cost',
        metadata: {
          impactedFilesCount,
          errors: lastResult.errors.length,
          projectComplexity: projectComplexity.level,
        },
      }).catch(() => {});
      await appendRuntimeAction(projectId, 'verify', 'Verification exhausted all attempts', {
        status: 'failed',
        error: 'Stopped early because the project was still far from a working state after cheap fixes',
      }).catch(() => {});
      break;
    }

    if (
      attempt >= maxAttempts - 1 &&
      bonusAttemptsGranted < VERIFY_BONUS_ATTEMPTS_FOR_NEW_FIXABLE_ERROR &&
      previousAttemptHadFix &&
      !hasRepeatedFailureCluster(previousErrorCluster, currentErrorCluster) &&
      (hasStructuralFixableErrors || reactChildRenderDetected)
    ) {
      bonusAttemptsGranted += 1;
      maxAttempts += 1;
      log.warn(
        `[Verify] Project ${projectId} surfaced a new fixable failure on the last planned attempt — granting one bonus verify/fix cycle`,
      );
      await appendRuntimeAction(projectId, 'verify', `Bonus verification attempt granted (attempt ${attempt + 1})`, {
        status: 'fixed',
        error: currentErrorCluster.slice(0, 3).join('\n').substring(0, 500),
        details: 'A new fixable error appeared only after previous auto-fixes, so one extra verification/fix cycle was allowed',
      }).catch(() => {});
    } else if (shouldTryEscalatedFix) {
      escalationAttempted = true;
      maxAttempts += 1;
      log.warn(
        `[Verify] Project ${projectId} reached the cheap auto-fix limit with structural errors — escalating one fix attempt to ${PROJECT_FIX_ESCALATION_MODEL}`,
      );
      await appendRuntimeAction(projectId, 'verify', `Escalating final auto-fix via ${PROJECT_FIX_ESCALATION_MODEL}`, {
        status: 'fixed',
        error: currentErrorCluster.slice(0, 3).join('\n').substring(0, 500),
        details: `Running one premium fix attempt with ${PROJECT_FIX_ESCALATION_MODEL} after cheap auto-fix was exhausted`,
      }).catch(() => {});
    } else if (
      attempt >= maxAttempts - 1 &&
      shouldEscalateAutoFix(lastResult.errors) &&
      escalationDecision.reason !== 'allowed'
    ) {
      await appendRuntimeAction(projectId, 'verify', 'Premium escalation skipped by budget policy', {
        status: 'skipped',
        error: currentErrorCluster.slice(0, 3).join('\n').substring(0, 500),
        details:
          escalationDecision.reason === 'project_budget_exceeded'
            ? `Skipped because project AI spend already reached €${budgetCaps.maxProjectCostEur.toFixed(2)}`
            : escalationDecision.reason === 'escalation_budget_exceeded'
              ? `Skipped because premium verify spend already reached €${budgetCaps.maxEscalationCostEur.toFixed(2)}`
              : escalationDecision.reason === 'already_attempted'
                ? 'Skipped because a premium escalation already ran for this project'
                : escalationDecision.reason === 'project_not_near_working'
                  ? 'Skipped because the project is still too far from a working state for a premium fix to be worth it'
                  : escalationDecision.reason === 'too_many_impacted_files'
                    ? `Skipped because the failure touches too many files (${impactedFilesCount})`
                    : escalationDecision.reason === 'cheap_fix_only'
                      ? 'Skipped because the remaining errors should stay on the cheap fix path'
                      : escalationDecision.reason === 'insufficient_budget_headroom'
                        ? 'Skipped because there is not enough remaining budget headroom for a safe premium escalation'
                        : 'Skipped because current errors are not eligible for premium escalation',
        metadata: {
          policyReason: escalationDecision.reason,
          maxProjectCostEur: budgetCaps.maxProjectCostEur,
          maxEscalationCostEur: budgetCaps.maxEscalationCostEur,
          impactedFilesCount,
          projectComplexity: projectComplexity.level,
        },
      }).catch(() => {});
    } else if (attempt >= maxAttempts - 1) {
      log.warn(`[Verify] Project ${projectId} failed after ${maxAttempts} attempts`);
      verificationReport.backendVerification.attempts.push(attemptRecord);
      await appendRuntimeAction(projectId, 'verify', 'Verification exhausted all attempts', {
        status: 'failed',
        error: `Failed after ${maxAttempts} attempts`,
      }).catch(() => {});
      break;
    }

    if (attempt > 0 && previousAttemptHadFix && hasOnlyHydrationStyleFailures(lastResult.errors)) {
      log.warn(
        `[Verify] Project ${projectId} still fails on hydration-only issues after an auto-fix cycle — stopping early`,
      );
      verificationReport.backendVerification.attempts.push({
        ...attemptRecord,
        metadata: {
          ...(attemptRecord.metadata || {}),
          hydrationMismatchStop: true,
        },
      });
      await appendRuntimeAction(projectId, 'verify', `Hydration mismatch remained after auto-fix (attempt ${attempt + 1})`, {
        status: 'failed',
        error: lastResult.errors.slice(0, 3).join('\n').substring(0, 500),
        details: 'Stopping early because only hydration-style SSR/client mismatches remain after a fix cycle',
      }).catch(() => {});
      await appendRuntimeAction(projectId, 'verify', 'Verification exhausted all attempts', {
        status: 'failed',
        error: 'Stopped early after hydration mismatch persisted after auto-fix',
      }).catch(() => {});
      break;
    }

    if (isCacheCorruption && !hasStructuralFixableErrors) {
      log.info(`[Verify] Cache corruption detected for ${projectId} — clearing .next and restarting`);
      try {
        await workspaceService.exec(projectId, userId, 'find /home/coder/project/.next -mindepth 1 -delete 2>/dev/null || true');
        await new Promise(r => setTimeout(r, 2000));
      } catch {}
      await appendRuntimeAction(projectId, 'verify', `Cache cleared + restart (attempt ${attempt + 1})`, {
        status: 'fixed',
        fix: 'Cleared .next cache and restarted dev server',
      }).catch(() => {});
      verificationReport.backendVerification.attempts.push(attemptRecord);
      previousErrorCluster = currentErrorCluster;
      previousAttemptHadFix = true;
      continue;
    }

    if (isCacheCorruption && hasStructuralFixableErrors) {
      log.info(
        `[Verify] Mixed cache + structural errors for ${projectId} — running AI fix instead of restart-only loop`,
      );
      await appendRuntimeAction(projectId, 'verify', `Mixed runtime/build errors detected (attempt ${attempt + 1})`, {
        status: 'failed',
        error: structuralErrors.slice(0, 3).join('\n').substring(0, 500),
        details: 'Skipping cache-only recovery because structural code errors were also detected',
      }).catch(() => {});
    }

    const fixStageMessage = shouldTryEscalatedFix
      ? 'Escalating complex fix...'
      : hydrationMismatchDetected
        ? 'Fixing hydration mismatch...'
        : reactChildRenderDetected
          ? 'Fixing invalid React child render...'
          : blankPageDetected
            ? 'Fixing blank page content...'
            : importResolutionDetected
              ? 'Fixing broken imports...'
              : `Fixing ${lastResult.errors.length} error(s)...`;
    onProgress?.(Math.min(95, verifyProgress + 3), fixStageMessage, 'Auto-Fix');
    const fixOptions: AutoFixOptions = shouldTryEscalatedFix
      ? {
          model: PROJECT_FIX_ESCALATION_MODEL,
          thinkingLevel: PROJECT_FIX_ESCALATION_THINKING_LEVEL,
          escalated: true,
          taskBudgetTokens: config.projectVerifyEscalationTaskBudgetEnabled
            ? config.projectVerifyEscalationTaskBudgetTokens
            : undefined,
        }
      : {
          model: PROJECT_FIX_MODEL,
          thinkingLevel: PROJECT_FIX_THINKING_LEVEL,
        };
    const fixResult = await autoFix(projectId, userId, technology, lastResult, fixOptions);

    if (fixResult.applied) {
      attemptRecord.fixes = [{
        model: fixOptions.model,
        filesModified: fixResult.filesModified,
        duration: fixResult.duration,
      }];
      await appendRuntimeAction(projectId, 'verify', `${fixOptions.escalated ? 'Escalated auto-fix' : 'Auto-fix'} applied (attempt ${attempt + 1})`, {
        status: 'fixed',
        fix: `Modified ${fixResult.filesModified.length} file(s): ${fixResult.filesModified.slice(0, 3).join(', ')}${fixResult.filesModified.length > 3 ? '...' : ''}`,
        metadata: { filesModified: fixResult.filesModified, model: fixOptions.model, escalated: !!fixOptions.escalated },
      }).catch(() => {});
    }

    if (fixOptions.escalated) {
      totalVerifyEscalationCostEur += fixResult.costEur;
      totalVerifyEscalationTokens += fixResult.inputTokens + fixResult.outputTokens;
    } else {
      totalVerifyCheapCostEur += fixResult.costEur;
      totalVerifyCheapTokens += fixResult.inputTokens + fixResult.outputTokens;
    }
    if (fixResult.inputTokens > 0 || fixResult.outputTokens > 0 || fixResult.costEur > 0) {
      metricsService.trackAIUsage({
        userId,
        projectId,
        phase: fixOptions.escalated ? 'verify_escalation' : 'verify',
        model: fixOptions.model,
        inputTokens: fixResult.inputTokens,
        outputTokens: fixResult.outputTokens,
        costEur: fixResult.costEur,
      });
    }
    await mergeBuildReportSummary(projectId, {
      aiVerifyCostEur: totalVerifyCheapCostEur,
      aiVerifyTokensUsed: totalVerifyCheapTokens,
      aiVerifyEscalationCostEur: totalVerifyEscalationCostEur,
      aiVerifyEscalationTokensUsed: totalVerifyEscalationTokens,
      aiTotalCostEur: totalVerifyCheapCostEur + totalVerifyEscalationCostEur,
    }).catch(() => {});

    if (fixOptions.escalated) {
      attemptRecord.metadata = {
        ...(attemptRecord.metadata || {}),
        escalatedFix: true,
        escalatedModel: fixOptions.model,
        costEur: fixResult.costEur,
        tokensUsed: fixResult.inputTokens + fixResult.outputTokens,
      };
    }

    verificationReport.backendVerification.attempts.push(attemptRecord);
    previousErrorCluster = currentErrorCluster;
    previousAttemptHadFix = fixResult.applied;

    if (!fixResult.applied) {
      log.warn(`[Verify] Auto-fix could not apply fixes for ${projectId} on attempt ${attempt + 1} — will retry`);
      await appendRuntimeAction(projectId, 'verify', `${fixOptions.escalated ? 'Escalated auto-fix' : 'Auto-fix'} could not apply (attempt ${attempt + 1})`, {
        status: 'failed',
        error: 'AI returned no valid fix — will retry',
        details: fixOptions.escalated ? `Premium fix attempt via ${fixOptions.model} returned no applicable patch` : undefined,
      }).catch(() => {});
      if (fixOptions.escalated) {
        await appendRuntimeAction(projectId, 'verify', 'Verification exhausted all attempts', {
          status: 'failed',
          error: `Escalated fix via ${fixOptions.model} did not resolve the project`,
        }).catch(() => {});
        break;
      }
      continue;
    }

    await restartDevServer(projectId, userId);
  }

  // ── Finalize and persist verification report ─────────────────────────────
  const shouldQueueBatchFailureReview =
    !lastResult.passed &&
    config.projectBatchFailureReviewEnabled &&
    !escalationAttempted &&
    shouldEscalateAutoFix(lastResult.errors) &&
    !!lastEscalationDecisionReason &&
    !['allowed', 'already_attempted', 'cheap_fix_only'].includes(lastEscalationDecisionReason);

  if (shouldQueueBatchFailureReview) {
    void enqueueBatchFailureReview(projectId).catch((error: any) => {
      log.warn(`[Verify] Failed to queue async discounted failure review for ${projectId}: ${error.message}`);
    });
  }

  verificationReport.completedAt = new Date().toISOString();
  verificationReport.status = lastResult.passed ? 'passed' : 'failed';
  verificationReport.backendVerification.totalDuration = Date.now() - reportStartTime;

  // Strip base64 screenshots from report to keep file size manageable (< 10MB)
  // Screenshots are already saved separately in e2e-results.json / qa-report.json
  const reportToSave = JSON.parse(JSON.stringify(verificationReport));
  if (reportToSave.backendVerification?.attempts) {
    for (const a of reportToSave.backendVerification.attempts) {
      if (a.pages) a.pages.forEach((p: any) => delete p.screenshot);
      if (a.navigation) a.navigation.forEach((n: any) => {
        delete n.screenshotBefore;
        delete n.screenshotAfter;
      });
    }
  }

  try {
    await fileService.writeFile(projectId, '.drape/verification-report.json',
      JSON.stringify(reportToSave, null, 2));
    log.info(`[Verify] Saved verification report for ${projectId}`);
  } catch (err) {
    log.warn('[Verify] Failed to save verification report:', err);
  }

  // SSR capture is only worth doing for a verified preview. On failed projects it
  // just burns up to 60s without improving outcome.
  if (lastResult.passed) {
    onProgress?.(96, 'Rendering preview...', 'Rendering');
    try {
      const ssrScriptSrc = require('path').join(__dirname, '../../scripts/ssr-capture.js');
      const { config: appConfig } = require('../config');
      const ssrScriptDst = require('path').join(appConfig.projectsRoot, projectId, '.ssr-capture.js');
      require('fs').copyFileSync(ssrScriptSrc, ssrScriptDst);

      const ssrResult = await workspaceService.exec(projectId, userId,
        'NODE_PATH=/usr/local/lib/node_modules timeout 60 node /home/coder/project/.ssr-capture.js 2>/dev/null',
      );
      const ssr = JSON.parse(ssrResult.stdout || '{}');
      if (ssr.pages?.length > 0) {
        log.info(`[Verify] SSR captured ${ssr.pages.length} pages for ${projectId}`);

        // Verify SSR quality — check that CSS is actually present
        const { config: appConfig2 } = require('../config');
        const ssrIndexPath = require('path').join(appConfig2.projectsRoot, projectId, '.ssr', 'index.html');
        try {
          const ssrHtml = require('fs').readFileSync(ssrIndexPath, 'utf-8');
          const hasTailwindCSS = ssrHtml.includes('.flex') || ssrHtml.includes('.min-h-screen') || ssrHtml.includes('background-color');
          const hasCDN = ssrHtml.includes('cdn.tailwindcss.com');
          const hasContent = ssrHtml.length > 2000;

          if (!hasTailwindCSS && !hasCDN) {
            log.warn(`[Verify] SSR HTML has no Tailwind CSS and no CDN fallback — injecting CDN`);
            const fixed = ssrHtml.replace('</head>', '  <script src="https://cdn.tailwindcss.com"></script>\n</head>');
            require('fs').writeFileSync(ssrIndexPath, fixed);
            const ssrDir = require('path').join(appConfig2.projectsRoot, projectId, '.ssr');
            for (const f of require('fs').readdirSync(ssrDir)) {
              if (f === 'index.html' || f === 'manifest.json') continue;
              const fp = require('path').join(ssrDir, f);
              const content = require('fs').readFileSync(fp, 'utf-8');
              if (!content.includes('cdn.tailwindcss.com') && !content.includes('.flex')) {
                require('fs').writeFileSync(fp, content.replace('</head>', '  <script src="https://cdn.tailwindcss.com"></script>\n</head>'));
              }
            }
            log.info(`[Verify] Injected CDN fallback into all SSR pages`);
          } else {
            log.info(`[Verify] SSR quality OK (tailwind=${hasTailwindCSS}, cdn=${hasCDN}, size=${ssrHtml.length})`);
          }

          if (!hasContent) {
            log.warn(`[Verify] SSR HTML too small (${ssrHtml.length} bytes) — may be empty`);
          }
        } catch (checkErr: any) {
          log.warn(`[Verify] SSR quality check failed: ${checkErr.message}`);
        }
      } else {
        log.warn(`[Verify] SSR capture returned no pages for ${projectId}`);
      }
    } catch (ssrErr: any) {
      log.warn(`[Verify] SSR capture failed: ${ssrErr.message} — preview will use proxy fallback`);
    }
  } else {
    log.info(`[Verify] Skipping SSR capture for failed project ${projectId}`);
  }

  onProgress?.(lastResult.passed ? 98 : 96, lastResult.passed ? 'Preview verified!' : 'Verification finished', lastResult.passed ? 'Verified' : 'Verify');
  return lastResult;
}
