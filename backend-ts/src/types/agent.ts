import type { ChatMessage } from '../services/ai-provider.service';

// Re-export from ai-provider to avoid duplication
export type { ChatMessage, ContentBlock } from '../services/ai-provider.service';

export type AgentMode = 'fast' | 'plan' | 'execute';

export interface AgentOptions {
  projectId: string;
  mode?: AgentMode;
  model?: string;
  prompt?: string;
  userId?: string;
  userPlan?: string;
  conversationHistory?: ChatMessage[];
  images?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  content?: string;
  error?: string;
  [key: string]: unknown;
}

export type AgentEventType =
  | 'start'
  | 'iteration_start'
  | 'thinking'
  | 'text_delta'
  | 'message'
  | 'tool_start'
  | 'tool_input'
  | 'tool_complete'
  | 'tool_error'
  | 'todo_update'
  | 'ask_user_question'
  | 'plan_ready'
  | 'complete'
  | 'budget_exceeded'
  | 'error'
  | 'fatal_error';

export interface AgentEvent {
  type: AgentEventType;
  [key: string]: unknown;
}

export type AgentEventCallback = (event: AgentEvent) => void;
