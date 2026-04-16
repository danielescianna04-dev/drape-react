/**
 * TypeScript compile-error fix phase.
 *
 * Runs `npx tsc --noEmit` in the container and if it finds errors, invokes
 * AgentLoop in verify mode to read+fix the broken files. Up to 3 cycles.
 *
 * Transitions: always → preview_start (even if residual errors remain;
 * the preview layer will surface them through build failures).
 */

import { log } from '../../utils/logger';
import { config } from '../../config';
import { workspaceService } from '../workspace.service';
import { AgentLoop } from '../agent-loop.service';
import { streamAgentLoopToSse } from '../agent-loop-stream.service';
import type { PipelineContext, PipelineState } from './types';

const PROJECT_FIX_MODEL = config.projectVerifyFixModel;
const PROJECT_FIX_THINKING_LEVEL = config.projectVerifyFixThinkingLevel;
const MAX_TS_FIX_ATTEMPTS = 3;
const MAX_LOOP_ITERATIONS = 15;

async function waitForContainer(projectId: string, userId: string) {
  for (let w = 0; w < 10; w++) {
    try {
      const s = await workspaceService.getOrCreateContainer(projectId, userId);
      if (s?.containerId) return;
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }
}

export async function runTsFix(state: PipelineState, ctx: PipelineContext): Promise<PipelineState> {
  await waitForContainer(ctx.projectId, ctx.userId);

  for (let fixAttempt = 0; fixAttempt < MAX_TS_FIX_ATTEMPTS; fixAttempt++) {
    let compileErrors = '';
    try {
      const tscResult = await workspaceService.exec(
        ctx.projectId,
        ctx.userId,
        'cd /home/coder/project && npx tsc --noEmit --pretty 2>&1 | head -60 || true',
      );
      const output = tscResult.stdout || '';
      log.info(`[Pipeline/ts_fix] tsc (${output.length} chars): ${output.substring(0, 120)}...`);
      if (output.includes('error TS')) {
        compileErrors = output.trim();
      }
    } catch (error: any) {
      log.warn(`[Pipeline/ts_fix] tsc failed: ${error.message}`);
    }

    if (!compileErrors) {
      log.info(`[Pipeline/ts_fix] Compile check passed for ${ctx.projectId}`);
      break;
    }

    const errorCount = (compileErrors.match(/error TS/g) || []).length;
    log.info(`[Pipeline/ts_fix] ${errorCount} errors, fix ${fixAttempt + 1} for ${ctx.projectId}`);
    ctx.writeSseEvent('status', { type: 'status', message: `Fixing ${errorCount} compile errors...`, phase: 'fix' });

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
    fixLoop.maxIterations = MAX_LOOP_ITERATIONS;

    try {
      await streamAgentLoopToSse({
        stream: fixLoop.run(
          `Fix these TypeScript errors:\n\n${compileErrors}\n\n` +
          `Read each broken file, fix the error, save. Then run: npx tsc --noEmit 2>&1 | head -30`,
        ),
        isClientConnected: ctx.isClientConnected,
        writeSseEvent: ctx.writeSseEvent,
      });
    } catch (error: any) {
      log.warn(`[Pipeline/ts_fix] Fix loop error: ${error.message}`);
    }
  }

  return { ...state, phase: 'preview_start' };
}
