/**
 * Thin adapter between the /stream HTTP route and the creation pipeline.
 *
 * All orchestration lives in creation-pipeline/runner.ts — this file just
 * normalizes inputs and hands them off. Kept as a named service for
 * route-level discoverability (agent.routes.ts imports from here).
 */

import { runCreationPipeline } from './creation-pipeline/runner';

interface RunAgentProjectCreationParams {
  projectId: string;
  userId: string;
  userPlan: string;
  prompt: string;
  projectName?: string;
  sessionProjectType?: string;
  isClientConnected: () => boolean;
  writeSseEvent: (eventType: string, payload: { type: string; [key: string]: unknown }) => void;
}

export async function runAgentProjectCreation(params: RunAgentProjectCreationParams): Promise<void> {
  await runCreationPipeline({
    projectId: params.projectId,
    userId: params.userId,
    userPlan: params.userPlan,
    prompt: params.prompt,
    projectName: params.projectName,
    sessionProjectType: params.sessionProjectType,
    isClientConnected: params.isClientConnected,
    writeSseEvent: params.writeSseEvent,
  });
}
