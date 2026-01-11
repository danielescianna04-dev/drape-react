// Message types for Claude Code UI components

export interface ChatMessage {
  type: 'chat';
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ToolMessage {
  type: 'tool';
  content: string;
  timestamp: number;
}

export interface ToolResultMessage {
  type: 'tool_result';
  toolName: string;
  content: string;
  summary: string;
  timestamp: number;
  toolUseResult?: {
    structuredPatch?: unknown;
    stdout?: string;
    stderr?: string;
    [key: string]: unknown;
  };
}

export interface PlanMessage {
  type: 'plan';
  plan: string;
  toolUseId: string;
  timestamp: number;
}

export interface ThinkingMessage {
  type: 'thinking';
  content: string;
  timestamp: number;
}

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

export interface TodoMessage {
  type: 'todo';
  todos: TodoItem[];
  timestamp: number;
}

export interface SystemMessage {
  type: 'system';
  subtype?: 'init' | 'result' | 'error';
  content?: string;
  timestamp: number;
  [key: string]: unknown;
}

export type AllMessage =
  | ChatMessage
  | ToolMessage
  | ToolResultMessage
  | PlanMessage
  | ThinkingMessage
  | TodoMessage
  | SystemMessage;

// Type guards
export function isChatMessage(msg: AllMessage): msg is ChatMessage {
  return msg.type === 'chat';
}

export function isToolMessage(msg: AllMessage): msg is ToolMessage {
  return msg.type === 'tool';
}

export function isToolResultMessage(msg: AllMessage): msg is ToolResultMessage {
  return msg.type === 'tool_result';
}

export function isPlanMessage(msg: AllMessage): msg is PlanMessage {
  return msg.type === 'plan';
}

export function isThinkingMessage(msg: AllMessage): msg is ThinkingMessage {
  return msg.type === 'thinking';
}

export function isTodoMessage(msg: AllMessage): msg is TodoMessage {
  return msg.type === 'todo';
}

export function isSystemMessage(msg: AllMessage): msg is SystemMessage {
  return msg.type === 'system';
}
