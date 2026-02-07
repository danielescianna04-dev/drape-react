/**
 * useChatEngine — Shared event processing hook for agent SSE streams.
 *
 * Both ChatPage and PreviewAIChat consume this hook so that event handling,
 * thinking-indicator lifecycle, text-delta accumulation, and XML stripping
 * are implemented in a single place.
 *
 * The hook takes raw `AgentToolEvent[]` from useAgentStream and produces a
 * normalised `ChatEngineMessage[]` plus metadata (activeTools, isLoading, …).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { stripToolCallXml } from '../../shared/utils/stripToolCallXml';
import type { AgentToolEvent } from '../api/useAgentStream';

// ─── Public types ────────────────────────────────────────────────────────────

export interface ChatEngineMessage {
  id: string;
  type: 'thinking' | 'text' | 'tool_start' | 'tool_complete' | 'tool_error' | 'error' | 'budget_exceeded' | 'completion';
  content: string;

  // Thinking
  isThinking?: boolean;
  thinkingContent?: string;

  // Tool
  tool?: string;
  toolId?: string;
  toolInput?: any;
  toolResult?: any;
  toolSuccess?: boolean;
  isExecuting?: boolean;
  filePath?: string;
  pattern?: string;

  // Metadata
  timestamp: Date;
  isAgentMessage?: boolean;
}

export interface SessionCost {
  costEur: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UseChatEngineReturn {
  /** Normalised message list — append-only between resets. */
  messages: ChatEngineMessage[];
  /** Tools that have started but not yet completed. */
  activeTools: string[];
  /** True while the agent stream is active OR events are still being ingested. */
  isLoading: boolean;
  /** Latest todo list from todo_update events. */
  currentTodos: any[];
  /** Pending ask_user_question data (null when none). */
  pendingQuestion: any[] | null;
  /** Accumulated cost for the current session. */
  sessionCost: SessionCost;
  /** Add a user message to the message list (used by both consumers). */
  addUserMessage: (content: string, extra?: Record<string, any>) => string;
  /** Wipe all messages / state for a fresh session. */
  reset: () => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useChatEngine(
  agentEvents: AgentToolEvent[],
  agentStreaming: boolean,
): UseChatEngineReturn {
  const [messages, setMessages] = useState<ChatEngineMessage[]>([]);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTodos, setCurrentTodos] = useState<any[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<any[] | null>(null);

  // ─ Internal refs ──────────────────────────────────────────────────────────
  const lastProcessedIndexRef = useRef(-1);
  const streamingContentRef = useRef('');
  const thinkingContentRef = useRef('');
  const currentMessageIdRef = useRef<string | null>(null);
  const sessionCostRef = useRef<SessionCost>({ costEur: 0, inputTokens: 0, outputTokens: 0 });

  // ─ Helpers ────────────────────────────────────────────────────────────────

  /** Extract a meaningful file path from a tool input object. */
  const extractFilePath = (input: any): string => {
    if (!input) return '';
    return input.filePath || input.dirPath || input.path || input.file_path || '';
  };

  /** Extract a meaningful pattern / command / query from a tool input object. */
  const extractPattern = (input: any): string => {
    if (!input) return '';
    return input.pattern || input.command || input.query || '';
  };

  // ─ Public actions ─────────────────────────────────────────────────────────

  const addUserMessage = useCallback((content: string, extra: Record<string, any> = {}): string => {
    const id = `user-${Date.now()}`;
    const msg: ChatEngineMessage = {
      id,
      type: 'text',
      content,
      timestamp: new Date(),
      ...extra,
    };
    setMessages(prev => [...prev, msg]);
    return id;
  }, []);

  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setMessages([]);
    setActiveTools([]);
    setIsLoading(false);
    setCurrentTodos([]);
    setPendingQuestion(null);
    lastProcessedIndexRef.current = -1;
    streamingContentRef.current = '';
    thinkingContentRef.current = '';
    currentMessageIdRef.current = null;
    sessionCostRef.current = { costEur: 0, inputTokens: 0, outputTokens: 0 };
    if (gapTimerRef.current) { clearTimeout(gapTimerRef.current); gapTimerRef.current = null; }
  }, []);

  // ─ Event processing ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!agentEvents || agentEvents.length === 0) return;

    const startIndex = lastProcessedIndexRef.current + 1;
    if (startIndex >= agentEvents.length) return;

    for (let i = startIndex; i < agentEvents.length; i++) {
      const event = agentEvents[i];
      const toolId = (event as any).id || `tool-${Date.now()}-${i}`;

      // ── ITERATION_START ─────────────────────────────────────────────────
      if (event.type === 'iteration_start') {
        const iteration = (event as any).iteration || 1;

        if (iteration > 1) {
          // Remove empty thinking, close others
          setMessages(prev => prev
            .filter(m => !(m.isThinking && !m.content?.trim() && !m.thinkingContent?.trim()))
            .map(m => m.isThinking ? { ...m, isThinking: false } : m),
          );

          // Create new thinking placeholder for the new iteration
          const newId = `engine-thinking-${Date.now()}`;
          currentMessageIdRef.current = newId;
          thinkingContentRef.current = '';
          streamingContentRef.current = '';

          setMessages(prev => [...prev, {
            id: newId,
            type: 'thinking',
            content: '',
            isThinking: true,
            thinkingContent: '',
            timestamp: new Date(),
          }]);

          // Break to force a React render so the user sees "Thinking..."
          // before the next events (text_delta/tool_start) replace it.
          // Remaining events will be processed in the next useEffect cycle.
          lastProcessedIndexRef.current = i;
          break;
        }
        continue;
      }

      // ── THINKING_START ──────────────────────────────────────────────────
      if (event.type === 'thinking_start') {
        if (!currentMessageIdRef.current?.startsWith('engine-thinking-')) {
          const newId = `engine-thinking-${Date.now()}`;
          currentMessageIdRef.current = newId;
          thinkingContentRef.current = '';
          streamingContentRef.current = '';

          setMessages(prev => [...prev, {
            id: newId,
            type: 'thinking',
            content: '',
            isThinking: true,
            thinkingContent: '',
            timestamp: new Date(),
          }]);
        }
        continue;
      }

      // ── THINKING (content delta) ────────────────────────────────────────
      if (event.type === 'thinking') {
        const thinkingText = (event as any).text;
        if (!thinkingText) continue;

        if (!currentMessageIdRef.current?.startsWith('engine-thinking-')) {
          // No thinking item yet → create one
          const newId = `engine-thinking-${Date.now()}`;
          currentMessageIdRef.current = newId;
          thinkingContentRef.current = thinkingText;
          streamingContentRef.current = '';

          setMessages(prev => [...prev, {
            id: newId,
            type: 'thinking',
            content: '',
            isThinking: true,
            thinkingContent: thinkingText,
            timestamp: new Date(),
          }]);
        } else {
          // Accumulate thinking text
          thinkingContentRef.current += thinkingText;
          const thinkingId = currentMessageIdRef.current;
          setMessages(prev => prev.map(m =>
            m.id === thinkingId ? { ...m, thinkingContent: thinkingContentRef.current } : m,
          ));
        }
        continue;
      }

      // ── THINKING_END ────────────────────────────────────────────────────
      // No-op: keep isThinking=true until text_delta/message/complete arrives.
      // Setting isThinking=false here causes the item to be filtered out (empty content + !isThinking).
      if (event.type === 'thinking_end') {
        continue;
      }

      // ── TOOL_START ──────────────────────────────────────────────────────
      if (event.type === 'tool_start' && event.tool) {
        // Skip signal_completion from visible UI
        if (event.tool === 'signal_completion') continue;

        const input = event.input || {};
        setActiveTools(prev => [...prev, event.tool!]);

        // Close current text/thinking message so post-tool text creates a new message
        if (currentMessageIdRef.current) {
          currentMessageIdRef.current = null;
          streamingContentRef.current = '';
        }

        // Close and remove empty thinking messages (including gap-thinking placeholders)
        // and append the new tool_start in a single setMessages call
        setMessages(prev => {
          const closed = prev
            .filter(m => !(m.isThinking && !m.content?.trim() && !m.thinkingContent?.trim()))
            .map(m => m.isThinking ? { ...m, isThinking: false } : m);
          return [...closed, {
            id: `${toolId}-start`,
            type: 'tool_start' as const,
            content: event.tool!,
            tool: event.tool,
            toolId,
            toolInput: input,
            isExecuting: true,
            filePath: extractFilePath(input),
            pattern: extractPattern(input),
            timestamp: new Date(),
          }];
        });
        continue;
      }

      // ── TOOL_INPUT ──────────────────────────────────────────────────────
      if (event.type === 'tool_input' && event.tool) {
        const input = event.input || {};
        // Merge input into existing tool_start message
        setActiveTools(prev => prev.includes(event.tool!) ? prev : [...prev, event.tool!]);
        setMessages(prev => {
          const updated = [...prev];
          // Two-pass search: exact toolId first, then fallback by tool name
          let idx = -1;
          for (let j = updated.length - 1; j >= 0; j--) {
            if (updated[j].toolId === toolId) { idx = j; break; }
          }
          if (idx === -1) {
            for (let j = updated.length - 1; j >= 0; j--) {
              if (updated[j].type === 'tool_start' && updated[j].tool === event.tool && updated[j].isExecuting) { idx = j; break; }
            }
          }
          if (idx !== -1) {
            updated[idx] = {
              ...updated[idx],
              toolId,
              toolInput: input,
              filePath: extractFilePath(input) || updated[idx].filePath,
              pattern: extractPattern(input) || updated[idx].pattern,
            };
          }
          return updated;
        });
        continue;
      }

      // ── TOOL_COMPLETE ───────────────────────────────────────────────────
      if (event.type === 'tool_complete' && event.tool) {
        // Remove only ONE instance (parallel tools of same type add multiple)
        setActiveTools(prev => {
          const idx = prev.indexOf(event.tool!);
          return idx === -1 ? prev : [...prev.slice(0, idx), ...prev.slice(idx + 1)];
        });

        // signal_completion: extract result as a text message
        if (event.tool === 'signal_completion') {
          let completionMessage = '';
          try {
            const inp = typeof event.input === 'string' ? JSON.parse(event.input) : event.input;
            completionMessage = inp?.result || '';
          } catch { /* ignore */ }

          if (completionMessage) {
            setMessages(prev => [...prev, {
              id: `completion-${Date.now()}`,
              type: 'completion',
              content: completionMessage,
              isAgentMessage: true,
              timestamp: new Date(),
            }]);
          }
          continue;
        }

        // Mark the matching tool_start as complete
        const result = event.result ?? (event as any).output;
        const hasError = typeof result === 'object' && result?.success === false;
        setMessages(prev => {
          const updated = [...prev];
          // Two-pass search: exact toolId first, then fallback by tool name
          let idx = -1;
          for (let j = updated.length - 1; j >= 0; j--) {
            if (updated[j].toolId === toolId) { idx = j; break; }
          }
          if (idx === -1) {
            for (let j = updated.length - 1; j >= 0; j--) {
              if (updated[j].type === 'tool_start' && updated[j].tool === event.tool && updated[j].isExecuting) { idx = j; break; }
            }
          }
          if (idx !== -1) {
            // Fill toolInput from tool_complete event if missing (safety net)
            const eventInput = event.input;
            updated[idx] = {
              ...updated[idx],
              type: 'tool_complete',
              isExecuting: false,
              toolResult: result,
              toolSuccess: !hasError,
              ...(eventInput && !updated[idx].toolInput ? {
                toolInput: eventInput,
                filePath: extractFilePath(eventInput) || updated[idx].filePath,
                pattern: extractPattern(eventInput) || updated[idx].pattern,
              } : {}),
            };
          }
          return updated;
        });
        continue;
      }

      // ── TOOL_ERROR ──────────────────────────────────────────────────────
      if (event.type === 'tool_error' && event.tool) {
        // Remove only ONE instance (parallel tools of same type add multiple)
        setActiveTools(prev => {
          const idx = prev.indexOf(event.tool!);
          return idx === -1 ? prev : [...prev.slice(0, idx), ...prev.slice(idx + 1)];
        });
        setMessages(prev => {
          const updated = [...prev];
          // Two-pass search: exact toolId first, then fallback by tool name
          let idx = -1;
          for (let j = updated.length - 1; j >= 0; j--) {
            if (updated[j].toolId === toolId) { idx = j; break; }
          }
          if (idx === -1) {
            for (let j = updated.length - 1; j >= 0; j--) {
              if (updated[j].type === 'tool_start' && updated[j].tool === event.tool && updated[j].isExecuting) { idx = j; break; }
            }
          }
          if (idx !== -1) {
            updated[idx] = { ...updated[idx], type: 'tool_error', isExecuting: false, toolSuccess: false };
          }
          return updated;
        });
        continue;
      }

      // ── TEXT_DELTA ──────────────────────────────────────────────────────
      if (event.type === 'text_delta') {
        const delta = (event as any).delta || (event as any).text;
        if (!delta) continue;

        // First delta after thinking → convert thinking item to text in-place
        const isFirstDelta = currentMessageIdRef.current?.startsWith('engine-thinking-') && streamingContentRef.current === '';
        if (isFirstDelta) {
          streamingContentRef.current = delta;
          const thinkingId = currentMessageIdRef.current!;
          const cleanContent = stripToolCallXml(streamingContentRef.current);
          setMessages(prev => prev.map(m =>
            m.id === thinkingId ? { ...m, type: 'text', isThinking: false, content: cleanContent } : m,
          ));
          // Keep same ID for further deltas
        } else if (currentMessageIdRef.current) {
          // Accumulate into existing text message
          streamingContentRef.current += delta;
          const msgId = currentMessageIdRef.current;
          const cleanContent = stripToolCallXml(streamingContentRef.current);
          setMessages(prev => prev.map(m =>
            m.id === msgId ? { ...m, content: cleanContent } : m,
          ));
        } else {
          // No current message → create new text message
          streamingContentRef.current = delta;
          const newId = `engine-text-${Date.now()}`;
          currentMessageIdRef.current = newId;
          setMessages(prev => [...prev, {
            id: newId,
            type: 'text',
            content: stripToolCallXml(delta),
            timestamp: new Date(),
          }]);
        }
        continue;
      }

      // ── MESSAGE / RESPONSE ──────────────────────────────────────────────
      if (event.type === 'message' || (event as any).type === 'response') {
        const raw = (event as any).content || (event as any).message || (event as any).text || (event as any).output;
        let content = raw;
        if (typeof raw === 'object' && raw !== null) {
          content = raw.text || raw.content || raw.message || JSON.stringify(raw);
        }
        if (!content || !String(content).trim()) continue;
        content = String(content);

        // Convert thinking → text if first content
        if (currentMessageIdRef.current?.startsWith('engine-thinking-') && streamingContentRef.current === '') {
          streamingContentRef.current = content;
          const thinkingId = currentMessageIdRef.current;
          setMessages(prev => prev.map(m =>
            m.id === thinkingId ? { ...m, type: 'text', isThinking: false, content, isAgentMessage: true } : m,
          ));
        } else if (currentMessageIdRef.current) {
          // Append to existing
          streamingContentRef.current += content;
          const msgId = currentMessageIdRef.current;
          setMessages(prev => prev.map(m =>
            m.id === msgId ? { ...m, content: streamingContentRef.current } : m,
          ));
        } else {
          // Deduplicate: skip if last text message has same content
          const dedupe = (prev: ChatEngineMessage[]) => {
            const last = prev[prev.length - 1];
            if (last && last.type === 'text' && last.content === content) return prev;
            return [...prev, { id: `engine-text-${Date.now()}`, type: 'text' as const, content, timestamp: new Date() }];
          };
          setMessages(dedupe);
        }
        continue;
      }

      // ── BUDGET_EXCEEDED ─────────────────────────────────────────────────
      if (event.type === 'budget_exceeded') {
        setIsLoading(false);
        // Remove empty thinking, close others
        setMessages(prev => [
          ...prev
            .filter(m => !(m.isThinking && !m.content?.trim() && !m.thinkingContent?.trim()))
            .map(m => m.isThinking ? { ...m, isThinking: false } : m),
          { id: `budget-${Date.now()}`, type: 'budget_exceeded' as const, content: 'Budget AI esaurito', timestamp: new Date() },
        ]);
        currentMessageIdRef.current = null;
        continue;
      }

      // ── ERROR / FATAL_ERROR ─────────────────────────────────────────────
      if (event.type === 'error' || event.type === 'fatal_error') {
        setIsLoading(false);
        setActiveTools([]);
        const rawError = (event as any).error || (event as any).message || 'Errore sconosciuto';
        // Extract a human-readable string from the error (could be object, JSON string, or plain string)
        let errorMsg: string;
        if (typeof rawError === 'object') {
          errorMsg = rawError.message || rawError.error || JSON.stringify(rawError);
        } else {
          errorMsg = String(rawError);
        }
        // If the string looks like raw JSON, try to extract the message
        if (errorMsg.startsWith('{')) {
          try {
            const parsed = JSON.parse(errorMsg);
            errorMsg = parsed.message || parsed.error || parsed.detail || errorMsg;
            if (typeof errorMsg === 'object') errorMsg = JSON.stringify(errorMsg);
          } catch { /* keep as-is */ }
        }
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          type: 'error',
          content: errorMsg,
          timestamp: new Date(),
        }]);
        continue;
      }

      // ── USAGE ───────────────────────────────────────────────────────────
      if (event.type === 'usage') {
        sessionCostRef.current = {
          costEur: (event as any).totalCostEur || 0,
          inputTokens: (event as any).totalInputTokens || 0,
          outputTokens: (event as any).totalOutputTokens || 0,
        };
        continue;
      }

      // ── TODO_UPDATE ─────────────────────────────────────────────────────
      if ((event as any).type === 'todo_update') {
        setCurrentTodos((event as any).todos || []);
        continue;
      }

      // ── ASK_USER_QUESTION ───────────────────────────────────────────────
      if ((event as any).type === 'ask_user_question') {
        setPendingQuestion((event as any).questions || null);
        continue;
      }

      // ── COMPLETE / DONE ─────────────────────────────────────────────────
      if (event.type === 'complete' || event.type === 'done') {
        setIsLoading(false);
        setActiveTools([]);

        // Append completion text if no streaming message exists
        const completionResult = (event as any).result;
        // Check if we already have streamed content (thinking→text conversion keeps engine-thinking- ID)
        const hasStreaming = currentMessageIdRef.current != null && streamingContentRef.current !== '';
        if (completionResult && typeof completionResult === 'string' && completionResult.trim() && !hasStreaming) {
          setMessages(prev => [...prev, {
            id: `completion-${Date.now()}`,
            type: 'completion',
            content: completionResult,
            isAgentMessage: true,
            timestamp: new Date(),
          }]);
        }

        // Attach cost to the current streaming message
        if (currentMessageIdRef.current && sessionCostRef.current.costEur > 0) {
          const msgId = currentMessageIdRef.current;
          const cost = { ...sessionCostRef.current };
          setMessages(prev => prev.map(m =>
            m.id === msgId
              ? { ...m, costEur: cost.costEur, tokensUsed: { input: cost.inputTokens, output: cost.outputTokens } } as any
              : m,
          ));
        }

        // Safety: remove empty thinking items, close others
        setMessages(prev => prev
          .filter(m => !(m.isThinking && !m.content?.trim() && !m.thinkingContent?.trim()))
          .map(m => m.isThinking ? { ...m, isThinking: false } : m),
        );

        // NOTE: Don't clear currentTodos here — let them persist until engine.reset()
        // so the TODO card stays visible after agent completion.

        // Reset cost for next run
        sessionCostRef.current = { costEur: 0, inputTokens: 0, outputTokens: 0 };
        continue;
      }
    }

    lastProcessedIndexRef.current = agentEvents.length - 1;

    // After processing events, set a gap timer: if no new events arrive within 250ms
    // while streaming is active, show a thinking indicator (e.g. waiting for write_file generation)
    if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
    if (agentStreaming) {
      gapTimerRef.current = setTimeout(() => {
        setMessages(prev => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          // Only add if last message is idle (completed text or completed tool)
          if ((last.type === 'text' || last.type === 'tool_complete') && !last.isThinking && !last.isExecuting) {
            const newId = `engine-thinking-gap-${Date.now()}`;
            currentMessageIdRef.current = newId;
            thinkingContentRef.current = '';
            streamingContentRef.current = '';
            return [...prev, {
              id: newId,
              type: 'thinking' as const,
              content: '',
              isThinking: true,
              thinkingContent: '',
              timestamp: new Date(),
            }];
          }
          return prev;
        });
      }, 250);
    }
  }, [agentEvents, agentStreaming]);

  // Keep isLoading in sync with agentStreaming
  useEffect(() => {
    if (agentStreaming && !isLoading) {
      setIsLoading(true);
    }
    if (!agentStreaming && gapTimerRef.current) {
      clearTimeout(gapTimerRef.current);
      gapTimerRef.current = null;
    }
    // Don't set false here — that's handled by complete/done/error events
  }, [agentStreaming]);

  return {
    messages,
    activeTools,
    isLoading,
    currentTodos,
    pendingQuestion,
    sessionCost: sessionCostRef.current,
    addUserMessage,
    reset,
  };
}
