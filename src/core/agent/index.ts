/**
 * Agent Module - Central Export Point
 *
 * Provides complete Agent SSE infrastructure for streaming execution
 */

// Store
export { useAgentStore, agentSelectors } from './agentStore';
export type { AgentState, AgentMode } from './agentStore';

// Hook (re-export from hooks/api for convenience)
export { useAgentStream } from '../../hooks/api/useAgentStream';
export type {
  ToolEvent,
  Plan,
  PlanStep,
  AgentEventType,
} from '../../hooks/api/useAgentStream';
