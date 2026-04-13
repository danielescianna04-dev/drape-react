/**
 * useChatSendHandler — Extracted from ChatPage.
 *
 * Contains:
 * - handleSend (the ~620-line main send function)
 * - handleStop
 * - handleRetryTool
 * - clearDanglingThinkingState
 * - setLoading helper
 * - processedUndoEventsRef + undo event tracking effect
 * - pendingChatMessage handler effect
 * - Bridge refs (preThinkingIdRef, engineIdMapRef, prevEngineMessagesRef)
 */

import { useRef, useEffect, useCallback, MutableRefObject } from 'react';
import { Keyboard } from 'react-native';
import { SharedValue, withSpring } from 'react-native-reanimated';
import apiClient from '../../core/api/apiClient';
import { TerminalItemType, TerminalItem } from '../../shared/types';
import type { Tab } from '../../core/tabs/tabStore';
import { useTabStore } from '../../core/tabs/tabStore';
import type { WorkstationInfo } from '../../shared/types';
import type { UseChatEngineReturn, ChatEngineMessage } from '../../hooks/engine/useChatEngine';
import type { AgentToolEvent } from '../../hooks/api/useAgentStream';
import { useFileHistoryStore } from '../../core/history/fileHistoryStore';
import { useAgentStore } from '../../core/agent/agentStore';
import { useWorkstationStore } from '../../core/terminal/workstationStore';
import { useUIStore } from '../../core/terminal/uiStore';
import { ToolService } from '../../core/ai/toolService';
import { config } from '../../config/config';
import { getAuthToken } from '../../core/api/getAuthToken';
import { sanitizeAgentText } from '../../shared/utils/sanitizeAgentText';
import { parseUndoData } from './chatUndo';
import { clearInterruptedThinkingItems, updateTabTerminalItem, appendTabTerminalItems } from './chatTabStoreHelpers';
import { buildAgentConversationHistory, ChatHistoryItem } from './chatConversationHistory';
import { persistChatMessagesSnapshot, persistChatSessionOnSend } from './chatSessionPersistence';
import { formatToolResult, getToolStartMessage, isCommand, isTerminalInput } from './chatToolFormatting';
import {
  tracciaMessaggioChat,
  tracciaComandoTerminaleChat,
  tracciaErrore,
  tracciaErroreRispostaAI,
} from '../../core/services/analyticsService';

// ─── Param types ────────────────────────────────────────────────────────────

export interface UseChatSendHandlerParams {
  // Tab / workspace
  tab: Tab | undefined;
  currentTab: Tab | undefined;
  currentWorkstation: WorkstationInfo | null;

  // Engine
  engine: UseChatEngineReturn;

  // Input state
  input: string;
  setInput: (v: string) => void;
  selectedInputImages: { uri: string; base64?: string; type?: string }[];
  setSelectedInputImages: React.Dispatch<React.SetStateAction<{ uri: string; base64?: string; type?: string }[]>>;

  // Mode / model
  agentMode: 'fast' | 'terminal';
  selectedModel: string;
  thinkingLevel: string;
  forcedMode: 'terminal' | 'ai' | null;
  isTerminalMode: boolean;
  setIsTerminalMode: (v: boolean) => void;
  conversationHistory: string[];
  setConversationHistory: (v: string[]) => void;

  // Terminal item helpers
  addTerminalItem: (item: Partial<TerminalItem> & { id: string; content: string }) => void;
  updateTerminalItemById: (tabId: string, itemId: string, updates: Partial<TerminalItem>) => void;
  removeTerminalItemById: (tabId: string, itemId: string) => void;
  updateTab: (tabId: string, updates: Partial<Tab>) => void;

  // Agent stream
  startAgent: (prompt: string, projectId: string, model: string, history: ChatHistoryItem[], images?: { base64: string; type: string }[], thinkingLevel?: string) => void;
  stopAgent: () => void;
  agentStreaming: boolean;
  agentEvents: AgentToolEvent[];

  // Scroll
  scrollToBottom: (animated: boolean) => void;
  setNearBottomState: (v: boolean) => void;
  scrollLockUntilRef: MutableRefObject<number>;

  // Animation values
  hasChatStarted: boolean;
  hasChatStartedAnim: SharedValue<number>;
  inputPositionAnim: SharedValue<number>;

  // Refs from chatState
  isProcessingToolsRef: MutableRefObject<boolean>;

  // i18n
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export interface UseChatSendHandlerReturn {
  handleSend: (images?: { uri: string; base64?: string; type?: string }[]) => Promise<void>;
  handleStop: () => void;
  handleRetryTool: (tool: string, input: Record<string, unknown>) => Promise<void>;
  handleSendRef: MutableRefObject<((images?: { uri: string; base64?: string; type?: string }[]) => Promise<void>) | null>;
  /** Refs exposed so the engine bridge and other effects can use them. */
  preThinkingIdRef: MutableRefObject<string | null>;
  engineIdMapRef: MutableRefObject<Map<string, string>>;
  prevEngineMessagesRef: MutableRefObject<ChatEngineMessage[]>;
  clearDanglingThinkingState: (tabId: string) => void;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useChatSendHandler(params: UseChatSendHandlerParams): UseChatSendHandlerReturn {
  const {
    tab,
    currentTab,
    currentWorkstation,
    engine,
    input,
    setInput,
    selectedInputImages,
    setSelectedInputImages,
    agentMode,
    selectedModel,
    thinkingLevel,
    forcedMode,
    isTerminalMode,
    setIsTerminalMode,
    conversationHistory,
    setConversationHistory,
    addTerminalItem,
    updateTerminalItemById,
    removeTerminalItemById,
    updateTab,
    startAgent,
    stopAgent,
    agentStreaming,
    agentEvents,
    scrollToBottom,
    setNearBottomState,
    scrollLockUntilRef,
    hasChatStarted,
    hasChatStartedAnim,
    inputPositionAnim,
    isProcessingToolsRef,
    t,
  } = params;

  const isLoading = currentTab?.isLoading || false;

  // ── Bridge refs ─────────────────────────────────────────────────────────
  const preThinkingIdRef = useRef<string | null>(null);
  const engineIdMapRef = useRef<Map<string, string>>(new Map());
  const prevEngineMessagesRef = useRef<ChatEngineMessage[]>([]);

  // ── Undo event processing ───────────────────────────────────────────────
  const processedUndoEventsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentWorkstation?.id || !agentEvents?.length) return;

    const seen = processedUndoEventsRef.current;
    const nextSeen = new Set(seen);

    for (const event of agentEvents) {
      if (event.type !== 'tool_complete' || !event.tool) continue;

      const eventKey = `${event.type}:${event.id || ''}:${event.tool}:${event.timestamp?.toString?.() || ''}`;
      if (nextSeen.has(eventKey)) continue;
      nextSeen.add(eventKey);

      if (!['write_file', 'edit_file', 'multi_edit_file', 'patch_file'].includes(event.tool)) continue;

      const rawResult = event.result ?? event.output;
      const resultText = typeof rawResult === 'string'
        ? rawResult
        : typeof rawResult?.content === 'string'
          ? rawResult.content
          : '';

      if (!resultText) continue;

      const { undoData } = parseUndoData(resultText);
      if (undoData && undoData.__undo && undoData.filePath) {
        useFileHistoryStore.getState().recordModification({
          projectId: currentWorkstation.id,
          filePath: undoData.filePath,
          originalContent: undoData.originalContent || '',
          newContent: undoData.newContent || '',
          toolName: event.tool === 'write_file' ? 'write_file' : 'edit_file',
          description: `AI: ${event.tool === 'write_file' ? 'Created' : 'Modified'} ${undoData.filePath}`,
        });
      }
    }

    // keep bounded to avoid unbounded growth in long sessions
    if (nextSeen.size > 1000) {
      processedUndoEventsRef.current = new Set(Array.from(nextSeen).slice(-500));
    } else {
      processedUndoEventsRef.current = nextSeen;
    }
  }, [agentEvents, currentWorkstation?.id]);

  useEffect(() => {
    processedUndoEventsRef.current.clear();
  }, [currentTab?.id]);

  // ── setLoading helper ───────────────────────────────────────────────────
  const setLoading = useCallback((loading: boolean) => {
    if (currentTab) {
      updateTab(currentTab.id, { isLoading: loading });
    }
  }, [currentTab, updateTab]);

  // ── clearDanglingThinkingState ──────────────────────────────────────────
  const clearDanglingThinkingState = useCallback((tabId: string) => {
    const targetTab = useTabStore.getState().tabs.find(t => t.id === tabId);
    const hasDanglingThinking = (targetTab?.terminalItems || []).some(item => item.isThinking);
    if (!hasDanglingThinking) return;

    // Don't remove items that are managed by the engine bridge (pre-thinking
    // placeholders awaiting RAF text flush). Only clear truly orphaned items.
    const bridgeManagedIds = new Set(engineIdMapRef.current.values());
    // Also protect the current pre-thinking placeholder (RAF might not have flushed yet)
    const activePreThinking = preThinkingIdRef.current;
    if (activePreThinking) bridgeManagedIds.add(activePreThinking);

    // Don't null preThinkingIdRef here — the bridge needs it to map engine messages.
    // It gets cleared by the bridge itself when it processes the first message.
    useTabStore.setState((state) => ({
      tabs: state.tabs.map(t =>
        t.id === tabId
          ? {
            ...t,
            terminalItems: (t.terminalItems ?? [])
              .map(item => item.isThinking ? { ...item, isThinking: false } : item)
              .filter(item => item.content !== '' || bridgeManagedIds.has(item.id)),
          }
          : t
      ),
    }));
  }, []);

  // ── handleRetryTool ─────────────────────────────────────────────────────
  const handleRetryTool = useCallback(async (tool: string, toolInput: Record<string, unknown>) => {
    if (!currentTab?.id || !currentWorkstation?.id) return;

    const retryItemId = `tool-retry-${Date.now()}-${tool}`;
    addTerminalItem({
      id: retryItemId,
      content: getToolStartMessage(tool, toolInput),
      type: TerminalItemType.OUTPUT,
      timestamp: new Date(),
      isExecuting: true,
      toolInfo: {
        tool,
        input: toolInput,
        status: 'running',
      },
    });
    scrollToBottom(true);

    try {
      const response = await apiClient.post(`${config.apiUrl}/agent/execute-tool`, {
        tool,
        input: toolInput,
        projectId: currentWorkstation.id,
      });

      const rawToolResult = response?.data?.result;
      const rawResultText = typeof rawToolResult === 'string'
        ? rawToolResult
        : typeof rawToolResult?.content === 'string'
          ? rawToolResult.content
          : rawToolResult != null
            ? JSON.stringify(rawToolResult)
            : '';

      const { cleanResult, undoData } = parseUndoData(rawResultText);
      if (undoData && undoData.__undo && undoData.filePath) {
        useFileHistoryStore.getState().recordModification({
          projectId: currentWorkstation.id,
          filePath: undoData.filePath,
          originalContent: undoData.originalContent || '',
          newContent: undoData.newContent || '',
          toolName: tool === 'write_file' ? 'write_file' : 'edit_file',
          description: `AI retry: ${tool === 'write_file' ? 'Created' : 'Modified'} ${undoData.filePath}`,
        });
      }

      const normalizedResult = typeof rawToolResult === 'object' && rawToolResult !== null
        ? { ...rawToolResult, content: cleanResult }
        : cleanResult;

      updateTerminalItemById(currentTab.id, retryItemId, {
        content: formatToolResult(tool, toolInput, normalizedResult),
        isExecuting: false,
        toolInfo: {
          tool,
          input: toolInput,
          output: normalizedResult,
          status: 'completed',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Retry failed';
      updateTerminalItemById(currentTab.id, retryItemId, {
        content: `${tool}\n└─ Error: ${message}`,
        type: TerminalItemType.OUTPUT,
        isExecuting: false,
        toolInfo: {
          tool,
          input: toolInput,
          output: message,
          status: 'error',
        },
      });
    }
  }, [currentTab?.id, currentWorkstation?.id, addTerminalItem, updateTerminalItemById, scrollToBottom]);

  // ── handleStop ──────────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    // Stop the agent SSE stream
    stopAgent();

    // Clear loading state
    setLoading(false);

    // Reset engine and bridge
    engine.reset();
    prevEngineMessagesRef.current = [];
    engineIdMapRef.current.clear();
    preThinkingIdRef.current = null;

    // Remove any "Thinking..." placeholders from the current tab
    if (currentTab?.id) {
      clearInterruptedThinkingItems(currentTab.id);
    }
  }, [stopAgent, currentTab?.id, setLoading, engine]);

  // ── handleSend ──────────────────────────────────────────────────────────
  const handleSend = async (images?: { uri: string; base64?: string; type?: string }[]) => {
    // Use passed images or fall back to selectedInputImages
    const imagesToSend = (images && images.length > 0) ? images : (selectedInputImages.length > 0 ? selectedInputImages : undefined);

    if ((!input.trim() && (!imagesToSend || imagesToSend.length === 0)) || isLoading) {
      return;
    }

    // Reset tool processing flag for new message
    isProcessingToolsRef.current = false;

    // Animate input to bottom on first send - Apple-style smooth animation
    if (!hasChatStarted) {
      hasChatStartedAnim.value = 1; // Mark chat as started
      inputPositionAnim.value = withSpring(1, {
        damping: 20,
        stiffness: 180,
        mass: 0.8,
      });
    }

    // Always dismiss keyboard when sending
    // Lock scroll tracking for 500ms so keyboard dismiss animation
    // doesn't incorrectly set isNearBottom=false
    scrollLockUntilRef.current = Date.now() + 500;
    setNearBottomState(true);
    Keyboard.dismiss();

    const userMessage = input.trim() || (imagesToSend && imagesToSend.length > 0 ? `[${imagesToSend.length} immagini allegate]` : '');

    // Check if agent mode is active (fast only - terminal mode handles separately)
    const isAgentMode = agentMode === 'fast';

    persistChatSessionOnSend({
      currentTab,
      userMessage,
      currentWorkstation,
      selectedModel,
      updateTab,
    });

    // If agent mode AND we have a workstation, use agent stream
    if (isAgentMode && currentWorkstation?.id) {
      // Reset engine and bridge for new session
      engine.reset();
      prevEngineMessagesRef.current = [];
      engineIdMapRef.current.clear();

      // Add user message to terminal with images
      const cleanImagesForStore = imagesToSend ? imagesToSend.map(img => ({
        uri: String(img.uri || ''),
        base64: String(img.base64 || ''),
        type: String(img.type || 'image/jpeg')
      })) : undefined;

      addTerminalItem({
        id: Date.now().toString(),
        content: userMessage,
        type: TerminalItemType.USER_MESSAGE,
        timestamp: new Date(),
        images: cleanImagesForStore,
      });

      // Add pre-thinking placeholder for instant UX (engine will replace it)
      const preId = `pre-thinking-${Date.now()}`;
      preThinkingIdRef.current = preId;
      addTerminalItem({
        id: preId,
        content: '',
        type: TerminalItemType.OUTPUT,
        timestamp: new Date(),
        isThinking: true,
        thinkingContent: '',
      });

      setInput('');
      setSelectedInputImages([]); // Clear images after sending
      setLoading(true);

      // Force scroll to bottom so user sees the Thinking... placeholder immediately
      setNearBottomState(true);
      setTimeout(() => scrollToBottom(true), 50);

      // Store the prompt in the agent store
      const agentState = useAgentStore.getState();
      agentState.setCurrentPrompt(userMessage);
      agentState.setCurrentProjectId(currentWorkstation.id);

      // Build conversation history from terminal items (ALL messages, no limits - Claude Code style)
      const agentConversationHistory = buildAgentConversationHistory(currentTab?.terminalItems || []);

      // Start agent stream with selected model, conversation history, and current images
      const cleanImages = imagesToSend ? imagesToSend.map(img => ({
        base64: String(img.base64 || ''),
        type: String(img.type || 'image/jpeg')
      })) : undefined;

      startAgent(userMessage, currentWorkstation.id, selectedModel, agentConversationHistory, cleanImages, thinkingLevel);
      tracciaMessaggioChat(selectedModel, 'agent');

      setLoading(false);
      return;
    }

    // Terminal mode - auto-detect: command → execute in container, natural language → AI
    if (agentMode === 'terminal' && currentWorkstation?.id && isTerminalInput(userMessage)) {
      tracciaComandoTerminaleChat();
      addTerminalItem({
        id: Date.now().toString(),
        content: userMessage,
        type: TerminalItemType.COMMAND,
        isDirectTerminal: true,
        timestamp: new Date(),
      });

      setInput('');
      setSelectedInputImages([]);
      setLoading(true);

      try {
        const response = await apiClient.post(
          `${config.apiUrl}/workstation/execute-command`,
          {
            projectId: currentWorkstation.id,
            command: userMessage,
          }
        );

        const stdout = response.data.stdout || '';
        const stderr = response.data.stderr || '';
        const output = (stdout + (stderr ? `\n${stderr}` : '')).trim() || '(nessun output)';

        addTerminalItem({
          id: (Date.now() + 1).toString(),
          content: output,
          type: TerminalItemType.OUTPUT,
          isDirectTerminal: true,
          timestamp: new Date(),
        });
      } catch (err: unknown) {
        addTerminalItem({
          id: (Date.now() + 1).toString(),
          content: `${t('common:error')}: ${err instanceof Error ? err.message : t('terminal:tools.failed')}`,
          isDirectTerminal: true,
          type: TerminalItemType.OUTPUT,
          timestamp: new Date(),
        });
      } finally {
        setLoading(false);
      }

      setNearBottomState(true);
      setTimeout(() => scrollToBottom(true), 100);
      setTimeout(() => scrollToBottom(true), 350);
      return;
    // Terminal mode but natural language → fall through to AI
    }

    // Se c'è un forced mode, usa quello, altrimenti auto-detect
    const shouldExecuteCommand = forcedMode
      ? forcedMode === 'terminal'
      : isCommand(userMessage);

    // Aggiorna il toggle in base al tipo rilevato (solo se non in forced mode)
    if (!forcedMode) {
      setIsTerminalMode(shouldExecuteCommand);
    }

    setInput('');

    if (!shouldExecuteCommand) {
      tracciaMessaggioChat(selectedModel, 'terminal');
    }

    const messageType = shouldExecuteCommand ? TerminalItemType.COMMAND : TerminalItemType.USER_MESSAGE;

    // Create streaming message placeholder IMMEDIATELY for AI chat
    let streamingMessageId = (Date.now() + 2).toString();
    let streamedContent = '';

    // Add user message
    addTerminalItem({
      id: Date.now().toString(),
      content: userMessage,
      type: messageType,
      timestamp: new Date(),
    });

    // For AI chat, add placeholder with isThinking=true immediately
    if (!shouldExecuteCommand) {
      addTerminalItem({
        id: streamingMessageId,
        content: '',
        type: TerminalItemType.OUTPUT,
        timestamp: new Date(),
        isThinking: true,
      });

      // Force scroll to bottom so user sees the Thinking... placeholder immediately
      setNearBottomState(true);
      setTimeout(() => scrollToBottom(true), 50);
    }

    setLoading(true);

    try {
      if (shouldExecuteCommand) {
        // Terminal mode - execute command
        const response = await apiClient.post(
          `${config.apiUrl}/terminal/execute`,
          {
            command: userMessage,
            workstationId: currentWorkstation?.id
          }
        );

        addTerminalItem({
          id: (Date.now() + 1).toString(),
          content: response.data.output || '',
          type: TerminalItemType.OUTPUT,
          timestamp: new Date(),
        });
      } else {
        // Chat mode - AI response
        // Placeholder already created above with isThinking: true

        // IMPORTANT: Wait before starting XHR to allow React to render "Thinking..." placeholder
        await new Promise(resolve => setTimeout(resolve, 400));

        // Track when we started to ensure minimum "Thinking..." display time
        const thinkingStartTime = Date.now();
        const MIN_THINKING_TIME = 500;
        let hasShownFirstContent = false;

        // Use XMLHttpRequest for streaming (works in React Native)
        const chatAuthToken = await getAuthToken();
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.open('POST', `${config.apiUrl}/ai/chat`);
          xhr.setRequestHeader('Content-Type', 'application/json');
          if (chatAuthToken) {
            xhr.setRequestHeader('Authorization', `Bearer ${chatAuthToken}`);
          }
          xhr.timeout = 60000;

          let buffer = '';
          let thinkingContent = '';
          let isThinking = false;

          xhr.onprogress = () => {
            const newData = xhr.responseText.substring(buffer.length);
            buffer = xhr.responseText;

            const lines = newData.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.substring(6).trim();
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);

                  // Handle tool results from backend
                  if (parsed.toolResult) {
                    const { name, args, result } = parsed.toolResult;
                    updateTabTerminalItem(tab!.id, streamingMessageId, { isThinking: false });

                    // Parse undo data for write/edit operations
                    const { cleanResult, undoData } = parseUndoData(result);

                    // Record modification to history if undo data is present
                    if (undoData && undoData.__undo && currentWorkstation?.id) {
                      useFileHistoryStore.getState().recordModification({
                        projectId: currentWorkstation.id,
                        filePath: undoData.filePath,
                        originalContent: undoData.originalContent || '',
                        newContent: undoData.newContent,
                        toolName: name as 'write_file' | 'edit_file',
                        description: `AI: ${name === 'write_file' ? 'Created' : 'Modified'} ${undoData.filePath}`,
                      });
                    }

                    const toolResultId = `tool-result-${Date.now()}`;
                    appendTabTerminalItems(tab!.id, [{
                      id: toolResultId,
                      type: TerminalItemType.OUTPUT,
                      content: formatToolResult(name, args, cleanResult),
                      timestamp: new Date(),
                    }]);

                    // IMPORTANT: Create a new streaming message for text after the tool
                    streamingMessageId = `stream-after-tool-${Date.now()}`;
                    streamedContent = '';

                    addTerminalItem({
                      id: streamingMessageId,
                      content: '',
                      type: TerminalItemType.OUTPUT,
                      timestamp: new Date(),
                    });
                  }
                  // Handle batched tool results
                  else if (parsed.toolResultsBatch) {
                    const { toolResultsBatch } = parsed;

                    updateTabTerminalItem(tab!.id, streamingMessageId, { isThinking: false });

                    const formattedToolItems = toolResultsBatch.map((toolResult: { name: string; args: Record<string, unknown>; result: string }, index: number) => {
                      const { name, args, result } = toolResult;

                      const { cleanResult, undoData } = parseUndoData(result);

                      if (undoData && undoData.__undo && currentWorkstation?.id) {
                        useFileHistoryStore.getState().recordModification({
                          projectId: currentWorkstation.id,
                          filePath: undoData.filePath,
                          originalContent: undoData.originalContent || '',
                          newContent: undoData.newContent,
                          toolName: name as 'write_file' | 'edit_file',
                          description: `AI: ${name === 'write_file' ? 'Created' : 'Modified'} ${undoData.filePath}`,
                        });
                      }

                      return {
                        id: `tool-result-${Date.now()}-${name}-${index}`,
                        type: TerminalItemType.OUTPUT,
                        content: formatToolResult(name, args, cleanResult),
                        timestamp: new Date(),
                      };
                    });

                    appendTabTerminalItems(tab!.id, formattedToolItems);

                    // Create a new streaming message for text after the batched tools
                    streamingMessageId = `stream-after-batch-${Date.now()}`;
                    streamedContent = '';

                    addTerminalItem({
                      id: streamingMessageId,
                      content: '',
                      type: TerminalItemType.OUTPUT,
                      timestamp: new Date(),
                    });
                  }
                  // Handle function call in progress
                  else if (parsed.functionCall) {
                    const { name } = parsed.functionCall;
                    updateTabTerminalItem(tab!.id, streamingMessageId, { isThinking: false });

                    const toolIndicatorId = `tool-${Date.now()}-${name}`;
                    addTerminalItem({
                      id: toolIndicatorId,
                      content: `Executing: ${name}`,
                      type: TerminalItemType.OUTPUT,
                      timestamp: new Date(),
                    });

                    streamingMessageId = `stream-after-tool-${Date.now()}`;
                    streamedContent = '';

                    addTerminalItem({
                      id: streamingMessageId,
                      content: '',
                      type: TerminalItemType.OUTPUT,
                      timestamp: new Date(),
                    });
                  }
                  // Handle thinking start
                  else if (parsed.type === 'thinking_start') {
                    isThinking = true;
                    thinkingContent = '';
                    updateTabTerminalItem(tab!.id, streamingMessageId, { isThinking: true, thinkingContent: '' });
                  }
                  // Handle thinking content
                  else if (parsed.type === 'thinking' && parsed.text) {
                    thinkingContent += parsed.text;
                    updateTabTerminalItem(tab!.id, streamingMessageId, { isThinking: true, thinkingContent });
                  }
                  // Handle thinking end
                  else if (parsed.type === 'thinking_end') {
                    isThinking = false;
                    updateTabTerminalItem(tab!.id, streamingMessageId, { isThinking: false, thinkingContent });
                  }
                  // Handle text responses
                  else if (parsed.text) {
                    streamedContent += parsed.text;

                    const updateContent = () => {
                      const cleanContent = sanitizeAgentText(streamedContent);
                      updateTabTerminalItem(tab!.id, streamingMessageId, { content: cleanContent, isThinking: false });
                    };

                    if (!hasShownFirstContent) {
                      hasShownFirstContent = true;
                      const elapsed = Date.now() - thinkingStartTime;
                      const remaining = MIN_THINKING_TIME - elapsed;

                      if (remaining > 0) {
                        setTimeout(updateContent, remaining);
                      } else {
                        updateContent();
                      }
                    } else {
                      updateContent();
                    }
                  }
                } catch (e) {
                  // Skip invalid JSON
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

          xhr.onerror = () => reject(new Error('Network error'));
          xhr.ontimeout = () => reject(new Error('Request timeout - AI non risponde'));

          xhr.send(JSON.stringify({
            prompt: userMessage,
            selectedModel: selectedModel,
            conversationHistory: conversationHistory,
            workstationId: currentWorkstation?.id,
            projectId: currentWorkstation?.projectId || currentWorkstation?.id,
            repositoryUrl: currentWorkstation?.githubUrl || currentWorkstation?.repositoryUrl,
            userId: useWorkstationStore.getState().userId || null,
            username: (useWorkstationStore.getState().userId || 'anonymous').split('@')[0].replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(),
            thinkingLevel: thinkingLevel || null,
            context: currentWorkstation ? {
              projectName: currentWorkstation.name || 'Unnamed Project',
              language: currentWorkstation.language || 'Unknown',
              repositoryUrl: currentWorkstation.githubUrl || currentWorkstation.repositoryUrl || ''
            } : undefined
          }));
        });

        // After streaming completes, clean up and process tool calls
        if ((currentWorkstation?.projectId || currentWorkstation?.id) && !isProcessingToolsRef.current) {
          const projectId = currentWorkstation.projectId || currentWorkstation.id;

          const toolCalls = ToolService.detectToolCalls(streamedContent);

          if (toolCalls.length > 0) {
            isProcessingToolsRef.current = true;

            const firstToolCallMatch = streamedContent.match(/(read_file|write_file|list_files|search_in_files)\s*\(/);
            const toolCallIndex = firstToolCallMatch ? streamedContent.indexOf(firstToolCallMatch[0]) : -1;

            let beforeToolCall = streamedContent;
            let afterToolCall = '';

            if (toolCallIndex !== -1) {
              beforeToolCall = streamedContent.substring(0, toolCallIndex).trim();
              const afterToolCallStart = streamedContent.substring(toolCallIndex);
              const toolCallEnd = afterToolCallStart.indexOf('\n');
              if (toolCallEnd !== -1) {
                afterToolCall = afterToolCallStart.substring(toolCallEnd + 1).trim();
              }
            }

            const cleanedContent = sanitizeAgentText(ToolService.removeToolCallsFromText(beforeToolCall));

            updateTabTerminalItem(currentTab!.id, streamingMessageId, { content: cleanedContent });

            for (const toolCall of toolCalls) {
              if (toolCall.tool === 'write_file' || toolCall.tool === 'edit_file') {
                const result = await ToolService.executeTool(projectId, toolCall);

                addTerminalItem({
                  id: (Date.now() + Math.random()).toString(),
                  content: result,
                  type: TerminalItemType.OUTPUT,
                  timestamp: new Date(),
                });

                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
              }

              let commandText = '';
              switch (toolCall.tool) {
                case 'read_file':
                  commandText = `cat ${toolCall.args.filePath}`;
                  break;
                case 'list_files':
                  commandText = `ls ${toolCall.args.directory || '.'}`;
                  break;
                case 'search_in_files':
                  commandText = `grep -r "${toolCall.args.pattern}" .`;
                  break;
                default:
                  commandText = toolCall.tool;
              }

              addTerminalItem({
                id: (Date.now() + Math.random()).toString(),
                content: commandText,
                type: TerminalItemType.COMMAND,
                timestamp: new Date(),
              });

              await new Promise(resolve => setTimeout(resolve, 100));

              const result = await ToolService.executeTool(projectId, toolCall);

              addTerminalItem({
                id: (Date.now() + Math.random()).toString(),
                content: result,
                type: TerminalItemType.OUTPUT,
                timestamp: new Date(),
              });

              await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (afterToolCall) {
              const cleanedAfterToolCall = sanitizeAgentText(ToolService.removeToolCallsFromText(afterToolCall));
              if (cleanedAfterToolCall.trim()) {
                addTerminalItem({
                  id: (Date.now() + Math.random()).toString(),
                  content: cleanedAfterToolCall,
                  type: TerminalItemType.OUTPUT,
                  timestamp: new Date(),
                });
              }
            }

            streamedContent = cleanedContent + (afterToolCall ? '\n' + sanitizeAgentText(ToolService.removeToolCallsFromText(afterToolCall)) : '');

            isProcessingToolsRef.current = false;
          }
        }

        // Update conversation history with both user message and AI response
        setConversationHistory([...conversationHistory, userMessage, sanitizeAgentText(streamedContent)]);
      }
    } catch (error) {
      console.error('❌ [ChatPage] AI request failed:', error);
      tracciaErrore(error instanceof Error ? error.message : 'Unknown error', 'chat');
      tracciaErroreRispostaAI(selectedModel, error instanceof Error ? error.message : 'Unknown error');

      // Remove isThinking from the placeholder item so "Thinking..." disappears
      useTabStore.setState((state) => ({
        tabs: state.tabs.map(t =>
          t.id === tab!.id
            ? {
                ...t,
                terminalItems: t.terminalItems
                  ?.map(item =>
                    item.id === streamingMessageId
                      ? { ...item, isThinking: false, content: '' }
                      : item
                  )
                  .filter(item => item.content !== '' || item.isThinking),
              }
            : t
        )
      }));

      addTerminalItem({
        id: (Date.now() + 3).toString(),
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: TerminalItemType.ERROR,
        timestamp: new Date(),
      });
    } finally {
      setLoading(false);

      // Save messages to chat after completing the send
      persistChatMessagesSnapshot(currentTab);
    }
  };

  // ── handleSendRef for pending message effect ────────────────────────────
  const handleSendRef = useRef<((images?: { uri: string; base64?: string; type?: string }[]) => Promise<void>) | null>(null);
  handleSendRef.current = handleSend;

  // ── Handle pending chat message from preview error ──────────────────────
  const pendingChatMessage = useUIStore((state) => state.pendingChatMessage);

  useEffect(() => {
    if (!pendingChatMessage || !handleSendRef.current) return;
    setInput(pendingChatMessage);
    useUIStore.getState().setPendingChatMessage(null);
    setTimeout(() => {
      handleSendRef.current?.();
    }, 100);
  }, [pendingChatMessage]);

  return {
    handleSend,
    handleStop,
    handleRetryTool,
    handleSendRef,
    preThinkingIdRef,
    engineIdMapRef,
    prevEngineMessagesRef,
    clearDanglingThinkingState,
  };
}
