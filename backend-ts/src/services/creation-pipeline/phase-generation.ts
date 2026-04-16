/**
 * Generation phase: run AgentLoop up to N attempts and collect the files
 * produced. Retries on transient upstream errors (overloaded/timeout/429/503)
 * with the same model (we don't fall back to a cheaper one because quality
 * matters more than latency at creation time).
 *
 * Transitions:
 * - at least one file generated  → ts_fix
 * - nothing generated + error    → finalize (with generationError set)
 */

import { log } from '../../utils/logger';
import { config } from '../../config';
import { AgentLoop } from '../agent-loop.service';
import { streamAgentLoopToSse } from '../agent-loop-stream.service';
import { getProjectCreationSystemPrompt } from '../project-creation-prompt';
import { getProjectGenerationRuntimePolicy, ProjectComplexity } from '../project-complexity.service';
import type { PipelineContext, PipelineState } from './types';

const PROJECT_CREATION_MODEL = config.projectGenerationModel;
const PROJECT_CREATION_THINKING_LEVEL = config.projectGenerationThinkingLevel;

function isRetriableCreationError(message: string | null | undefined): boolean {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('etimedout') ||
    normalized.includes('overloaded') ||
    normalized.includes('overload') ||
    normalized.includes('temporarily') ||
    normalized.includes('service unavailable') ||
    normalized.includes('503') ||
    normalized.includes('429') ||
    normalized.includes('internal error')
  );
}

function shouldRetryCreationAttempt(input: {
  complexity: ProjectComplexity;
  generatedFileCount: number;
  filesCreated: number;
  totalCostEur: number;
  errorMessage: string | null;
}): boolean {
  if (!isRetriableCreationError(input.errorMessage)) return false;
  const policy = getProjectGenerationRuntimePolicy(input.complexity);
  if (!policy.retryRequiresNearEmptyOutput) return true;
  const generatedCount = Math.max(input.generatedFileCount, input.filesCreated);
  return generatedCount <= policy.retryMaxGeneratedFiles && input.totalCostEur <= policy.retryMaxCostEur;
}

export async function runGeneration(state: PipelineState, ctx: PipelineContext): Promise<PipelineState> {
  const policy = getProjectGenerationRuntimePolicy(state.projectComplexity);

  ctx.writeSseEvent('status', {
    type: 'status',
    phase: 'generation',
    message: 'Imposto struttura, pagine e componenti principali...',
  });

  let loopErrorMessage: string | null = null;
  let filesCreated = state.filesCreated;
  const generatedFiles = new Set(state.generatedFiles);
  let totalInputTokens = state.totalInputTokens;
  let totalOutputTokens = state.totalOutputTokens;
  let totalCostEur = state.totalCostEur;

  try {
    for (let attemptIndex = 0; attemptIndex < policy.maxAttempts; attemptIndex += 1) {
      const model = PROJECT_CREATION_MODEL;
      const isFinalAttempt = attemptIndex === policy.maxAttempts - 1;
      state.tracker.updateSummary({ aiModel: model });

      const agentLoop = new AgentLoop({
        projectId: ctx.projectId,
        mode: 'fast',
        model,
        systemPromptOverride: getProjectCreationSystemPrompt(
          ctx.sessionProjectType || 'nextjs',
          false,
          null,
          null,
        ),
        userId: ctx.userId,
        userPlan: ctx.userPlan || 'free',
        conversationHistory: [],
        thinkingLevel: PROJECT_CREATION_THINKING_LEVEL,
        taskBudgetTokens: config.projectGenerationTaskBudgetEnabled ? policy.taskBudgetTokens : undefined,
        usagePhase: 'generation',
      });

      agentLoop.maxIterations = policy.maxIterations;
      let attemptErrorMessage: string | null = null;

      await streamAgentLoopToSse({
        stream: agentLoop.run(ctx.prompt),
        isClientConnected: ctx.isClientConnected,
        writeSseEvent: ctx.writeSseEvent,
        suppressErrorEvent: !isFinalAttempt,
        onToolStart: (event) => {
          if (event.tool === 'write_file') filesCreated++;
        },
        onToolInput: (event) => {
          if (event.tool !== 'write_file') return;
          const input = (event.input || {}) as Record<string, unknown>;
          const filePath = input.file_path || input.path || input.filePath;
          if (typeof filePath === 'string' && filePath.trim()) {
            generatedFiles.add(filePath.trim());
          }
        },
        onUsage: (event) => {
          const ev = event as any;
          totalInputTokens = ev.totalInputTokens || ev.inputTokens || totalInputTokens;
          totalOutputTokens = ev.totalOutputTokens || ev.outputTokens || totalOutputTokens;
          ctx.writeSseEvent('usage', {
            type: 'usage',
            costEur: ev.totalCostEur,
            tokensUsed: { input: ev.totalInputTokens, output: ev.totalOutputTokens },
          });
          totalCostEur = ev.totalCostEur || totalCostEur;
          state.tracker.updateSummary({
            aiModel: model,
            aiTokensUsed: totalInputTokens + totalOutputTokens,
            aiGenerationCostEur: totalCostEur,
            aiGenerationTokensUsed: totalInputTokens + totalOutputTokens,
            aiTotalCostEur: totalCostEur,
          });
        },
        onComplete: (event) => {
          log.info(`[Pipeline/generation] AgentLoop completed for ${ctx.projectId} on ${model}: ${event.result || 'done'}`);
        },
        onIterationStart: (event) => {
          log.info(`[Pipeline/generation] AgentLoop iteration ${event.iteration} for ${ctx.projectId} on ${model}`);
        },
        onError: (event) => {
          attemptErrorMessage = event.error || event.message || 'Agent loop failed';
        },
      });

      if (!attemptErrorMessage) {
        loopErrorMessage = null;
        break;
      }

      loopErrorMessage = attemptErrorMessage;
      log.warn(`[Pipeline/generation] Model ${model} failed for ${ctx.projectId}: ${attemptErrorMessage}`);

      if (
        isFinalAttempt ||
        !shouldRetryCreationAttempt({
          complexity: state.projectComplexity,
          generatedFileCount: generatedFiles.size,
          filesCreated,
          totalCostEur,
          errorMessage: attemptErrorMessage,
        })
      ) {
        break;
      }

      ctx.writeSseEvent('processing', {
        type: 'processing',
        message: 'Errore temporaneo del motore, ritento automaticamente...',
        retryModel: PROJECT_CREATION_MODEL,
        retryAttempt: attemptIndex + 1,
      });
    }
  } catch (loopErr: any) {
    loopErrorMessage = loopErr.message || 'Agent loop failed';
    log.error(`[Pipeline/generation] AgentLoop error for ${ctx.projectId}: ${loopErr.message}`);
    log.error(`[Pipeline/generation] AgentLoop stack: ${loopErr.stack}`);
  }

  const generatedFileList = Array.from(generatedFiles);
  state.tracker.updateSummary({
    aiModel: state.modelUsed,
    filesGenerated: generatedFileList.length || filesCreated,
    generatedFiles: generatedFileList,
    aiTokensUsed: totalInputTokens + totalOutputTokens,
    aiGenerationCostEur: totalCostEur,
    aiGenerationTokensUsed: totalInputTokens + totalOutputTokens,
    aiTotalCostEur: totalCostEur,
  });

  if (loopErrorMessage) {
    state.tracker.failAction(state.generationActionId, loopErrorMessage);
  } else {
    state.tracker.completeAction(state.generationActionId, {
      filesCreated,
      generatedFiles: generatedFileList,
    });
  }

  log.info(`[Pipeline/generation] Finished for ${ctx.projectId}, files: ${filesCreated}`);

  const next: PipelineState = {
    ...state,
    filesCreated,
    generatedFiles,
    totalInputTokens,
    totalOutputTokens,
    totalCostEur,
    generationError: loopErrorMessage,
  };

  // Nothing to verify — bail straight to finalize.
  if (loopErrorMessage && generatedFileList.length === 0) {
    log.warn(`[Pipeline/generation] Aborting verify: creation failed before generating files`);
    if (ctx.isClientConnected()) {
      ctx.writeSseEvent('error', { type: 'error', error: loopErrorMessage });
    }
    return { ...next, phase: 'finalize' };
  }

  // Start QA action in the build report so the downstream phases can update it.
  state.tracker.startAction(
    'qa',
    'QA Verification — functional + visual testing',
    'Starting preview, verification, and auto-fix checks',
  );
  ctx.writeSseEvent('status', {
    type: 'status',
    phase: 'verify',
    message: 'Controllo il progetto e correggo eventuali problemi...',
  });

  return { ...next, phase: 'ts_fix' };
}
