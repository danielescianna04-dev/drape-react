/**
 * useAgentStream Hook
 * Handles SSE streaming for agent execution (fast and planning modes)
 */

import { useState, useCallback, useRef } from 'react';
import { config } from '../config/config';

export interface AgentEvent {
  type: 'start' | 'iteration_start' | 'thinking' | 'tool_start' | 'tool_complete' |
        'tool_error' | 'message' | 'complete' | 'plan_ready' | 'error' | 'fatal_error' | 'done';
  mode?: string;
  projectId?: string;
  hasContext?: boolean;
  iteration?: number;
  maxIterations?: number;
  tool?: string;
  input?: any;
  success?: boolean;
  result?: any;
  error?: string;
  content?: string;
  summary?: string;
  filesCreated?: string[];
  filesModified?: string[];
  plan?: any;
  planContent?: string;
  timestamp?: string;
}

export interface AgentStreamState {
  status: 'idle' | 'running' | 'complete' | 'error';
  events: AgentEvent[];
  currentTool: string | null;
  error: string | null;
  plan: any | null;
}

export const useAgentStream = () => {
  const [state, setState] = useState<AgentStreamState>({
    status: 'idle',
    events: [],
    currentTool: null,
    error: null,
    plan: null,
  });

  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const runFast = useCallback(async (prompt: string, projectId: string) => {
    // Reset state
    setState({
      status: 'running',
      events: [],
      currentTool: null,
      error: null,
      plan: null,
    });

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      xhr.open('POST', `${config.apiUrl}/agent/run/fast`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.timeout = 300000; // 5 minutes

      let buffer = '';

      xhr.onprogress = () => {
        const newData = xhr.responseText.substring(buffer.length);
        buffer = xhr.responseText;

        const lines = newData.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6).trim();
            if (data === '[DONE]') continue;

            try {
              const event: AgentEvent = JSON.parse(data);

              setState((prev) => {
                const newEvents = [...prev.events, event];
                let newStatus = prev.status;
                let newCurrentTool = prev.currentTool;
                let newError = prev.error;

                // Update current tool
                if (event.type === 'tool_start') {
                  newCurrentTool = event.tool || null;
                } else if (event.type === 'tool_complete' || event.type === 'tool_error') {
                  newCurrentTool = null;
                }

                // Update status
                if (event.type === 'complete') {
                  newStatus = 'complete';
                } else if (event.type === 'error' || event.type === 'fatal_error') {
                  newStatus = 'error';
                  newError = event.error || 'Unknown error';
                }

                return {
                  ...prev,
                  events: newEvents,
                  currentTool: newCurrentTool,
                  status: newStatus,
                  error: newError,
                };
              });
            } catch (e) {
              // Skip invalid JSON
              console.warn('Failed to parse agent event:', e);
            }
          }
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          resolve();
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => {
        setState((prev) => ({ ...prev, status: 'error', error: 'Network error' }));
        reject(new Error('Network error'));
      };

      xhr.ontimeout = () => {
        setState((prev) => ({ ...prev, status: 'error', error: 'Request timeout' }));
        reject(new Error('Request timeout'));
      };

      xhr.send(JSON.stringify({ prompt, projectId }));
    });
  }, []);

  const runPlan = useCallback(async (prompt: string, projectId: string) => {
    // Reset state
    setState({
      status: 'running',
      events: [],
      currentTool: null,
      error: null,
      plan: null,
    });

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      xhr.open('POST', `${config.apiUrl}/agent/run/plan`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.timeout = 300000;

      let buffer = '';

      xhr.onprogress = () => {
        const newData = xhr.responseText.substring(buffer.length);
        buffer = xhr.responseText;

        const lines = newData.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6).trim();
            if (data === '[DONE]') continue;

            try {
              const event: AgentEvent = JSON.parse(data);

              setState((prev) => {
                const newEvents = [...prev.events, event];
                let newStatus = prev.status;
                let newPlan = prev.plan;
                let newError = prev.error;

                // Capture plan when ready
                if (event.type === 'plan_ready' && event.plan) {
                  newPlan = event.plan;
                  newStatus = 'complete';
                }

                // Update status
                if (event.type === 'error' || event.type === 'fatal_error') {
                  newStatus = 'error';
                  newError = event.error || 'Unknown error';
                }

                return {
                  ...prev,
                  events: newEvents,
                  status: newStatus,
                  plan: newPlan,
                  error: newError,
                };
              });
            } catch (e) {
              console.warn('Failed to parse agent event:', e);
            }
          }
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          resolve();
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => {
        setState((prev) => ({ ...prev, status: 'error', error: 'Network error' }));
        reject(new Error('Network error'));
      };

      xhr.ontimeout = () => {
        setState((prev) => ({ ...prev, status: 'error', error: 'Request timeout' }));
        reject(new Error('Request timeout'));
      };

      xhr.send(JSON.stringify({ prompt, projectId }));
    });
  }, []);

  const executePlan = useCallback(async (projectId: string) => {
    // Reset events but keep plan
    setState((prev) => ({
      ...prev,
      status: 'running',
      events: [],
      currentTool: null,
      error: null,
    }));

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      xhr.open('POST', `${config.apiUrl}/agent/run/execute`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.timeout = 300000;

      let buffer = '';

      xhr.onprogress = () => {
        const newData = xhr.responseText.substring(buffer.length);
        buffer = xhr.responseText;

        const lines = newData.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6).trim();
            if (data === '[DONE]') continue;

            try {
              const event: AgentEvent = JSON.parse(data);

              setState((prev) => {
                const newEvents = [...prev.events, event];
                let newStatus = prev.status;
                let newCurrentTool = prev.currentTool;
                let newError = prev.error;

                // Update current tool
                if (event.type === 'tool_start') {
                  newCurrentTool = event.tool || null;
                } else if (event.type === 'tool_complete' || event.type === 'tool_error') {
                  newCurrentTool = null;
                }

                // Update status
                if (event.type === 'complete') {
                  newStatus = 'complete';
                } else if (event.type === 'error' || event.type === 'fatal_error') {
                  newStatus = 'error';
                  newError = event.error || 'Unknown error';
                }

                return {
                  ...prev,
                  events: newEvents,
                  currentTool: newCurrentTool,
                  status: newStatus,
                  error: newError,
                };
              });
            } catch (e) {
              console.warn('Failed to parse agent event:', e);
            }
          }
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          resolve();
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => {
        setState((prev) => ({ ...prev, status: 'error', error: 'Network error' }));
        reject(new Error('Network error'));
      };

      xhr.ontimeout = () => {
        setState((prev) => ({ ...prev, status: 'error', error: 'Request timeout' }));
        reject(new Error('Request timeout'));
      };

      xhr.send(JSON.stringify({ projectId }));
    });
  }, []);

  const cancel = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      setState((prev) => ({
        ...prev,
        status: 'idle',
        error: 'Cancelled by user',
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      events: [],
      currentTool: null,
      error: null,
      plan: null,
    });
  }, []);

  return {
    state,
    runFast,
    runPlan,
    executePlan,
    cancel,
    reset,
  };
};
