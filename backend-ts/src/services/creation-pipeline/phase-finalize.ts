/**
 * Finalize phase: write the verification + build reports to disk and emit
 * the terminal SSE events. This is the only exit path to 'done' — so the
 * report is always persisted, including when the client disconnects or
 * generation never produced files.
 */

import { log } from '../../utils/logger';
import { finalizeProjectVerificationReport } from '../agent-project-report.service';
import type { PipelineContext, PipelineState } from './types';

export async function runFinalize(state: PipelineState, ctx: PipelineContext): Promise<PipelineState> {
  const generatedFileList = Array.from(state.generatedFiles);

  await finalizeProjectVerificationReport({
    projectId: ctx.projectId,
    filesCreated: state.filesCreated,
    generatedFiles: generatedFileList,
    previewOk: state.previewOk,
  });

  log.info(
    `[Pipeline/finalize] ${ctx.projectId}: files=${state.filesCreated}, previewOk=${state.previewOk}, ` +
    `error=${state.generationError ? 'yes' : 'no'}`,
  );

  if (ctx.isClientConnected()) {
    if (state.generationError && generatedFileList.length === 0) {
      // Generation failed outright — error already emitted from generation phase
      // so here we only emit the terminating 'done'.
      ctx.writeSseEvent('done', { type: 'done' });
    } else {
      ctx.writeSseEvent('complete', {
        type: 'complete',
        message: state.previewOk ? 'Project created and verified' : 'Project created, but verification found issues',
        result: {
          success: state.previewOk,
          projectId: ctx.projectId,
          filesCreated: state.filesCreated,
          verificationFailed: !state.previewOk,
        },
      });
      ctx.writeSseEvent('done', { type: 'done' });
    }
  }

  return { ...state, phase: 'done' };
}
