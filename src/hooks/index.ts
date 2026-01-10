/**
 * Central export point for all custom hooks
 * Organized by category for better discoverability
 */

// UI Hooks - Handle user interface concerns
export { useContentOffset } from './ui/useContentOffset';

// Business Hooks - Handle business logic and state
export { useChatState } from './business/useChatState';
export { useEnvVariables } from './business/useEnvVariables';
export type { EnvVariable } from './business/useEnvVariables';

// API Hooks - Handle API and data fetching concerns
export { useAgentStream } from './api/useAgentStream';
export type {
  ToolEvent,
  Plan,
  PlanStep,
  AgentEventType,
} from './api/useAgentStream';
