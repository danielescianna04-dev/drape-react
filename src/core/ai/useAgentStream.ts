/**
 * useAgentStream Hook
 * Manages streaming agent responses for project creation
 * Uses react-native-sse for React Native SSE compatibility
 */

import { useState, useCallback, useRef } from 'react';
import EventSource from 'react-native-sse';
import { config } from '../../config/config';
import { getAuthToken } from '../api/getAuthToken';
import { jobsApi } from '../api/jobsApi';
import { pendingJobs } from './pendingJobsStore';

export type AgentMode = 'fast' | 'planning';

export interface ToolEvent {
  type:
    | 'tool_input'
    | 'tool_start'
    | 'tool_complete'
    | 'tool_error'
    | 'status'
    | 'complete'
    | 'message'
    | 'thinking'
    | 'iteration_start'
    | 'text_delta'
    | 'start'
    | 'done'
    | 'plan_ready'
    | 'fatal_error'
    | 'processing'
    | 'heartbeat'
    | 'error'
    | 'thinking_start'
    | 'thinking_end'
    | 'usage'
    | 'budget_exceeded'
    | 'budget_warning'
    | 'sub_agent_start'
    | 'sub_agent_complete';
  tool?: string;
  input?: any;
  success?: boolean;
  error?: string;
  message?: string;
  content?: string;
  timestamp?: number;
  iteration?: number;
  result?: any;
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
  const esRef = useRef<EventSource | null>(null);
  const currentJobIdRef = useRef<string | null>(null);
  const currentProjectIdRef = useRef<string | null>(null);
  const completionHandledRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attachToJobRef = useRef<((projectId: string, jobId: string) => void) | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const startStream = useCallback(
    async (
      projectId: string,
      mode: AgentMode,
      prompt: string,
      streamOptions?: {
        model?: string;
        thinkingLevel?: string;
        projectName?: string;
        bodyExtras?: Record<string, unknown>;
      },
    ) => {
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
      completionHandledRef.current = false;
      currentJobIdRef.current = null;
      currentProjectIdRef.current = projectId;
      reconnectAttemptsRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      try {
        const token = await getAuthToken();
        const apiUrl = config.apiUrl;

        const es = new EventSource(`${apiUrl}/agent/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            projectId,
            mode,
            prompt,
            model: streamOptions?.model,
            thinkingLevel: streamOptions?.thinkingLevel ?? null,
            projectName: streamOptions?.projectName,
            ...(streamOptions?.bodyExtras || {}),
          }),
          pollingInterval: 0,
        });

        esRef.current = es;

        // Handle all SSE event types
        const eventTypes = [
          'tool_start', 'tool_input', 'tool_complete', 'tool_error',
          'message', 'text_delta', 'thinking', 'thinking_start', 'thinking_end',
          'iteration_start', 'status', 'complete', 'error', 'done',
          'processing', 'heartbeat', 'plan_ready', 'usage',
          'budget_exceeded', 'budget_warning', 'sub_agent_start', 'sub_agent_complete',
          'job_created',
        ];

        // Capture the durable jobId the backend assigns so we can re-attach
        // after a disconnect / app restart.
        es.addEventListener('job_created' as any, (e: any) => {
          try {
            const { jobId } = JSON.parse(e.data);
            if (jobId) {
              currentJobIdRef.current = jobId;
              pendingJobs.set(projectId, jobId).catch(() => {});
            }
          } catch {}
        });

        for (const eventType of eventTypes) {
          es.addEventListener(eventType as any, (e: any) => {
            if (!e.data) return;

            try {
              const eventData = JSON.parse(e.data);
              const event: ToolEvent = {
                ...eventData,
                type: eventType as ToolEvent['type'],
                timestamp: Date.now(),
              };

              if (eventType === 'tool_start') {
                setCurrentTool(event.tool || null);
              } else if (eventType === 'tool_complete' || eventType === 'tool_error') {
                setCurrentTool(null);
              } else if (eventType === 'complete') {
                setStatus('complete');
                setCurrentTool(null);
                setIsStreaming(false);
                if (currentProjectIdRef.current) {
                  pendingJobs.clear(currentProjectIdRef.current).catch(() => {});
                }

                if (!completionHandledRef.current && (eventData.result || eventData.message)) {
                  completionHandledRef.current = true;
                  const resultData = eventData.result || eventData;
                  setResult(resultData);
                  optionsRef.current.onComplete?.(resultData);
                } else if (!completionHandledRef.current) {
                  completionHandledRef.current = true;
                  optionsRef.current.onComplete?.({ success: true });
                }

                es.close();
                esRef.current = null;
                return;
              } else if (eventType === 'done') {
                setStatus((prev) => (prev === 'error' ? prev : 'complete'));
                setCurrentTool(null);
                setIsStreaming(false);
                if (currentProjectIdRef.current) {
                  pendingJobs.clear(currentProjectIdRef.current).catch(() => {});
                }
                es.close();
                esRef.current = null;
                return;
              } else if (eventType === 'error') {
                setStatus('error');
                setIsStreaming(false);
                if (currentProjectIdRef.current) {
                  pendingJobs.clear(currentProjectIdRef.current).catch(() => {});
                }
                optionsRef.current.onError?.(eventData.error || eventData.message || 'Agent error');
                es.close();
                esRef.current = null;
                return;
              } else if (eventType === 'fatal_error' || eventType === 'budget_exceeded') {
                setStatus('error');
                setIsStreaming(false);
                setCurrentTool(null);
                optionsRef.current.onError?.(eventData.error || eventData.message || 'Agent error');
                es.close();
                esRef.current = null;
                return;
              }

              // Skip heartbeats and processing from the events list
              if (eventType !== 'heartbeat' && eventType !== 'processing') {
                setEvents((prev) => [...prev, event]);
              }
            } catch (parseErr) {
              console.warn('[useAgentStream] Failed to parse event:', eventType, parseErr);
            }
          });
        }

        // Handle generic message event (unnamed SSE events sent as "data: {...}")
        es.addEventListener('message', (e: any) => {
          if (!e.data) return;
          try {
            const eventData = JSON.parse(e.data);
            if (eventData.type) {
              const event: ToolEvent = { ...eventData, timestamp: Date.now() };
              setEvents((prev) => [...prev, event]);
            }
          } catch (_) {}
        });

        // Handle connection errors — try to auto-resume via attachToJob if we
        // have a durable jobId (mobile networks drop SSE frequently).
        es.addEventListener('error', (e: any) => {
          console.error('[useAgentStream] SSE error:', e);
          if (completionHandledRef.current) return;
          es.close();
          esRef.current = null;
          const jobId = currentJobIdRef.current;
          const projectId = currentProjectIdRef.current;
          if (jobId && projectId && reconnectAttemptsRef.current < 5) {
            const attempt = ++reconnectAttemptsRef.current;
            const delay = Math.min(1000 * attempt, 5000);
            console.warn(`[useAgentStream] SSE dropped, reattaching to job ${jobId} in ${delay}ms (attempt ${attempt}/5)`);
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(() => {
              attachToJobRef.current?.(projectId, jobId);
            }, delay);
            return;
          }
          setStatus('error');
          setIsStreaming(false);
          optionsRef.current.onError?.(e?.message || 'Connection error');
        });

      } catch (error: any) {
        console.error('[useAgentStream] Stream setup error:', error);
        setStatus('error');
        setIsStreaming(false);
        optionsRef.current.onError?.(error.message || 'Failed to start stream');
      }
    },
    [isStreaming, status]
  );

  const cancel = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    completionHandledRef.current = false;
    setIsStreaming(false);
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    completionHandledRef.current = false;
    setIsStreaming(false);
    setEvents([]);
    setCurrentTool(null);
    setStatus('idle');
    setResult(null);
  }, []);

  /**
   * Re-attach to an existing job started in a previous app session.
   * Fetches a snapshot first; if the job already finished, fires onComplete
   * (or onError) and clears the pending entry. Otherwise opens an SSE stream
   * that replays past events and tails new ones to keep the UI in sync.
   */
  const attachToJob = useCallback(async (projectId: string, jobId: string) => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    setIsStreaming(true);
    // Keep already-accumulated events when reattaching after a drop — the
    // snapshot replay will fill in any gaps.
    setCurrentTool(null);
    setStatus('running');
    completionHandledRef.current = false;
    currentJobIdRef.current = jobId;
    currentProjectIdRef.current = projectId;

    try {
      const snap = await jobsApi.get(jobId);
      if (!snap) {
        // Job not found server-side (e.g. expired) — clear local state.
        await pendingJobs.clear(projectId);
        setIsStreaming(false);
        setStatus('idle');
        return;
      }
      if (snap.status === 'completed') {
        await pendingJobs.clear(projectId);
        setStatus('complete');
        setIsStreaming(false);
        setResult(snap.result);
        optionsRef.current.onComplete?.(snap.result || { success: true });
        return;
      }
      if (snap.status === 'failed' || snap.status === 'cancelled') {
        await pendingJobs.clear(projectId);
        setStatus('error');
        setIsStreaming(false);
        optionsRef.current.onError?.(snap.error || `Job ${snap.status}`);
        return;
      }

      // Still running — open the SSE replay+tail stream.
      const es = await jobsApi.attachStream(jobId);
      esRef.current = es;

      // Reset reconnect counter once we have a fresh stream open.
      es.addEventListener('open', () => {
        reconnectAttemptsRef.current = 0;
      });

      const eventTypes = [
        'job_snapshot', 'job_end', 'phase', 'phase_start', 'phase_complete',
        'tool_start', 'tool_input', 'tool_complete', 'tool_error',
        'message', 'text_delta', 'iteration_start', 'status', 'plan',
        'file', 'file_batch', 'error', 'done',
      ];
      for (const t of eventTypes) {
        es.addEventListener(t as any, (e: any) => {
          if (!e.data) return;
          try {
            const eventData = JSON.parse(e.data);
            const event: ToolEvent = { ...eventData, type: t as any, timestamp: Date.now() };
            if (t === 'job_end') {
              const finalStatus = eventData.status as string;
              if (finalStatus === 'completed') {
                setStatus('complete');
                setResult(eventData.result);
                optionsRef.current.onComplete?.(eventData.result || { success: true });
              } else {
                setStatus('error');
                optionsRef.current.onError?.(eventData.error || `Job ${finalStatus}`);
              }
              setIsStreaming(false);
              if (currentProjectIdRef.current) {
                pendingJobs.clear(currentProjectIdRef.current).catch(() => {});
              }
              es.close();
              esRef.current = null;
              return;
            }
            if (t !== 'heartbeat' && t !== 'processing') {
              setEvents((prev) => [...prev, event]);
            }
          } catch {}
        });
      }

      es.addEventListener('error', (e: any) => {
        // Don't clear pendingJobs here — the job may still be running, the
        // network just dropped. Auto-reattach with backoff.
        if (esRef.current) {
          esRef.current.close();
          esRef.current = null;
        }
        if (completionHandledRef.current) {
          setIsStreaming(false);
          return;
        }
        if (reconnectAttemptsRef.current < 5) {
          const attempt = ++reconnectAttemptsRef.current;
          const delay = Math.min(1000 * attempt, 5000);
          console.warn(`[useAgentStream] attach SSE dropped, retrying in ${delay}ms (attempt ${attempt}/5)`);
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            attachToJobRef.current?.(projectId, jobId);
          }, delay);
          return;
        }
        setIsStreaming(false);
        setStatus('error');
        optionsRef.current.onError?.(e?.message || 'Connection lost');
      });
    } catch (err: any) {
      setStatus('error');
      setIsStreaming(false);
      optionsRef.current.onError?.(err?.message || 'Failed to attach to job');
    }
  }, []);

  // Expose attachToJob via a ref so SSE error handlers (declared before
  // attachToJob) can invoke it for auto-reconnect without a circular dep.
  attachToJobRef.current = attachToJob;

  return {
    startStream,
    cancel,
    reset,
    attachToJob,
    isStreaming,
    events,
    currentTool,
    status,
    result,
  };
};
