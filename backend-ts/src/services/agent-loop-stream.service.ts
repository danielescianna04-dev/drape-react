import { log } from '../utils/logger';

// ── Agent Loop Stream Event Types ────────────────────────────

export interface AgentLoopTextDeltaEvent {
  type: 'text_delta';
  text: string;
}

export interface AgentLoopToolStartEvent {
  type: 'tool_start';
  tool: string;
  id: string;
}

export interface AgentLoopToolInputEvent {
  type: 'tool_input';
  tool: string;
  id: string;
  input: unknown;
}

export interface AgentLoopToolCompleteEvent {
  type: 'tool_complete';
  tool: string;
  id: string;
  result: unknown;
}

export interface AgentLoopToolErrorEvent {
  type: 'tool_error';
  tool: string;
  id: string;
  error: string;
}

export interface AgentLoopUsageEvent {
  type: 'usage';
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costEur?: number;
}

export interface AgentLoopCompleteEvent {
  type: 'complete';
  summary?: string;
  totalIterations?: number;
  result?: unknown;
}

export interface AgentLoopErrorEvent {
  type: 'error';
  error?: string;
  message?: string;
}

export interface AgentLoopIterationStartEvent {
  type: 'iteration_start';
  iteration: number;
}

export interface AgentLoopThinkingEvent {
  type: 'thinking';
  text?: string;
}

export type AgentLoopStreamEvent =
  | AgentLoopTextDeltaEvent
  | AgentLoopToolStartEvent
  | AgentLoopToolInputEvent
  | AgentLoopToolCompleteEvent
  | AgentLoopToolErrorEvent
  | AgentLoopUsageEvent
  | AgentLoopCompleteEvent
  | AgentLoopErrorEvent
  | AgentLoopIterationStartEvent
  | AgentLoopThinkingEvent;

/**
 * Generic stream event — the agent loop yields events with a `type` discriminant
 * and varying payloads. The typed events above represent the ones we handle;
 * unrecognized types are silently skipped.
 */
export type AgentLoopGenericEvent = { type: string; [key: string]: unknown };

// ── Params ──────────────────────────────────────────────────

interface StreamAgentLoopToSseParams {
  stream: AsyncIterable<AgentLoopGenericEvent>;
  isClientConnected: () => boolean;
  writeSseEvent: (eventType: string, payload: { type: string; [key: string]: unknown }) => void;
  onUsage?: (event: AgentLoopUsageEvent) => void;
  onToolStart?: (event: AgentLoopToolStartEvent) => void;
  onComplete?: (event: AgentLoopCompleteEvent) => void;
  onIterationStart?: (event: AgentLoopIterationStartEvent) => void;
  onError?: (event: AgentLoopErrorEvent) => void;
}

export const streamAgentLoopToSse = async ({
  stream,
  isClientConnected,
  writeSseEvent,
  onUsage,
  onToolStart,
  onComplete,
  onIterationStart,
  onError,
}: StreamAgentLoopToSseParams) => {
  for await (const event of stream) {
    if (!isClientConnected()) break;

    switch (event.type) {
      case 'text_delta':
        writeSseEvent('message', { type: 'text', text: event.text });
        break;
      case 'tool_start':
        onToolStart?.(event as unknown as AgentLoopToolStartEvent);
        writeSseEvent('tool_start', { type: 'tool_start', tool: event.tool, id: event.id });
        break;
      case 'tool_input':
        writeSseEvent('tool_input', { type: 'tool_input', tool: event.tool, id: event.id, input: event.input });
        break;
      case 'tool_complete':
        writeSseEvent('tool_complete', { type: 'tool_complete', tool: event.tool, id: event.id, result: event.result });
        break;
      case 'tool_error':
        writeSseEvent('tool_error', { type: 'tool_error', tool: event.tool, id: event.id, error: event.error });
        break;
      case 'usage':
        onUsage?.(event as AgentLoopUsageEvent);
        break;
      case 'complete':
        onComplete?.(event as AgentLoopCompleteEvent);
        break;
      case 'error':
        onError?.(event as AgentLoopErrorEvent);
        writeSseEvent('error', { type: 'error', error: event.error || event.message });
        break;
      case 'iteration_start':
        onIterationStart?.(event as unknown as AgentLoopIterationStartEvent);
        break;
      case 'thinking':
        if (event.text) {
          writeSseEvent('thinking', { type: 'thinking', text: event.text });
        }
        break;
      default:
        log.debug?.(`[AgentLoopStream] Ignored event type: ${event?.type}`);
        break;
    }
  }
};
