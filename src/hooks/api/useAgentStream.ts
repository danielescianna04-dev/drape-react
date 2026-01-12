/**
 * useAgentStream Hook
 * Connects to Agent SSE endpoints for streaming tool execution
 * Handles: /agent/run/fast, /agent/run/plan, /agent/run/execute
 * React Native compatible using react-native-sse library
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import EventSource from 'react-native-sse';
import { config } from '../../config/config';
import { useAgentStore } from '../../core/agent/agentStore';

// SSE Event Types
export type AgentEventType =
  | 'tool_start'
  | 'tool_input'
  | 'tool_complete'
  | 'tool_error'
  | 'iteration_start'
  | 'thinking'
  | 'message'
  | 'plan_ready'
  | 'complete'
  | 'error'
  | 'fatal_error'
  | 'done';

// Tool Event Interface
export interface AgentToolEvent {
  id: string;
  type: AgentEventType;
  timestamp: Date;
  tool?: string;
  input?: any;
  output?: any;
  error?: string;
  message?: string;
  iteration?: number;
  filesCreated?: string[];
  filesModified?: string[];
}

// AgentPlan Interface
export interface AgentPlan {
  id: string;
  steps: AgentAgentPlanStep[];
  estimatedDuration?: number;
  createdAt: Date;
}

export interface AgentAgentPlanStep {
  id: string;
  description: string;
  tool?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  order: number;
}

// Hook Options
interface UseAgentStreamOptions {
  enabled?: boolean;
  onEvent?: (event: AgentToolEvent) => void;
  onComplete?: (summary: string) => void;
  onError?: (error: string) => void;
}

// Hook Return Type
interface UseAgentStreamReturn {
  events: AgentToolEvent[];
  isRunning: boolean;
  currentTool: string | null;
  error: string | null;
  plan: AgentPlan | null;
  summary: string | null;
  start: (prompt: string, projectId: string, model?: string, conversationHistory?: any[]) => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Connect to Agent SSE endpoint and stream tool execution events
 *
 * @param mode - Agent mode: 'fast' (direct execution), 'planning' (plan first), 'executing' (execute existing plan)
 * @param options - Hook configuration options
 */
export function useAgentStream(
  mode: 'fast' | 'planning' | 'executing',
  options: UseAgentStreamOptions = {}
): UseAgentStreamReturn {
  const { enabled = true, onEvent, onComplete, onError } = options;

  // Local state
  const [events, setEvents] = useState<AgentToolEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setAgentPlan] = useState<AgentPlan | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  // Refs for connection management
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // Zustand store actions - get them OUTSIDE of hook to prevent re-renders
  // Using getState() directly avoids subscribing to store changes
  const getAgentStore = useCallback(() => useAgentStore.getState(), []);

  /**
   * Parse SSE event data
   */
  const parseEvent = useCallback((eventType: AgentEventType, data: string): AgentToolEvent | null => {
    try {
      const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
      return {
        id: `${eventType}-${Date.now()}`,
        type: eventType,
        timestamp: new Date(),
        ...parsedData,
      };
    } catch (e) {
      console.error(`[AgentStream] Failed to parse ${eventType} event:`, e);
      return null;
    }
  }, []);

  /**
   * Handle incoming SSE events
   */
  const handleEvent = useCallback((eventType: AgentEventType, data: any) => {
    const event = parseEvent(eventType, data);
    if (!event) return;

    // Update local state
    setEvents((prev) => {
      // If tool_input, try to merge with last tool_start of same tool
      if (eventType === 'tool_input' && event.tool) {
        const lastIndex = [...prev].reverse().findIndex(e => e.type === 'tool_start' && e.tool === event.tool);
        if (lastIndex !== -1) {
          const realIndex = prev.length - 1 - lastIndex;
          const newEvents = [...prev];
          newEvents[realIndex] = {
            ...newEvents[realIndex],
            input: event.input
          };
          return newEvents;
        }
      }
      return [...prev, event];
    });

    // Update current tool
    if (event.type === 'tool_start' && event.tool) {
      setCurrentTool(event.tool);
      getAgentStore().setCurrentTool(event.tool);
    } else if (event.type === 'tool_complete' || event.type === 'tool_error') {
      setCurrentTool(null);
      getAgentStore().setCurrentTool(null);
    }

    // Handle iteration updates
    if (event.type === 'iteration_start' && event.iteration !== undefined) {
      getAgentStore().setIteration(event.iteration);
    }

    // Handle plan ready
    if (event.type === 'plan_ready' && event.output) {
      const newAgentPlan: AgentPlan = {
        id: `plan-${Date.now()}`,
        steps: event.output.steps || [],
        estimatedDuration: event.output.estimatedDuration,
        createdAt: new Date(),
      };
      setAgentPlan(newAgentPlan);
      getAgentStore().setAgentPlan(newAgentPlan);
    }

    // Handle file changes
    if (event.filesCreated) {
      getAgentStore().addFilesCreated(event.filesCreated);
    }
    if (event.filesModified) {
      getAgentStore().addFilesModified(event.filesModified);
    }

    // Handle completion
    if (event.type === 'complete') {
      const completeSummary = event.message || event.output?.summary || 'Task completed';
      setSummary(completeSummary);
      getAgentStore().setSummary(completeSummary);
      setIsRunning(false);
      getAgentStore().stopAgent();
      onComplete?.(completeSummary);
    }

    // Handle errors
    if (event.type === 'error' || event.type === 'fatal_error') {
      const errorMessage = event.error || event.message || 'Unknown error occurred';
      setError(errorMessage);
      getAgentStore().setError(errorMessage);
      setIsRunning(false);
      getAgentStore().stopAgent();
      onError?.(errorMessage);
    }

    // Handle done (stream end)
    if (event.type === 'done') {
      setIsRunning(false);
      getAgentStore().stopAgent();
    }

    // Add to store
    getAgentStore().addEvent(event);

    // Callback
    onEvent?.(event);
  }, [parseEvent, onEvent, onComplete, onError, getAgentStore]);

  /**
   * Connect to SSE endpoint using POST fetch - sends full conversation history
   * Implements Claude Code style unlimited context via POST body
   */
  const connect = useCallback(async (prompt: string, projectId: string, model?: string, conversationHistory?: any[]) => {
    if (!enabled) return;

    // Prevent multiple simultaneous connections
    if (isRunning && eventSourceRef.current) {
      console.log('[AgentStream] Already running, ignoring new connection request');
      return;
    }

    // Close existing connection before creating new one
    if (eventSourceRef.current) {
      console.log('[AgentStream] Closing existing connection before reconnecting');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    try {
      // Determine endpoint based on mode
      const endpointMap = {
        fast: '/agent/run/fast',
        planning: '/agent/run/plan',
        executing: '/agent/run/execute',
      };

      const endpoint = endpointMap[mode];
      const url = `${config.apiUrl}${endpoint}`;

      console.log(`[AgentStream] Connecting to ${mode} mode with POST`);
      console.log(`[AgentStream] Conversation history: ${conversationHistory?.length || 0} messages`);

      // Use POST with body to send full conversation history
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          prompt,
          projectId,
          model,
          conversationHistory: conversationHistory || [], // Send ALL history, no limits
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Store a fake EventSource for compatibility with disconnect()
      eventSourceRef.current = { close: () => { /* will be handled by reader cancel */ } } as any;
      setIsRunning(true);
      getAgentStore().startAgent();
      reconnectAttemptsRef.current = 0;

      // Read SSE stream manually
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processLine = (line: string) => {
        if (line.startsWith('event: ')) {
          const eventType = line.substring(7).trim() as AgentEventType;
          return { type: 'event', value: eventType };
        } else if (line.startsWith('data: ')) {
          const data = line.substring(6);
          return { type: 'data', value: data };
        }
        return null;
      };

      let currentEvent: AgentEventType | null = null;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('[AgentStream] Stream ended');
          break;
        }

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmedLine = line.trim();

          if (trimmedLine === '') {
            // Empty line = end of event, dispatch it
            if (currentEvent) {
              // Event already handled by processLine
              currentEvent = null;
            }
            continue;
          }

          const parsed = processLine(trimmedLine);
          if (!parsed) continue;

          if (parsed.type === 'event') {
            currentEvent = parsed.value;
          } else if (parsed.type === 'data' && currentEvent) {
            const data = parsed.value;

            // Skip keep-alive comments
            if (data.startsWith(':')) continue;

            handleEvent(currentEvent, data);

            // Handle stream end
            if (currentEvent === 'done' || currentEvent === 'complete') {
              reader.cancel();
              setIsRunning(false);
              getAgentStore().stopAgent();
              return;
            }
          }
        }
      }

      setIsRunning(false);
      getAgentStore().stopAgent();

    } catch (e: any) {
      const errorMsg = `Failed to connect to agent: ${e instanceof Error ? e.message : String(e)}`;
      console.error('[AgentStream]', errorMsg);
      setError(errorMsg);
      getAgentStore().setError(errorMsg);
      setIsRunning(false);
      getAgentStore().stopAgent();
      onError?.(errorMsg);

      // Attempt reconnection for network errors
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        console.log(`[AgentStream] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connect(prompt, projectId, model, conversationHistory);
        }, delay);
      }
    }
  }, [enabled, mode, handleEvent, onError, getAgentStore, isRunning]);

  /**
   * Disconnect from SSE endpoint
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsRunning(false);
    setCurrentTool(null);
    getAgentStore().stopAgent();
    reconnectAttemptsRef.current = 0;
  }, [getAgentStore]);

  /**
   * Start agent execution
   */
  const start = useCallback((prompt: string, projectId: string, model?: string, conversationHistory?: any[]) => {
    // Reset state
    setEvents([]);
    setError(null);
    setSummary(null);
    setAgentPlan(null);
    setCurrentTool(null);
    getAgentStore().reset();
    getAgentStore().setMode(mode);

    // Connect with selected model and conversation history
    connect(prompt, projectId, model, conversationHistory);
  }, [mode, connect, getAgentStore]);

  /**
   * Stop agent execution
   */
  const stop = useCallback(() => {
    disconnect();
  }, [disconnect]);

  /**
   * Reset agent state
   */
  const reset = useCallback(() => {
    setEvents([]);
    setIsRunning(false);
    setCurrentTool(null);
    setError(null);
    setAgentPlan(null);
    setSummary(null);
    getAgentStore().reset();
  }, [getAgentStore]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    events,
    isRunning,
    currentTool,
    error,
    plan,
    summary,
    start,
    stop,
    reset,
  };
}
