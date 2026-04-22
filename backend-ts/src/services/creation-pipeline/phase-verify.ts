/**
 * Full verification phase.
 *
 * This is the ONLY phase that calls verifyAndFixProject. The fullVerifyDone
 * flag in PipelineState guarantees it runs at most once per pipeline —
 * eliminating the "run verify as fallback, then run it again as final
 * confirmation" double-execution that was implicit in the old if/else chain.
 *
 * Transition: always → finalize, after updating previewOk.
 */

import { log } from '../../utils/logger';
import { verifyAndFixProject } from '../verify-project.service';
import { enforceSdkUsageGate } from '../drape-cloud/sdk-usage-gate';
import type { PipelineContext, PipelineState } from './types';

export async function runFullVerify(state: PipelineState, ctx: PipelineContext): Promise<PipelineState> {
  if (state.fullVerifyDone) {
    // Guard: should never happen because the phase dispatcher doesn't loop
    // back into full_verify, but if someone adds a transition in the future
    // this makes the invariant explicit.
    log.warn(`[Pipeline/full_verify] Already ran for ${ctx.projectId}, skipping second pass`);
    return { ...state, phase: 'finalize' };
  }

  ctx.writeSseEvent('status', {
    type: 'status',
    message: state.previewOk
      ? 'Preview pronta. Faccio gli ultimi controlli su rotte e runtime...'
      : 'Running deeper verification...',
    phase: 'verify',
  });

  let passed = false;
  try {
    const result = await verifyAndFixProject({
      projectId: ctx.projectId,
      userId: ctx.userId,
      technology: state.resolvedTechnology,
      onProgress: (_pct, msg) => {
        if (ctx.isClientConnected()) {
          ctx.writeSseEvent('status', { type: 'status', message: msg, phase: 'verify' });
        }
      },
    });
    passed = result.passed;
    if (!passed) {
      log.warn(
        `[Pipeline/full_verify] Found ${result.errors.length} issues: ${result.errors.slice(0, 3).join('; ')}`,
      );
    } else {
      log.info(`[Pipeline/full_verify] Passed for ${ctx.projectId}`);
    }
  } catch (error: any) {
    log.warn(`[Pipeline/full_verify] Threw: ${error.message}`);
    passed = false;
  }

  // Drape Cloud SDK usage gate — runs only for cloud projects. Re-scaffolds
  // any declared table that the AI failed to wire, so the project always
  // ships with a working data path. Non-fatal: failure here logs a warning
  // but doesn't flip previewOk.
  if (state.useDrapeCloud) {
    try {
      ctx.writeSseEvent('status', {
        type: 'status',
        message: 'Controllo che tutte le tabelle siano collegate...',
        phase: 'verify',
      });
      const gate = await enforceSdkUsageGate(ctx.projectId, state.resolvedTechnology);
      if (gate.unwiredTables.length > 0) {
        log.warn(
          `[Pipeline/full_verify] SDK gate rewired ${gate.scaffolded.length} page(s) for unwired tables: ${gate.unwiredTables.join(', ')}`,
        );
      }
    } catch (err: any) {
      log.warn(`[Pipeline/full_verify] SDK gate threw: ${err.message}`);
    }
  }

  return {
    ...state,
    fullVerifyDone: true,
    previewOk: passed,
    phase: 'finalize',
  };
}
