/**
 * Creation pipeline runner — main dispatch loop.
 *
 * Each phase is a pure function of (state, ctx) that runs its side effects
 * and returns the next state. The loop logs every transition for
 * observability and short-circuits to 'finalize' if the client disconnects
 * mid-run, so we always flush a build-report to disk.
 */

import { fileService } from '../file.service';
import { BuildReportTracker } from '../build-report.service';
import { assessProjectComplexity, getProjectGenerationRuntimePolicy } from '../project-complexity.service';
import { log } from '../../utils/logger';
import { config } from '../../config';
import type { PipelineContext, PipelinePhase, PipelineState } from './types';
import { runGeneration } from './phase-generation';
import { runTsFix } from './phase-ts-fix';
import { runPreviewStart, runPreviewFix } from './phase-preview';
import { runFullVerify } from './phase-verify';
import { runFinalize } from './phase-finalize';

const PROJECT_CREATION_MODEL = config.projectGenerationModel;

async function createInitialState(ctx: PipelineContext): Promise<PipelineState> {
  const tracker = new BuildReportTracker(
    ctx.projectId,
    ctx.projectName || ctx.projectId.replace(/^project-/, '') || ctx.projectId,
    ctx.sessionProjectType || 'nextjs',
    false,
  );
  tracker.updateSummary({
    aiModel: PROJECT_CREATION_MODEL,
    aiTokensUsed: 0,
    filesGenerated: 0,
    generatedFiles: [],
  });

  // Seed complexity from the stored creation-input.json (if present).
  // Missing/malformed input is silently tolerated: we fall back to 'medium'.
  let projectComplexity: PipelineState['projectComplexity'] = 'medium';
  try {
    const creationInput = await fileService.readFile(ctx.projectId, '.drape/creation-input.json');
    if (creationInput.success && creationInput.data?.content) {
      const parsed = JSON.parse(creationInput.data.content);
      const complexity = assessProjectComplexity({
        technology: ctx.sessionProjectType || 'nextjs',
        description: typeof parsed.description === 'string' ? parsed.description : '',
        answers: parsed.structuredAnswers && typeof parsed.structuredAnswers === 'object'
          ? parsed.structuredAnswers
          : {},
        cloudMode: false,
      });
      projectComplexity = complexity.level;
      tracker.updateSummary({
        creationPrompt: typeof parsed.description === 'string' ? parsed.description : '',
        creationAnswers: parsed.structuredAnswers && typeof parsed.structuredAnswers === 'object'
          ? parsed.structuredAnswers
          : {},
        projectComplexity: complexity.level,
        projectComplexityScore: complexity.score,
      });
    }
  } catch {}

  const generationActionId = tracker.startAction(
    'generation',
    'Generating project files',
    'Creating the app structure with the AI agent',
  );

  // Touch the policy so it's resolved here (kept for symmetry with old flow).
  getProjectGenerationRuntimePolicy(projectComplexity);

  return {
    phase: 'generation',
    filesCreated: 0,
    generatedFiles: new Set<string>(),
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostEur: 0,
    generationError: null,
    modelUsed: PROJECT_CREATION_MODEL,
    projectComplexity,
    tsFixAttempt: 0,
    previewStartAttempt: 0,
    depRepairAttempted: false,
    targetedCodeFixAttempted: false,
    lastPreviewDiagnostics: null,
    fullVerifyDone: false,
    previewOk: false,
    tracker,
    generationActionId,
  };
}

export async function runCreationPipeline(ctx: PipelineContext): Promise<void> {
  log.info(`[Pipeline] Start for ${ctx.projectId}`);
  let state = await createInitialState(ctx);

  while (state.phase !== 'done') {
    const phase: PipelinePhase = state.phase;
    log.info(`[Pipeline] → ${phase}`);

    // Client disconnected mid-run: always flush report then exit cleanly.
    if (!ctx.isClientConnected() && phase !== 'finalize') {
      log.warn(`[Pipeline] Client disconnected during ${phase}, jumping to finalize`);
      state = { ...state, phase: 'finalize' };
      continue;
    }

    switch (phase) {
      case 'generation':
        state = await runGeneration(state, ctx);
        break;
      case 'ts_fix':
        state = await runTsFix(state, ctx);
        break;
      case 'preview_start':
        state = await runPreviewStart(state, ctx);
        break;
      case 'preview_fix':
        state = await runPreviewFix(state, ctx);
        break;
      case 'full_verify':
        state = await runFullVerify(state, ctx);
        break;
      case 'finalize':
        state = await runFinalize(state, ctx);
        break;
    }
  }

  log.info(`[Pipeline] Complete for ${ctx.projectId} (previewOk=${state.previewOk})`);
}
