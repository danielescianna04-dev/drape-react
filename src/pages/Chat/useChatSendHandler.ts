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
import { config } from '../../config/config';
import { sanitizeAgentText } from '../../shared/utils/sanitizeAgentText';
import { parseUndoData } from './chatUndo';
import { clearInterruptedThinkingItems, updateTabTerminalItem, appendTabTerminalItems } from './chatTabStoreHelpers';
import { buildAgentConversationHistory, ChatHistoryItem } from './chatConversationHistory';
import { persistChatMessagesSnapshotByTabId, persistChatSessionOnSend } from './chatSessionPersistence';
import { formatToolResult, getToolStartMessage, isCommand, isTerminalInput } from './chatToolFormatting';
import {
  buildUserMessage,
  getActiveChatTabId,
  getImagesToSend,
  normalizeImagesForAgent,
  normalizeImagesForStore,
} from './chatSendUtils';
import { executeDetectedToolCalls } from './chatSendToolExecution';
import { streamLegacyAiChat } from './chatStreamingRequest';
import { executeTerminalModeCommand, startAgentModeSend } from './chatSendModeActions';
import { runLegacyAiSend } from './chatLegacyAiAction';
import {
  buildStreamingPlaceholder,
  canSendChatMessage,
  clearStreamingPlaceholderOnError,
} from './chatSendState';
import { useChatSendStateMachine } from './useChatSendStateMachine';
import { tracciaMessaggioChat, tracciaComandoTerminaleChat, tracciaErrore, tracciaErroreRispostaAI } from '../../core/services/analyticsService';

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
  handleSend: (images?: { uri: string; base64?: string; type?: string }[], explicitText?: string) => Promise<void>;
  handleStop: () => void;
  handleRetryTool: (tool: string, input: Record<string, unknown>) => Promise<void>;
  handleSendRef: MutableRefObject<((images?: { uri: string; base64?: string; type?: string }[], explicitText?: string) => Promise<void>) | null>;
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
  const sendState = useChatSendStateMachine();
  const sendStateRef = useRef(sendState);
  sendStateRef.current = sendState;
  const previousAgentStreamingRef = useRef(agentStreaming);

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

  useEffect(() => {
    const wasStreaming = previousAgentStreamingRef.current;
    previousAgentStreamingRef.current = agentStreaming;

    // Agent mode marks the machine as active when the stream starts,
    // but the reset has to happen when the stream actually completes.
    if (!wasStreaming || agentStreaming) return;

    if (sendStateRef.current.isActive) {
      sendState.reset();
    }
  }, [agentStreaming, sendState]);

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

    sendState.markToolsStarted();
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
      sendState.reset();
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
      sendState.markFailed();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sendState actions are stable (useMemo with [])
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
      persistChatMessagesSnapshotByTabId(currentTab.id);
    }
    isProcessingToolsRef.current = false;
    sendState.markStopped();
  }, [stopAgent, currentTab?.id, setLoading, engine, isProcessingToolsRef, clearDanglingThinkingState]);

  // ── handleSend ──────────────────────────────────────────────────────────
  // explicitText overrides the captured `input` state. Used by the welcome-
  // screen auto-create flow which clears the input upfront for instant UX
  // feedback but still needs the original prompt when the deferred send
  // fires after currentWorkstation lands.
  const handleSend = async (
    images?: { uri: string; base64?: string; type?: string }[],
    explicitText?: string,
  ) => {
    const imagesToSend = getImagesToSend(images, selectedInputImages);
    const activeTabId = getActiveChatTabId(currentTab?.id, tab?.id);
    const originTabId = activeTabId ?? currentTab?.id ?? tab?.id;
    const effectiveInput = explicitText ?? input;

    if (!canSendChatMessage({
      input: effectiveInput,
      imageCount: imagesToSend?.length ?? 0,
      isLoading,
    })) {
      return;
    }

    // Guard: reject send if machine is already active (double-send prevention)
    if (sendStateRef.current.isActive) {
      return;
    }

    // Reset tool processing flag for new message
    isProcessingToolsRef.current = false;
    sendState.markSendStarted();

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

    const userMessage = buildUserMessage(effectiveInput, imagesToSend);

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
      if (!activeTabId) return;

      // Reset engine and bridge for new session
      engine.reset();
      prevEngineMessagesRef.current = [];
      engineIdMapRef.current.clear();

      const cleanImagesForStore = normalizeImagesForStore(imagesToSend);
      const agentConversationHistory = buildAgentConversationHistory(currentTab?.terminalItems || []);
      const cleanImages = normalizeImagesForAgent(imagesToSend);
      startAgentModeSend({
        userMessage,
        currentWorkstation,
        currentTab,
        cleanImagesForStore,
        cleanImagesForAgent: cleanImages,
        selectedModel,
        thinkingLevel,
        agentConversationHistory,
        addTerminalItem,
        setInput,
        setSelectedInputImages,
        setLoading,
        setNearBottomState,
        scrollToBottom,
        startAgent,
        preThinkingIdRef,
      });
      tracciaMessaggioChat(selectedModel, 'agent');
      sendState.markStreamStarted();
      return;
    }

    // Terminal mode - auto-detect: command → execute in container, natural language → AI
    if (agentMode === 'terminal' && currentWorkstation?.id && isTerminalInput(userMessage)) {
      tracciaComandoTerminaleChat();
      await executeTerminalModeCommand({
        apiUrl: config.apiUrl,
        currentWorkstation,
        userMessage,
        t,
        addTerminalItem,
        setInput,
        setSelectedInputImages,
        setLoading,
        setNearBottomState,
        scrollToBottom,
      });
      sendState.reset();
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
      addTerminalItem(buildStreamingPlaceholder(streamingMessageId));
      sendState.markStreamStarted();

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
        if (!activeTabId) return;

        // Chat mode - AI response
        // IMPORTANT: Wait before starting XHR to allow React to render "Thinking..." placeholder
        await new Promise(resolve => setTimeout(resolve, 400));
        const legacyResult = await runLegacyAiSend({
          apiUrl: config.apiUrl,
          userMessage,
          selectedModel,
          conversationHistory,
          currentWorkstation,
          thinkingLevel,
          activeTabId,
          streamingMessageId,
          addTerminalItem,
          setLoading,
          setConversationHistory,
          isProcessingToolsRef,
        });
        streamedContent = legacyResult.streamedContent;
        streamingMessageId = legacyResult.streamingMessageId;
        if (isProcessingToolsRef.current) {
          sendState.markToolsStarted();
        }
      }
    } catch (error) {
      tracciaErrore(error instanceof Error ? error.message : 'Unknown error', 'chat');
      tracciaErroreRispostaAI(selectedModel, error instanceof Error ? error.message : 'Unknown error');
      sendState.markFailed();

      if (activeTabId) {
        useTabStore.setState((state) => ({
          tabs: state.tabs.map((t) => (
            t.id === activeTabId
              ? clearStreamingPlaceholderOnError({
                  tab: t,
                  streamingMessageId,
                })
              : t
          )),
        }));
      }

      addTerminalItem({
        id: (Date.now() + 3).toString(),
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: TerminalItemType.ERROR,
        timestamp: new Date(),
      });
    } finally {
      setLoading(false);
      const finalPhase = sendState.getPhase();
      if (finalPhase !== 'error' && finalPhase !== 'stopped') {
        sendState.reset();
      }

      // Save messages to chat after completing the send
      persistChatMessagesSnapshotByTabId(originTabId);
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
