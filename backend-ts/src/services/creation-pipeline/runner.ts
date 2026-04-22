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
import { resolveProjectTechnology } from '../project-technology';
import { config as appConfig } from '../../config';
import { provisionDrapeCloudForProject } from '../drape-cloud/provision';
import { isDrapeCloudConfigured } from '../drape-cloud/client';
import { scaffoldDrapeCloudCRUD } from '../drape-cloud/scaffold-crud';
import { readDeclared } from '../drape-cloud/declared-tables.service';
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
  // Resolve the canonical technology BEFORE creating the tracker so the
  // build-report persists the user-selected template (e.g. "html") instead of
  // the detector-derived label ("static") that doesn't match the prompt +
  // auto-fix systems' naming.
  const resolvedTechnology = await resolveProjectTechnology(
    ctx.projectId,
    ctx.sessionProjectType,
    'nextjs',
  );

  const tracker = new BuildReportTracker(
    ctx.projectId,
    ctx.projectName || ctx.projectId.replace(/^project-/, '') || ctx.projectId,
    resolvedTechnology,
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
  let useDrapeCloud = false;
  let creationDescription = '';
  let creationAnswers: Record<string, string | string[]> = {};
  let creationTitle = ctx.projectName || '';
  try {
    const creationInput = await fileService.readFile(ctx.projectId, '.drape/creation-input.json');
    if (creationInput.success && creationInput.data?.content) {
      const parsed = JSON.parse(creationInput.data.content);
      useDrapeCloud = parsed?.useDrapeCloud === true;
      creationDescription = typeof parsed.description === 'string' ? parsed.description : '';
      creationAnswers =
        parsed.structuredAnswers && typeof parsed.structuredAnswers === 'object'
          ? (parsed.structuredAnswers as Record<string, string | string[]>)
          : {};
      if (typeof parsed.projectName === 'string' && parsed.projectName) {
        creationTitle = parsed.projectName;
      }
      const complexity = assessProjectComplexity({
        technology: resolvedTechnology,
        description: creationDescription,
        answers: creationAnswers,
        cloudMode: false,
      });
      projectComplexity = complexity.level;
      tracker.updateSummary({
        creationPrompt: creationDescription,
        creationAnswers,
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

  // Drape Cloud provisioning — done before generation so the AI can
  // reference the SDK/env from the very first file it writes. Soft-
  // fails: if provisioning errors, we continue with useDrapeCloud=false
  // rather than blocking creation entirely.
  if (useDrapeCloud) {
    if (!appConfig.drapeCloudEnabled || !isDrapeCloudConfigured()) {
      log.warn(`[Pipeline] useDrapeCloud requested but cloud is disabled — falling back`);
      useDrapeCloud = false;
    } else {
      try {
        await provisionDrapeCloudForProject(ctx.projectId, ctx.userId, resolvedTechnology, {
          description: creationDescription,
          structuredAnswers: creationAnswers,
          projectTitle: creationTitle,
        });
        // Schema-first scaffolding: with declared-tables.json now written,
        // seed one CRUD page per table so the AI inherits working SDK calls
        // instead of reaching for useState([...mock...]) arrays.
        try {
          const declared = await readDeclared(ctx.projectId);
          const scaffold = await scaffoldDrapeCloudCRUD(
            ctx.projectId,
            resolvedTechnology,
            declared.tables,
          );
          if (scaffold.written.length > 0) {
            log.info(`[Pipeline] Scaffolded ${scaffold.written.length} CRUD page(s): ${scaffold.written.join(', ')}`);
          }
        } catch (err: any) {
          log.warn(`[Pipeline] CRUD scaffolding failed (non-fatal): ${err.message}`);
        }
      } catch (err: any) {
        log.warn(`[Pipeline] Drape Cloud provisioning failed: ${err.message}`);
        useDrapeCloud = false;
      }
    }
  }

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
    resolvedTechnology,
    useDrapeCloud,
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
