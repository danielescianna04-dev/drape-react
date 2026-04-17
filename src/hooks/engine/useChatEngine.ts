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
import type { AgentToolEvent } from '../api/useAgentStream';
import { sanitizeAgentText } from '../../shared/utils/sanitizeAgentText';

// ─── Public types ────────────────────────────────────────────────────────────

export interface ChatEngineMessage {
  id: string;
  type: 'thinking' | 'text' | 'tool_start' | 'tool_complete' | 'tool_error' | 'error' | 'budget_exceeded' | 'budget_warning' | 'completion' | 'context_compacted' | 'status';
  isCompacting?: boolean;
  content: string;
  phase?: string;

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
  /** Context window usage percentage (0-100). Updated with each usage event. */
  contextUsagePercent: number;
  /** Add a user message to the message list (used by both consumers). */
  addUserMessage: (content: string, extra?: Record<string, any>) => string;
  /** Wipe all messages / state for a fresh session. */
  reset: () => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useChatEngine(
  agentEvents: AgentToolEvent[],
  agentStreaming: boolean,
  eventsVersion?: number,
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
  const [contextUsagePercent, setContextUsagePercent] = useState(0);
  /** Tracks whether ANY text_delta was processed in the current agent run.
   *  Used to suppress duplicate completion messages when text was already streamed. */
  const hadStreamedTextRef = useRef(false);
  /** Tracks whether the current run executed at least one tool. */
  const hadToolActivityRef = useRef(false);
  /** The ID of the last text message created from text_delta, survives tool_start clearing currentMessageIdRef. */
  const lastStreamedMsgIdRef = useRef<string | null>(null);

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

  // RAF-based text_delta throttle: accumulate deltas in refs, flush once per frame
  const textFlushRafRef = useRef<number | null>(null);
  const pendingTextFlushRef = useRef(false);

  const normalizeTodos = useCallback((rawTodos: any): any[] => {
    let parsed: any = rawTodos;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = [];
      }
    }

    const list = Array.isArray(parsed) ? parsed : [];
    // Clone every item so React always gets a new identity even if backend mutates in place
    return list.map((todo: any, index: number) => ({
      id: todo?.id || `todo-${index}`,
      content: String(todo?.content ?? ''),
      activeForm: String(todo?.activeForm ?? todo?.content ?? ''),
      status: (todo?.status === 'completed' || todo?.status === 'in_progress' || todo?.status === 'pending')
        ? todo.status
        : 'pending',
    }));
  }, []);

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
    // NOTE: Do NOT reset contextUsagePercent here — the backend conversation
    // history persists across messages, so the percentage should only update
    // from backend usage events, not be zeroed on every message send.
    hadStreamedTextRef.current = false;
    hadToolActivityRef.current = false;
    lastStreamedMsgIdRef.current = null;
    if (gapTimerRef.current) { clearTimeout(gapTimerRef.current); gapTimerRef.current = null; }
    if (textFlushRafRef.current) { cancelAnimationFrame(textFlushRafRef.current); textFlushRafRef.current = null; }
    pendingTextFlushRef.current = false;
  }, []);

  useEffect(() => {
    hadStreamedTextRef.current = false;
    hadToolActivityRef.current = false;
  }, [eventsVersion]);

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
        }
        continue;
      }

      // ── THINKING_START ──────────────────────────────────────────────────
      // Backend can send either:
      // - explicit event type: thinking_start
      // - type: thinking with { start: true }
      if (event.type === 'thinking_start' || (event.type === 'thinking' && (event as any).start)) {
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

      // ── THINKING_END ────────────────────────────────────────────────────
      // Backend can send either:
      // - explicit event type: thinking_end
      // - type: thinking with { end: true }
      if (event.type === 'thinking_end' || (event.type === 'thinking' && (event as any).end)) {
        continue;
      }

      // ── PROCESSING / HEARTBEAT ─────────────────────────────────────────
      // These events keep the SSE connection alive. Don't create new UI elements —
      // the gap timer already handles the "thinking" indicator. Just skip them.
      if ((event as any).type === 'processing' || (event as any).type === 'heartbeat') {
        continue;
      }

      // ── STATUS ────────────────────────────────────────────────────────
      if ((event as any).type === 'status') {
        const statusMessage = String((event as any).message || '').trim();
        if (!statusMessage) continue;
        setMessages(prev => [...prev, {
          id: `engine-status-${Date.now()}-${i}`,
          type: 'status',
          content: statusMessage,
          phase: String((event as any).phase || ''),
          timestamp: new Date(),
        }]);
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

      // ── TOOL_START ──────────────────────────────────────────────────────
      if (event.type === 'tool_start' && event.tool) {
        // Skip signal_completion and ask_user_question from visible UI
        if (event.tool === 'signal_completion' || event.tool === 'ask_user_question') continue;
        hadToolActivityRef.current = true;

        const input = event.input || {};
        setActiveTools(prev => [...prev, event.tool!]);

        // Flush any pending RAF text_delta before closing the text message —
        // otherwise the last batch of text deltas would be lost when we clear streamingContentRef.
        if (pendingTextFlushRef.current) {
          if (textFlushRafRef.current) { cancelAnimationFrame(textFlushRafRef.current); textFlushRafRef.current = null; }
          pendingTextFlushRef.current = false;
          const flushContent = sanitizeAgentText(streamingContentRef.current);
          const flushMsgId = currentMessageIdRef.current;
          if (flushMsgId && flushContent) {
            setMessages(prev => {
              let updated = prev;
              if (prev.some(m => m.id.startsWith('engine-thinking-gap-'))) {
                updated = prev.filter(m => !m.id.startsWith('engine-thinking-gap-'));
              }
              const existingIdx = updated.findIndex(m => m.id === flushMsgId);
              if (existingIdx !== -1) {
                const copy = [...updated];
                copy[existingIdx] = { ...copy[existingIdx], type: 'text', isThinking: false, content: flushContent };
                return copy;
              }
              return [...updated, { id: flushMsgId, type: 'text' as const, content: flushContent, timestamp: new Date() }];
            });
          }
        }

        // Close current text/thinking message so post-tool text creates a new message
        if (currentMessageIdRef.current) {
          currentMessageIdRef.current = null;
          streamingContentRef.current = '';
        }

        // Close and remove status-only thinking messages (heartbeat/gap placeholders)
        // and append the new tool_start in a single setMessages call
        setMessages(prev => {
          const closed = prev
            .filter(m => {
              if (!m.isThinking) return true;
              // Remove all thinking items that have no real content (gap placeholders, heartbeat status)
              // Keep thinking items that have actual model thinking content
              const hasRealThinking = m.content?.trim() && !m.id.startsWith('engine-thinking-');
              return hasRealThinking;
            })
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
        if (event.tool === 'signal_completion' || event.tool === 'ask_user_question') continue;
        hadToolActivityRef.current = true;
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

        // ask_user_question: skip from visible UI (question shown inline in text)
        if (event.tool === 'ask_user_question') continue;

        // signal_completion: do not create a separate visible message.
        // The user should only see the main assistant text plus tool rows.
        if (event.tool === 'signal_completion') {
          continue;
        }

        hadToolActivityRef.current = true;

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
        if (event.tool === 'signal_completion' || event.tool === 'ask_user_question') continue;
        hadToolActivityRef.current = true;
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

        hadStreamedTextRef.current = true;

        // If a gap-thinking placeholder was created while text was still streaming,
        // reclaim the previous text message instead of creating a new one.
        if (currentMessageIdRef.current?.startsWith('engine-thinking-gap-') && lastStreamedMsgIdRef.current) {
          currentMessageIdRef.current = lastStreamedMsgIdRef.current;
          // streamingContentRef still has the old content — don't reset it
        }

        // First delta after thinking → prepare to convert thinking item to text
        const isFirstDelta = currentMessageIdRef.current?.startsWith('engine-thinking-') && streamingContentRef.current === '';
        if (isFirstDelta) {
          streamingContentRef.current = delta;
          lastStreamedMsgIdRef.current = currentMessageIdRef.current!;
        } else if (currentMessageIdRef.current) {
          // Accumulate into existing text message ref (no React state yet)
          streamingContentRef.current += delta;
          lastStreamedMsgIdRef.current = currentMessageIdRef.current;
        } else {
          // No current message → prepare new text message
          streamingContentRef.current = delta;
          const newId = `engine-text-${Date.now()}`;
          currentMessageIdRef.current = newId;
          lastStreamedMsgIdRef.current = newId;
        }

        // Schedule a single RAF flush — only ONE setMessages per frame
        if (!pendingTextFlushRef.current) {
          pendingTextFlushRef.current = true;
          textFlushRafRef.current = requestAnimationFrame(() => {
            pendingTextFlushRef.current = false;
            textFlushRafRef.current = null;
            const content = sanitizeAgentText(streamingContentRef.current);
            const msgId = currentMessageIdRef.current;
            if (!msgId || !content) return;

            setMessages(prev => {
              // Remove gap-thinking placeholders in the same update
              let updated = prev;
              if (prev.some(m => m.id.startsWith('engine-thinking-gap-'))) {
                updated = prev.filter(m => !m.id.startsWith('engine-thinking-gap-'));
              }

              // Find existing message to update
              const existingIdx = updated.findIndex(m => m.id === msgId);
              if (existingIdx !== -1) {
                // Update in-place (convert thinking→text or update content)
                const copy = [...updated];
                copy[existingIdx] = { ...copy[existingIdx], type: 'text', isThinking: false, content };
                return copy;
              }
              // New message — append
              return [...updated, {
                id: msgId,
                type: 'text' as const,
                content,
                timestamp: new Date(),
              }];
            });
          });
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
        content = sanitizeAgentText(String(content));
        if (!content.trim()) continue;

        // Remove visual gap-thinking placeholders before appending/merging text messages.
        setMessages(prev => prev.filter(m => !m.id.startsWith('engine-thinking-gap-')));

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

      // ── CONTEXT COMPACTING / COMPACTED ─────────────────────────────────
      if (event.type === 'context_compacting') {
        const compactingId = `compacting-${Date.now()}`;
        setMessages(prev => [
          ...prev,
          { id: compactingId, type: 'context_compacted' as const, content: '__CONTEXT_COMPACTING__', isCompacting: true, timestamp: new Date() },
        ]);
        currentMessageIdRef.current = compactingId;
        continue;
      }
      if (event.type === 'context_compacted') {
        setMessages(prev => prev.map(m =>
          m.type === 'context_compacted' && m.isCompacting
            ? { ...m, content: '__CONTEXT_COMPACTED__', isCompacting: false }
            : m
        ));
        currentMessageIdRef.current = null;
        continue;
      }

      // Sub-agent events are handled by SubAgentStatus in ChatPage (not here)
      if (event.type === 'sub_agent_start' || event.type === 'sub_agent_complete') {
        continue;
      }

      if (event.type === 'budget_warning') {
        // Emit a warning message in chat
        const data = event as any;
        const pct = data.percentUsed || 75;
        const budgetEur = data.budgetEur || 1.00;
        setMessages(prev => [
          ...prev,
          { id: `budget-warn-${Date.now()}`, type: 'text' as const, content: `__BUDGET_WARNING_${pct}__`, timestamp: new Date() },
        ]);
        continue;
      }

      if (event.type === 'budget_exceeded') {
        setIsLoading(false);
        currentMessageIdRef.current = null;
        streamingContentRef.current = '';
        thinkingContentRef.current = '';
        // Remove all thinking placeholders and show the budget stop explicitly
        setMessages(prev => [
          ...prev
            .filter(m => !m.isThinking)
            .map(m => m.isThinking ? { ...m, isThinking: false } : m),
          { id: `budget-${Date.now()}`, type: 'budget_exceeded' as const, content: '__BUDGET_EXCEEDED__', timestamp: new Date() },
        ]);
        continue;
      }

      // ── ERROR / FATAL_ERROR ─────────────────────────────────────────────
      if (event.type === 'error' || event.type === 'fatal_error') {
        setIsLoading(false);
        setActiveTools([]);
        const rawError = (event as any).error || (event as any).message || 'Unknown error';
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
        if ((event as any).contextUsagePercent !== undefined) {
          setContextUsagePercent((event as any).contextUsagePercent);
        }
        continue;
      }

      // ── TODO_UPDATE ─────────────────────────────────────────────────────
      if ((event as any).type === 'todo_update') {
        setCurrentTodos(normalizeTodos((event as any).todos));
        continue;
      }

      // ── ASK_USER_QUESTION ───────────────────────────────────────────────
      if ((event as any).type === 'ask_user_question') {
        setPendingQuestion((event as any).questions || null);
        continue;
      }

      // ── COMPLETE / DONE ─────────────────────────────────────────────────
      if (event.type === 'complete' || event.type === 'done') {
        // Flush any pending RAF text_delta so the last text chunk isn't lost
        if (pendingTextFlushRef.current) {
          if (textFlushRafRef.current) { cancelAnimationFrame(textFlushRafRef.current); textFlushRafRef.current = null; }
          pendingTextFlushRef.current = false;
          const flushContent = sanitizeAgentText(streamingContentRef.current);
          const flushMsgId = currentMessageIdRef.current || lastStreamedMsgIdRef.current;
          if (flushMsgId && flushContent) {
            setMessages(prev => {
              const existingIdx = prev.findIndex(m => m.id === flushMsgId);
              if (existingIdx !== -1) {
                const copy = [...prev];
                copy[existingIdx] = { ...copy[existingIdx], type: 'text', isThinking: false, content: flushContent };
                return copy;
              }
              return [...prev, { id: flushMsgId, type: 'text' as const, content: flushContent, timestamp: new Date() }];
            });
          }
        }

        setIsLoading(false);
        setActiveTools([]);

        // Attach cost to the streamed text message (use lastStreamedMsgIdRef as fallback
        // since tool_start clears currentMessageIdRef)
        const costMsgId = currentMessageIdRef.current || lastStreamedMsgIdRef.current;
        if (costMsgId && (sessionCostRef.current.costEur > 0 || sessionCostRef.current.inputTokens > 0)) {
          const cost = { ...sessionCostRef.current };
          setMessages(prev => prev.map(m =>
            m.id === costMsgId
              ? { ...m, costEur: cost.costEur, tokensUsed: { input: cost.inputTokens, output: cost.outputTokens } } as any
              : m,
          ));
        }

        // Safety: remove ALL thinking items on completion (heartbeat/gap placeholders
        // like "Preparazione risposta... (3s)" should not persist as visible messages)
        setMessages(prev => prev.filter(m => m.type !== 'thinking'));

        // NOTE: Don't clear currentTodos here — let them persist until engine.reset()
        // so the TODO card stays visible after agent completion.

        // Reset cost for next run
        sessionCostRef.current = { costEur: 0, inputTokens: 0, outputTokens: 0 };
        continue;
      }
    }

    lastProcessedIndexRef.current = agentEvents.length - 1;

    // After processing events, set a gap timer: if no new events arrive
    // while streaming is active, show a thinking indicator (e.g. waiting for next AI response)
    if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
    if (agentStreaming) {
      gapTimerRef.current = setTimeout(() => {
        setMessages(prev => {
          if (prev.length === 0) return prev;
          if (prev.some(m => m.isThinking)) return prev;
          const last = prev[prev.length - 1];
          // Don't add while tools are actively executing
          if (last.type === 'tool_start' && last.isExecuting) return prev;
          // Show thinking if last message is idle (completed text, completed tool, error, etc.)
          const newId = `engine-thinking-gap-${Date.now()}`;
          currentMessageIdRef.current = newId;
          thinkingContentRef.current = '';
          return [...prev, {
            id: newId,
            type: 'thinking' as const,
            content: '',
            isThinking: true,
            thinkingContent: '',
            timestamp: new Date(),
          }];
        });
      }, 300);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsVersion, agentStreaming, normalizeTodos]);

  // Keep isLoading in sync with agentStreaming
  useEffect(() => {
    if (agentStreaming && !isLoading) {
      setIsLoading(true);
    }
    if (!agentStreaming && gapTimerRef.current) {
      clearTimeout(gapTimerRef.current);
      gapTimerRef.current = null;
    }
    if (!agentStreaming && isLoading) {
      setIsLoading(false);
    }
  }, [agentStreaming, isLoading]);

  return {
    messages,
    activeTools,
    isLoading,
    currentTodos,
    pendingQuestion,
    sessionCost: sessionCostRef.current,
    contextUsagePercent,
    addUserMessage,
    reset,
  };
}
