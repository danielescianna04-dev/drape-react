/**
 * useAgentStream Hook
 * Manages streaming agent responses for project creation
 */

import { useState, useCallback, useRef } from 'react';
import { config } from '../../config/config';

export type AgentMode = 'fast' | 'planning';

export interface ToolEvent {
  type: 'tool_start' | 'tool_complete' | 'tool_error' | 'status' | 'complete';
  tool?: string;
  input?: any;
  success?: boolean;
  error?: string;
  message?: string;
  timestamp?: number;
}

export interface UseAgentStreamOptions {
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

export const useAgentStream = (options: UseAgentStreamOptions = {}) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [events, setEvents] = useState<ToolEvent[]>([]);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [result, setResult] = useState<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startStream = useCallback(
    async (projectId: string, mode: AgentMode, prompt: string) => {
      if (isStreaming) {
        console.warn('[useAgentStream] Already streaming');
        return;
      }

      // Reset state
      setIsStreaming(true);
      setEvents([]);
      setCurrentTool(null);
      setStatus('running');
      setResult(null);

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      const apiUrl = config.apiUrl;

      try {
        console.log(`[useAgentStream] Starting stream for project: ${projectId}, mode: ${mode}`);

        const response = await fetch(`${apiUrl}/agent/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId,
            mode,
            prompt,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log('[useAgentStream] Stream complete');
            break;
          }

          // Decode chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) continue;

            // SSE format: "data: {...}"
            if (line.startsWith('data: ')) {
              try {
                const eventData = JSON.parse(line.substring(6));
                const event: ToolEvent = {
                  ...eventData,
                  timestamp: Date.now(),
                };

                console.log('[useAgentStream] Event:', event.type, event.tool || event.message);

                // Update state based on event type
                if (event.type === 'tool_start') {
                  setCurrentTool(event.tool || null);
                } else if (event.type === 'tool_complete' || event.type === 'tool_error') {
                  setCurrentTool(null);
                } else if (event.type === 'complete') {
                  setStatus('complete');
                  setCurrentTool(null);
                  if (event.message) {
                    try {
                      const resultData = JSON.parse(event.message);
                      setResult(resultData);
                      options.onComplete?.(resultData);
                    } catch {
                      setResult({ message: event.message });
                      options.onComplete?.({ message: event.message });
                    }
                  }
                }

                // Add event to list
                setEvents((prev) => [...prev, event]);
              } catch (error) {
                console.error('[useAgentStream] Failed to parse event:', error);
              }
            }
          }
        }

        if (status !== 'complete') {
          setStatus('complete');
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('[useAgentStream] Stream aborted by user');
          setStatus('idle');
        } else {
          console.error('[useAgentStream] Stream error:', error);
          setStatus('error');
          setEvents((prev) => [
            ...prev,
            {
              type: 'tool_error',
              error: error.message || 'Unknown error',
              timestamp: Date.now(),
            },
          ]);
          options.onError?.(error.message || 'Unknown error');
        }
      } finally {
        setIsStreaming(false);
        setCurrentTool(null);
        abortControllerRef.current = null;
      }
    },
    [isStreaming, status, options]
  );

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      console.log('[useAgentStream] Cancelling stream');
      abortControllerRef.current.abort();
    }
  }, []);

  const reset = useCallback(() => {
    setIsStreaming(false);
    setEvents([]);
    setCurrentTool(null);
    setStatus('idle');
    setResult(null);
    abortControllerRef.current = null;
  }, []);

  return {
    startStream,
    cancel,
    reset,
    isStreaming,
    events,
    currentTool,
    status,
    result,
  };
};
