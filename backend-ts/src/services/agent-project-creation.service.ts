import { log } from '../utils/logger';
import { AgentLoop } from './agent-loop.service';
import { streamAgentLoopToSse } from './agent-loop-stream.service';
import { metricsService } from './metrics.service';
import { finalizeProjectVerificationReport } from './agent-project-report.service';
import { verifyGeneratedProject } from './agent-project-verification.service';

interface RunAgentProjectCreationParams {
  projectId: string;
  userId: string;
  userPlan: string;
  prompt: string;
  sessionProjectType?: string;
  isClientConnected: () => boolean;
  writeSseEvent: (eventType: string, payload: { type: string; [key: string]: unknown }) => void;
}

export async function runAgentProjectCreation({
  projectId,
  userId,
  userPlan,
  prompt,
  sessionProjectType,
  isClientConnected,
  writeSseEvent,
}: RunAgentProjectCreationParams) {
  log.info(`[Agent] Using AgentLoop (direct API) for project creation: ${projectId}`);

  const agentLoop = new AgentLoop({
    projectId,
    mode: 'fast',
    model: 'gemini-3-flash',
    userId,
    userPlan: userPlan || 'free',
    conversationHistory: [],
    thinkingLevel: 'low',
  });

  agentLoop.maxIterations = 80;

  let filesCreated = 0;

  try {
    await streamAgentLoopToSse({
      stream: agentLoop.run(prompt),
      isClientConnected,
      writeSseEvent,
      onToolStart: (event) => {
        if (event.tool === 'write_file') filesCreated++;
      },
      onUsage: (event) => {
        const ev = event as any;
        metricsService.trackAIUsage({
          userId,
          model: 'gemini-3-flash',
          inputTokens: ev.totalInputTokens || 0,
          outputTokens: ev.totalOutputTokens || 0,
          costEur: ev.totalCostEur || 0,
        });
        writeSseEvent('usage', {
          type: 'usage',
          costEur: ev.totalCostEur,
          tokensUsed: { input: ev.totalInputTokens, output: ev.totalOutputTokens },
        });
      },
      onComplete: (event) => {
        log.info(`[Agent] AgentLoop completed for ${projectId}: ${event.result || 'done'}`);
      },
      onIterationStart: (event) => {
        log.info(`[Agent] AgentLoop iteration ${event.iteration} for ${projectId}`);
      },
    });
  } catch (loopErr: any) {
    log.error(`[Agent] AgentLoop error for ${projectId}: ${loopErr.message}`);
    log.error(`[Agent] AgentLoop stack: ${loopErr.stack}`);
  }

  log.info(`[Agent] AgentLoop finished for ${projectId}, files created: ${filesCreated}`);

  const previewOk = await verifyGeneratedProject({
    projectId,
    userId,
    userPlan: userPlan || 'free',
    sessionProjectType,
    isClientConnected,
    writeSseEvent,
  });

  await finalizeProjectVerificationReport({
    projectId,
    filesCreated,
    previewOk,
  });

  log.info(`[Agent] Creation complete for ${projectId}, files: ${filesCreated}, preview: ${previewOk ? 'OK' : 'EMPTY'}`);

  if (isClientConnected()) {
    writeSseEvent('complete', { type: 'complete', message: 'Project created and verified' });
    writeSseEvent('done', { type: 'done' });
  }
}
