import { getAgentModeFromPath, type AgentMode } from './agentSse';

type AgentStreamIntent = 'chat' | 'project_creation';

interface ResolveAgentStreamRoutingParams {
  path: string;
  body?: {
    mode?: string | null;
    projectCreation?: boolean | null;
    [key: string]: unknown;
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
  return {
    mode: getAgentModeFromPath(path),
    intent: body?.projectCreation === true ? 'project_creation' : 'chat',
  };
};
