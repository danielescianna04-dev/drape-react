import { getAgentModeFromPath, type AgentMode } from './agentSse';

type AgentStreamIntent = 'chat' | 'project_creation';

interface ResolveAgentStreamRoutingParams {
  path: string;
  body?: {
    mode?: string | null;
    projectCreation?: boolean | null;
    prompt?: unknown;
  } | null;
}

export interface AgentStreamRoutingResult {
  mode: AgentMode;
  intent: AgentStreamIntent;
}

export const resolveAgentStreamRouting = ({
  path,
  body,
}: ResolveAgentStreamRoutingParams): AgentStreamRoutingResult => {
  const explicitProjectCreation = body?.projectCreation === true;
  const prompt = typeof body?.prompt === 'string' ? body.prompt : '';
  const legacyProjectCreationHeuristic = path === '/stream' && prompt.length > 2000;

  return {
    mode: getAgentModeFromPath(path),
    intent: explicitProjectCreation || legacyProjectCreationHeuristic ? 'project_creation' : 'chat',
  };
};
