/**
 * useAgentStream Hook
 * Connects to Agent SSE endpoints for streaming tool execution
 * Handles: /agent/run/fast, /agent/run/plan, /agent/run/execute
 * React Native compatible using react-native-sse library
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import EventSource from 'react-native-sse';
import NetInfo from '@react-native-community/netinfo';
import { config } from '../../config/config';
import { useAgentStore } from '../../core/agent/agentStore';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { useAuthStore } from '../../core/auth/authStore';
import { getAuthToken } from '../../core/api/getAuthToken';

// SSE Event Types
export type AgentEventType =
  | 'processing'
  | 'heartbeat'
  | 'tool_start'
  | 'tool_input'
  | 'tool_complete'
  | 'tool_error'
  | 'iteration_start'
  | 'budget_exceeded'
  | 'budget_warning'
  | 'todo_update'
  | 'thinking_start'
  | 'thinking'
  | 'thinking_end'
  | 'status'
  | 'message'
  | 'text_delta'
  | 'plan_ready'
  | 'ask_user_question'
  | 'usage'
  | 'context_compacting'
  | 'context_compacted'
  | 'complete'
  | 'error'
  | 'fatal_error'
  | 'done'
  | 'sub_agent_start'
  | 'sub_agent_complete';

// Tool Event Interface
export interface AgentToolEvent {
  id: string;
  type: AgentEventType;
  timestamp: Date;
  tool?: string;
  input?: any;
  output?: any;
  result?: any;
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
  title?: string;
  description: string;
  tool?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  order: number;
}

export type ToolEvent = AgentToolEvent;
export type Plan = AgentPlan;
export type PlanStep = AgentAgentPlanStep;

// Hook Options
interface UseAgentStreamOptions {
  enabled?: boolean;
  onEvent?: (event: AgentToolEvent) => void;
  onComplete?: (summary: string) => void;
  onError?: (error: string) => void;
}

export interface AgentStartOptions {
  endpointPath?: string;
  bodyExtras?: Record<string, unknown>;
}

// Hook Return Type
interface UseAgentStreamReturn {
  events: AgentToolEvent[];
  eventsVersion: number;
  isRunning: boolean;
  currentTool: string | null;
  error: string | null;
  plan: AgentPlan | null;
  summary: string | null;
  currentPrompt: string | null;
  currentProjectId: string | null;
  currentModel: string | null;
  start: (
    prompt: string,
    projectId: string,
    model?: string,
    conversationHistory?: any[],
    images?: any[],
    thinkingLevel?: string,
    previewContext?: any,
    startOptions?: AgentStartOptions,
  ) => void;
  startExecuting: () => void;
  stop: () => void;
  reset: () => void;
}

interface StreamConnectOptions {
  authRetryCount?: number;
  forceRefreshToken?: boolean;
  startOptions?: AgentStartOptions;
}

const isLikelyNetworkError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  const type = String(error?.type || '').toLowerCase();
  const combined = `${type} ${message}`;
  return (
    combined.includes('network') ||
    combined.includes('timeout') ||
    combined.includes('timed out') ||
    combined.includes('socket') ||
    combined.includes('closed') ||
    combined.includes('econn') ||
    combined.includes('failed to fetch') ||
    combined.includes('connection')
  );
};

const isLikelyAuthError = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.xhrStatus === 401 ||
    message.includes('401') ||
    message.includes('invalid or expired token') ||
    message.includes('unauthorized') ||
    message.includes('authorization')
  );
};

const extractStreamErrorMessage = (error: any): string => {
  const rawMessage = typeof error?.message === 'string' ? error.message : '';

  if (rawMessage) {
    try {
      const parsed = JSON.parse(rawMessage);
      if (typeof parsed?.error === 'string' && parsed.error.trim()) {
        return parsed.error;
      }
      if (typeof parsed?.message === 'string' && parsed.message.trim()) {
        return parsed.message;
      }
    } catch {
      // Keep the original message when it isn't JSON.
    }
  }

  if (typeof error?.response === 'string' && error.response.trim()) {
    return error.response;
  }

  return rawMessage || 'Stream error';
};

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

  // Events stored in ref to avoid O(n) array copies on every SSE event.
  // A lightweight counter triggers useChatEngine re-processing.
  const eventsRef = useRef<AgentToolEvent[]>([]);
  const [eventsVersion, setEventsVersion] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setAgentPlan] = useState<AgentPlan | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  // Store prompt/project/model/history for execute mode
  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [currentConversationHistory, setCurrentConversationHistory] = useState<any[]>([]);
  const [currentThinkingLevel, setCurrentThinkingLevel] = useState<string | null>(null);
  const [currentPreviewContext, setCurrentPreviewContext] = useState<any>(null);
  const [currentStartOptions, setCurrentStartOptions] = useState<AgentStartOptions | null>(null);

  // Refs for connection management
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isRunningRef = useRef(false);
  const isConnectingRef = useRef(false);
  const shouldResumeOnReconnectRef = useRef(false);
  const lastConnectPayloadRef = useRef<{
    prompt: string;
    projectId: string;
    model?: string;
    conversationHistory?: any[];
    images?: any[];
    thinkingLevel?: string;
    previewContext?: any;
    startOptions?: AgentStartOptions;
  } | null>(null);
  const maxReconnectAttempts = 5;

  const setRunningState = useCallback((running: boolean) => {
    isRunningRef.current = running;
    setIsRunning(running);
  }, []);

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

    // Append to ref (O(1) push, no array copy) and bump version counter
    // to trigger useChatEngine re-processing
    eventsRef.current.push(event);
    setEventsVersion(v => v + 1);

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

    // Handle plan ready - backend sends 'plan', not 'output'
    if (event.type === 'plan_ready') {
      const planData = (event as any).plan || (event as any).output;
      if (planData) {
        const newAgentPlan: AgentPlan = {
          id: planData.id || `plan-${Date.now()}`,
          steps: (planData.steps || []).map((step: any, idx: number) => ({
            id: step.id || `step-${idx + 1}`,
            description: step.description || step,
            tool: step.tool,
            status: step.status || 'pending',
            order: idx,
          })),
          estimatedDuration: planData.estimatedDuration,
          createdAt: new Date(),
        };
        setAgentPlan(newAgentPlan);
        getAgentStore().setAgentPlan(newAgentPlan);
      }
    }

    // Handle file changes
    if (event.filesCreated) {
      getAgentStore().addFilesCreated(event.filesCreated);
    }
    if (event.filesModified) {
      getAgentStore().addFilesModified(event.filesModified);
    }

    // Chat agent emits per-tool events without aggregated file lists.
    // Extract file paths from write/edit tool completions so the reload
    // banner knows the agent actually touched files.
    if (event.type === 'tool_complete' && (event as any).success !== false) {
      const toolName = (event as any).tool as string | undefined;
      const input = (event as any).input as any;
      const filePath = input?.file_path || input?.path;
      if (toolName && filePath && typeof filePath === 'string') {
        if (toolName === 'write_file') {
          getAgentStore().addFilesCreated([filePath]);
        } else if (toolName === 'edit_file' || toolName === 'multi_edit_file' || toolName === 'patch_file' || toolName === 'str_replace') {
          getAgentStore().addFilesModified([filePath]);
        }
      }
    }

    // Handle completion
    if (event.type === 'complete') {
      const completeSummary = event.message || event.output?.summary || 'Task completed';
      setSummary(completeSummary);
      getAgentStore().setSummary(completeSummary);
      setRunningState(false);
      getAgentStore().stopAgent();
      onComplete?.(completeSummary);
    }

    if (event.type === 'budget_exceeded') {
      setCurrentTool(null);
      setRunningState(false);
      getAgentStore().setCurrentTool(null);
      getAgentStore().stopAgent();
    }

    // Handle errors
    if (event.type === 'error' || event.type === 'fatal_error') {
      const errorMessage = event.error || event.message || 'Unknown error occurred';
      setError(errorMessage);
      getAgentStore().setError(errorMessage);
      setRunningState(false);
      getAgentStore().stopAgent();
      onError?.(errorMessage);
    }

    // Handle done (stream end)
    if (event.type === 'done') {
      setRunningState(false);
      getAgentStore().stopAgent();
    }

    // Callback
    onEvent?.(event);
  }, [parseEvent, onEvent, onComplete, onError, getAgentStore, setRunningState]);

  /**
   * Connect to SSE endpoint using EventSource POST - sends full conversation history
   * Implements Claude Code style unlimited context via POST body
   */
  const connect = useCallback(async (
    prompt: string,
    projectId: string,
    model?: string,
    conversationHistory?: any[],
    images?: any[],
    thinkingLevel?: string,
    previewContext?: any,
    connectionOptions: StreamConnectOptions = {},
  ) => {
    if (!enabled) return;
    if (isConnectingRef.current) return;

    const { authRetryCount = 0, forceRefreshToken = false, startOptions } = connectionOptions;

    // Prevent multiple simultaneous connections
    if (isRunningRef.current && eventSourceRef.current) {
      return;
    }

    isConnectingRef.current = true;
    lastConnectPayloadRef.current = {
      prompt,
      projectId,
      model,
      conversationHistory: conversationHistory || [],
      images: images || [],
      thinkingLevel,
      previewContext: previewContext || undefined,
      startOptions: startOptions || undefined,
    };
    shouldResumeOnReconnectRef.current = false;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close existing connection before creating new one
    if (eventSourceRef.current) {
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

      const endpoint = startOptions?.endpointPath || endpointMap[mode];
      const url = `${config.apiUrl}${endpoint}`;

      // Streams are long-lived, so we prefer a fresh token on open/re-open.
      const authToken = await getAuthToken(forceRefreshToken || reconnectAttemptsRef.current > 0);

      // Use EventSource with POST method and body (react-native-sse supports this)
      const es = new EventSource(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          prompt,
          projectId,
          model,
          conversationHistory: conversationHistory || [], // Send ALL history, no limits
          images: images || [], // Send images for multimodal support
          thinkingLevel: thinkingLevel || null, // Gemini 3 thinking level
          previewContext: previewContext || undefined,
          userId: useAuthStore.getState().user?.uid || useTerminalStore.getState().userId || null,
          userPlan: useAuthStore.getState().user?.plan || 'free',
          ...(startOptions?.bodyExtras || {}),
        }),
      });

      eventSourceRef.current = es;
      setRunningState(true);
      getAgentStore().startAgent();

      // Handle all event types
      const eventTypes: AgentEventType[] = [
        'processing',
        'heartbeat',
        'tool_start',
        'tool_input',
        'tool_complete',
        'tool_error',
        'iteration_start',
        'todo_update',
        'thinking_start',
        'thinking',
        'thinking_end',
        'status',
        'message',
        'text_delta',
        'plan_ready',
        'ask_user_question',
        'usage',
        'context_compacting',
        'context_compacted',
        'budget_exceeded',
        'budget_warning',
        'complete',
        'error',
        'fatal_error',
        'done',
        'sub_agent_start',
        'sub_agent_complete',
      ];

      eventTypes.forEach((eventType) => {
        es.addEventListener(eventType as any, (event: any) => {
          if (event.data && event.data !== '[DONE]') {
            handleEvent(eventType, event.data);
          }

          // Handle stream end
          if (eventType === 'done' || eventType === 'complete' || eventType === 'budget_exceeded') {
            es.close();
          }
        });
      });

      // Handle connection open
      es.addEventListener('open', () => {
        reconnectAttemptsRef.current = 0;
        shouldResumeOnReconnectRef.current = false;
        setError(null);
      });

      // Handle errors
      es.addEventListener('error', async (error: any) => {
        // If we're not running anymore (already got a 'done' or 'complete' event),
        // just ignore any trailing socket errors
        if (!isRunningRef.current) {
          es.close();
          return;
        }

        console.error('[AgentStream] EventSource error:', error);

        // Close the connection
        es.close();
        eventSourceRef.current = null;

        if (isLikelyAuthError(error)) {
          if (authRetryCount < 2) {
            const retryMsg = authRetryCount === 0
              ? 'Sessione scaduta, aggiorno il token...'
              : 'Secondo tentativo di autenticazione...';
            setError(retryMsg);
            getAgentStore().setError(retryMsg);
            reconnectAttemptsRef.current = 0;
            shouldResumeOnReconnectRef.current = false;
            isConnectingRef.current = false;
            // Small delay before retry to let Firebase SDK refresh properly
            setTimeout(() => {
              void connect(
                prompt,
                projectId,
                model,
                conversationHistory,
                images,
                thinkingLevel,
                previewContext,
                {
                  authRetryCount: authRetryCount + 1,
                  forceRefreshToken: true,
                  startOptions,
                },
              );
            }, authRetryCount === 0 ? 500 : 1500);
            return;
          }

          // Auth retry exhausted — force re-login
          console.warn('[AgentStream] Auth retry exhausted, forcing re-login');
          const errorMsg = 'Sessione scaduta. Effettua nuovamente il login.';
          setError(errorMsg);
          getAgentStore().setError(errorMsg);
          setRunningState(false);
          getAgentStore().stopAgent();
          onError?.(errorMsg);

          // Force sign-out so the user gets redirected to login
          import('../../lib/supabase/client')
            .then(({ supabase }) => supabase.auth.signOut().catch(() => {}))
            .catch(() => {});
          return;
        }

        const recoverable = isLikelyNetworkError(error);
        if (recoverable) {
          shouldResumeOnReconnectRef.current = true;
          const net = await NetInfo.fetch().catch(() => null);
          const isOnline = !!net?.isConnected && net?.isInternetReachable !== false;
          const reconnectMsg = isOnline
            ? 'Connessione instabile, riconnessione in corso...'
            : 'Connessione persa. Riprendo appena torna online...';

          setError(reconnectMsg);
          getAgentStore().setError(reconnectMsg);

          if (isOnline && reconnectAttemptsRef.current < maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
            }
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptsRef.current++;
              connect(prompt, projectId, model, conversationHistory, images, thinkingLevel, previewContext, {
                forceRefreshToken: true,
                startOptions,
              });
            }, delay);
          }
          return;
        }

        const errorMsg = `Stream error: ${extractStreamErrorMessage(error)}`;
        setError(errorMsg);
        getAgentStore().setError(errorMsg);
        setRunningState(false);
        getAgentStore().stopAgent();
        onError?.(errorMsg);
      });

    } catch (e: any) {
      if (isRunningRef.current && isLikelyNetworkError(e)) {
        shouldResumeOnReconnectRef.current = true;
        const reconnectMsg = 'Connessione persa. Riprendo appena torna online...';
        setError(reconnectMsg);
        getAgentStore().setError(reconnectMsg);
        return;
      }
      const errorMsg = `Failed to connect to agent: ${e instanceof Error ? e.message : String(e)}`;
      console.error('[AgentStream]', errorMsg);
      setError(errorMsg);
      getAgentStore().setError(errorMsg);
      setRunningState(false);
      getAgentStore().stopAgent();
      onError?.(errorMsg);
    } finally {
      isConnectingRef.current = false;
    }
  }, [enabled, mode, handleEvent, onError, getAgentStore, setRunningState]);

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

    setRunningState(false);
    setCurrentTool(null);
    getAgentStore().stopAgent();
    reconnectAttemptsRef.current = 0;
    shouldResumeOnReconnectRef.current = false;
    isConnectingRef.current = false;
  }, [getAgentStore, setRunningState]);

  /**
   * Start agent execution
   */
  const start = useCallback((
    prompt: string,
    projectId: string,
    model?: string,
    conversationHistory?: any[],
    images?: any[],
    thinkingLevel?: string,
    previewContext?: any,
    startOptions?: AgentStartOptions,
  ) => {
    // Reset state
    eventsRef.current = [];
    setEventsVersion(0);
    setError(null);
    setSummary(null);
    setAgentPlan(null);
    setCurrentTool(null);
    getAgentStore().reset();
    getAgentStore().setMode(mode);

    // Save prompt/project/model/history for potential execute mode later
    setCurrentPrompt(prompt);
    setCurrentProjectId(projectId);
    setCurrentModel(model || null);
    setCurrentConversationHistory(conversationHistory || []);
    setCurrentThinkingLevel(thinkingLevel || null);
    setCurrentPreviewContext(previewContext || null);
    setCurrentStartOptions(startOptions || null);
    shouldResumeOnReconnectRef.current = false;

    // Connect with selected model, conversation history, images, and thinking level
    connect(prompt, projectId, model, conversationHistory, images, thinkingLevel, previewContext, {
      startOptions,
    });
  }, [mode, connect, getAgentStore]);

  /**
   * Start executing a previously created plan
   * Uses the stored prompt/project/model to call /agent/run/execute directly
   */
  const startExecuting = useCallback(async () => {
    if (!currentPrompt || !currentProjectId) {
      console.error('[AgentStream] Cannot execute: no prompt or projectId stored');
      setError('Cannot execute plan: missing prompt or project');
      return;
    }

    // Reset state but keep the plan
    eventsRef.current = [];
    setEventsVersion(0);
    setError(null);
    setSummary(null);
    setCurrentTool(null);
    getAgentStore().reset();
    getAgentStore().setMode('executing');

    // Connect directly to execute endpoint
    const executeEndpoint = '/agent/run/execute';
    const url = `${config.apiUrl}${executeEndpoint}`;
    shouldResumeOnReconnectRef.current = false;
    lastConnectPayloadRef.current = {
      prompt: currentPrompt,
      projectId: currentProjectId,
      model: currentModel || undefined,
      conversationHistory: currentConversationHistory,
      images: [],
      thinkingLevel: currentThinkingLevel || undefined,
      previewContext: currentPreviewContext || undefined,
    };

    const authToken = await getAuthToken(true);

    const es = new EventSource(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({
        prompt: currentPrompt,
        projectId: currentProjectId,
        model: currentModel,
        plan: plan, // Send the plan for context
        conversationHistory: currentConversationHistory,
        images: [],
        thinkingLevel: currentThinkingLevel,
        previewContext: currentPreviewContext || undefined,
        userId: useAuthStore.getState().user?.uid || useTerminalStore.getState().userId || null,
        userPlan: useAuthStore.getState().user?.plan || 'free',
      }),
    });

    eventSourceRef.current = es;
    setRunningState(true);
    getAgentStore().startAgent();

    // Handle all event types (same as connect function)
    const eventTypes: AgentEventType[] = [
      'processing',
      'heartbeat',
      'tool_start',
      'tool_input',
      'tool_complete',
      'tool_error',
      'iteration_start',
      'todo_update',
      'thinking_start',
      'thinking',
      'thinking_end',
      'status',
      'message',
      'text_delta',
      'plan_ready',
      'ask_user_question',
      'usage',
      'context_compacting',
      'context_compacted',
      'budget_exceeded',
      'complete',
      'error',
      'fatal_error',
      'done',
      'sub_agent_start',
      'sub_agent_complete',
    ];

    eventTypes.forEach((eventType) => {
      es.addEventListener(eventType as any, (event: any) => {
        if (event.data && event.data !== '[DONE]') {
          handleEvent(eventType, event.data);
        }
        if (eventType === 'done' || eventType === 'complete' || eventType === 'budget_exceeded') {
          es.close();
        }
      });
    });

    es.addEventListener('open', () => {
      reconnectAttemptsRef.current = 0;
    });

    es.addEventListener('error', (error: any) => {
      console.error('[AgentStream] Execute error:', error);
      es.close();
      eventSourceRef.current = null;
      setRunningState(false);
      getAgentStore().stopAgent();
      const errorMsg = extractStreamErrorMessage(error) || 'Execution failed';
      setError(errorMsg);
      onError?.(errorMsg);
    });
  }, [currentPrompt, currentProjectId, currentModel, currentConversationHistory, currentThinkingLevel, currentPreviewContext, plan, handleEvent, getAgentStore, onError, setRunningState]);

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
    eventsRef.current = [];
    setEventsVersion(0);
    setRunningState(false);
    setCurrentTool(null);
    setError(null);
    setAgentPlan(null);
    setSummary(null);
    setCurrentPrompt(null);
    setCurrentProjectId(null);
    setCurrentModel(null);
    setCurrentConversationHistory([]);
    setCurrentThinkingLevel(null);
    setCurrentPreviewContext(null);
    setCurrentStartOptions(null);
    lastConnectPayloadRef.current = null;
    shouldResumeOnReconnectRef.current = false;
    isConnectingRef.current = false;
    getAgentStore().reset();
  }, [getAgentStore, setRunningState]);

  // Resume stream automatically after network reconnect
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected && state.isInternetReachable !== false;
      if (!isOnline) {
        if (isRunningRef.current) {
          shouldResumeOnReconnectRef.current = true;
        }
        return;
      }

      if (!isRunningRef.current) return;
      if (!shouldResumeOnReconnectRef.current) return;
      if (eventSourceRef.current || isConnectingRef.current) return;

      const payload = lastConnectPayloadRef.current;
      if (!payload) return;

      reconnectAttemptsRef.current = 0;
      connect(
        payload.prompt,
        payload.projectId,
        payload.model,
        payload.conversationHistory,
        payload.images,
        payload.thinkingLevel,
        payload.previewContext,
        { startOptions: payload.startOptions },
      );
    });

    return () => unsubscribe();
  }, [connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    events: eventsRef.current,
    eventsVersion,
    isRunning,
    currentTool,
    error,
    plan,
    summary,
    currentPrompt,
    currentProjectId,
    currentModel,
    start,
    startExecuting,
    stop,
    reset,
  };
}
