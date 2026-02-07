import { useState, useEffect, useRef, useMemo } from 'react';
import { LayoutAnimation, TextInput, Keyboard, Platform, Animated } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAgentStream } from '../../../hooks/api/useAgentStream';
import { useChatEngine, type ChatEngineMessage } from '../../../hooks/engine/useChatEngine';
import { useChatStore } from '../../../core/terminal/chatStore';
import { useUIStore } from '../../../core/terminal/uiStore';
import type { AIMessage } from '../components/PreviewAIChat';

// ── Engine → AIMessage mapping ───────────────────────────────────────────────

function mapEngineToAI(m: ChatEngineMessage): AIMessage {
  switch (m.type) {
    case 'thinking':
      return { type: 'thinking', content: m.thinkingContent || m.content, isThinking: m.isThinking };
    case 'tool_start':
      return { type: 'tool_start', content: m.content, tool: m.tool, toolId: m.toolId, filePath: m.filePath, pattern: m.pattern };
    case 'tool_complete':
      return { type: 'tool_result', content: m.content, tool: m.tool, toolId: m.toolId, success: m.toolSuccess, filePath: m.filePath, pattern: m.pattern };
    case 'tool_error':
      return { type: 'tool_result', content: m.content, tool: m.tool, toolId: m.toolId, success: false, filePath: m.filePath, pattern: m.pattern };
    case 'budget_exceeded':
      return { type: 'budget_exceeded', content: m.content };
    case 'error':
      return { type: 'text', content: m.content };
    case 'completion':
    case 'text':
    default:
      return { type: 'text', content: m.content };
  }
}

// ── Hook params ──────────────────────────────────────────────────────────────

interface UsePreviewChatParams {
  currentWorkstationId: string | undefined;
  currentWorkstationName: string | undefined;
  webViewRef: React.RefObject<WebView>;
}

export function usePreviewChat({ currentWorkstationId, currentWorkstationName, webViewRef }: UsePreviewChatParams) {
  const chatHistory = useChatStore((state) => state.chatHistory);
  const selectedModel = useUIStore((state) => state.selectedModel);

  // ── Agent stream ────────────────────────────────────────────────────────
  const {
    start: startAgent,
    stop: stopAgent,
    isRunning: agentStreaming,
    events: agentEvents,
    reset: resetAgent,
  } = useAgentStream('fast');

  // ── Shared chat engine ──────────────────────────────────────────────────
  const engine = useChatEngine(agentEvents, agentStreaming);

  // ── Conversation history (persisted between agent runs) ─────────────────
  const [history, setHistory] = useState<AIMessage[]>([]);
  const [previewChatId, setPreviewChatId] = useState<string | null>(null);

  // ── Combined message list for display ───────────────────────────────────
  const aiMessages = useMemo(() => {
    const currentRun = engine.messages.map(mapEngineToAI);
    return [...history, ...currentRun].filter(msg => {
      // Remove empty thinking items (closed without visible content)
      if (msg.type === 'thinking' && !msg.isThinking && !msg.content?.trim()) return false;
      // Remove empty text items
      if (msg.type === 'text' && !msg.content?.trim()) return false;
      return true;
    });
  }, [history, engine.messages]);

  // ── Inspect mode ────────────────────────────────────────────────────────
  const [isInspectMode, setIsInspectMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{
    selector: string; text: string; tag?: string; className?: string; id?: string; innerHTML?: string;
  } | null>(null);

  // ── FAB state ───────────────────────────────────────────────────────────
  const [message, setMessage] = useState('');
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [isMessagesCollapsed, setIsMessagesCollapsed] = useState(false);
  const [showPastChats, setShowPastChats] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const inputRef = useRef<TextInput>(null);
  const aiScrollViewRef = useRef<any>(null);
  const fabContentOpacity = useRef(new Animated.Value(0)).current;

  // ── Keyboard tracking ───────────────────────────────────────────────────
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0),
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ── Save chat when agent completes ──────────────────────────────────────
  useEffect(() => {
    if (!agentStreaming && agentEvents.length > 0 && previewChatId && aiMessages.length > 0) {
      const messagesToSave = aiMessages.map((msg, index) => ({
        id: `preview-msg-${index}`,
        content: msg.content || '',
        type: msg.type === 'user' ? 'user_message' : 'output',
        timestamp: new Date(),
        toolInfo: msg.tool ? {
          tool: msg.tool,
          input: { filePath: msg.filePath, pattern: msg.pattern },
          status: msg.success !== undefined ? (msg.success ? 'completed' : 'error') : 'running',
        } : undefined,
      }));
      useChatStore.getState().updateChat(previewChatId, { messages: messagesToSave, lastUsed: new Date() });
    }
  }, [agentStreaming, agentEvents.length, previewChatId, aiMessages]);

  // ── Inspect mode actions ────────────────────────────────────────────────
  const clearSelectedElement = () => {
    setSelectedElement(null);
    webViewRef.current?.injectJavaScript(`
      if (window.__clearInspectSelection) { window.__clearInspectSelection(); }
      true;
    `);
  };

  const selectParentElement = () => {
    webViewRef.current?.injectJavaScript(`
      if (window.__selectParentElement) { window.__selectParentElement(); }
      true;
    `);
  };

  const toggleInspectMode = () => {
    const newMode = !isInspectMode;
    setIsInspectMode(newMode);

    if (newMode) {
      webViewRef.current?.injectJavaScript(INSPECT_MODE_JS);
    } else {
      webViewRef.current?.injectJavaScript(`
        if (window.__inspectorCleanup) { window.__inspectorCleanup(); }
        true;
      `);
      clearSelectedElement();
    }
  };

  // ── Send message ────────────────────────────────────────────────────────
  const handleSendMessage = async () => {
    if (!message.trim() && !selectedElement) return;
    if (!currentWorkstationId) return;

    if (isMessagesCollapsed) {
      LayoutAnimation.configureNext({
        duration: 200,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });
      setIsMessagesCollapsed(false);
    }

    const userMessage = message.trim();
    let prompt = userMessage;
    if (selectedElement) {
      prompt = `[Elemento selezionato: <${selectedElement.tag}> class="${selectedElement.className}" id="${selectedElement.id}" text="${selectedElement.text?.slice(0, 100)}"]\n\n${userMessage}`;
    }

    const newUserMsg: AIMessage = {
      type: 'user',
      content: userMessage,
      selectedElement: selectedElement ? { selector: selectedElement.selector, tag: selectedElement.tag } : undefined,
    };

    // Snapshot current engine messages into history, then add user message
    const currentRunMapped = engine.messages.map(mapEngineToAI);
    setHistory(prev => [...prev, ...currentRunMapped, newUserMsg]);

    // Build conversation history for the API
    const allMessages = [...history, ...currentRunMapped, newUserMsg];
    const conversationHistory = allMessages
      .filter(m => m.type === 'user' || m.type === 'text')
      .map(m => ({ role: m.type === 'user' ? 'user' : 'assistant', content: m.content || '' }));

    // Create or update chat in history store
    const isFirstMessage = history.filter(m => m.type === 'user').length === 0;
    let chatId = previewChatId;

    if (isFirstMessage || !chatId) {
      chatId = `preview-${Date.now()}`;
      setPreviewChatId(chatId);
      let title = `${userMessage.slice(0, 35)}`;
      if (userMessage.length > 35) title += '...';
      useChatStore.getState().addChat({
        id: chatId,
        title,
        description: `Preview: ${currentWorkstationName || 'Project'}`,
        createdAt: new Date(),
        lastUsed: new Date(),
        messages: [],
        aiModel: selectedModel,
        repositoryId: currentWorkstationId,
        repositoryName: currentWorkstationName,
      });
    } else {
      useChatStore.getState().updateChatLastUsed(chatId);
    }

    setMessage('');
    clearSelectedElement();
    setIsInspectMode(false);

    // Reset engine + agent for new run
    engine.reset();
    resetAgent();
    startAgent(prompt, currentWorkstationId, 'gemini-3-flash', conversationHistory, [], 'minimal');
  };

  // ── Past chat actions ───────────────────────────────────────────────────
  const loadPastChat = (chat: any) => {
    const restored = (chat.messages || []).map((m: any) => ({
      type: m.type === 'user_message' ? 'user' as const : 'text' as const,
      content: m.content || '',
      tool: m.toolInfo?.tool,
      success: m.toolInfo?.status === 'completed',
      filePath: m.toolInfo?.input?.filePath,
    }));
    setHistory(restored);
    engine.reset();
    setPreviewChatId(chat.id);
    setShowPastChats(false);
    if (isMessagesCollapsed) {
      LayoutAnimation.configureNext({
        duration: 200,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });
      setIsMessagesCollapsed(false);
    }
  };

  const startNewChat = () => {
    setHistory([]);
    engine.reset();
    setPreviewChatId(null);
    setShowPastChats(false);
  };

  // ── FAB expand/collapse ─────────────────────────────────────────────────
  const expandFab = () => {
    LayoutAnimation.configureNext({
      duration: 300,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.spring, springDamping: 0.7 },
    });
    setIsInputExpanded(true);
    fabContentOpacity.setValue(0);
    Animated.timing(fabContentOpacity, {
      toValue: 1, duration: 200, delay: 100, useNativeDriver: false,
    }).start(() => {
      inputRef.current?.focus();
    });
  };

  const collapseFab = () => {
    LayoutAnimation.configureNext({
      duration: 250,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.spring, springDamping: 0.8 },
    });
    Animated.timing(fabContentOpacity, {
      toValue: 0, duration: 100, useNativeDriver: false,
    }).start(() => {
      setIsInputExpanded(false);
    });
  };

  // ── Question answers ────────────────────────────────────────────────────
  const handleQuestionAnswer = (answers: Record<string, string>) => {
    const questions = engine.pendingQuestion || [];
    const responseLines = questions.map((q: any, idx: number) => {
      const answer = answers[`q${idx}`] || '';
      return `${q.question}: ${answer}`;
    }).join('\n');
    const responseMessage = `Ecco le mie risposte:\n${responseLines}`;

    if (currentWorkstationId) {
      // Snapshot + add user message
      const currentRunMapped = engine.messages.map(mapEngineToAI);
      setHistory(prev => [...prev, ...currentRunMapped, { type: 'user', content: responseMessage }]);

      engine.reset();
      resetAgent();
      startAgent(responseMessage, currentWorkstationId, 'gemini-3-flash', [], [], 'minimal');
    }
  };

  return {
    // Agent
    agentStreaming,
    stopAgent,
    // Chat state (derived from engine)
    message, setMessage,
    aiMessages,
    isAiLoading: engine.isLoading,
    setIsAiLoading: (v: boolean) => {}, // no-op, engine manages this
    activeTools: engine.activeTools,
    previewChatId,
    currentTodos: engine.currentTodos,
    pendingQuestion: engine.pendingQuestion,
    chatHistory,
    // Inspect
    isInspectMode,
    selectedElement, setSelectedElement,
    toggleInspectMode,
    clearSelectedElement,
    selectParentElement,
    // FAB
    isInputExpanded,
    isMessagesCollapsed, setIsMessagesCollapsed,
    showPastChats, setShowPastChats,
    keyboardHeight,
    inputRef,
    aiScrollViewRef,
    fabContentOpacity,
    expandFab,
    collapseFab,
    // Actions
    handleSendMessage,
    loadPastChat,
    startNewChat,
    handleQuestionAnswer,
  };
}

// ── Inspect mode JavaScript injection ─────────────────────────────────────────

const INSPECT_MODE_JS = `
(function() {
  if (window.__inspectorEnabled) return;
  window.__inspectorEnabled = true;

  const style = document.createElement('style');
  style.id = '__inspector-style';
  style.textContent = \`
    @keyframes inspectorPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(139, 124, 246, 0.7); }
      50% { box-shadow: 0 0 0 4px rgba(139, 124, 246, 0); }
    }
    .__inspector-overlay {
      position: absolute !important;
      pointer-events: none !important;
      border: 2px solid #8B7CF6 !important;
      background: rgba(139, 124, 246, 0.15) !important;
      z-index: 999999 !important;
      transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1) !important;
      animation: inspectorPulse 2s ease-in-out infinite !important;
      border-radius: 4px !important;
    }
    .__inspector-tooltip {
      position: absolute !important;
      background: linear-gradient(135deg, #8B7CF6 0%, #7C5DFA 100%) !important;
      color: white !important;
      padding: 8px 12px !important;
      font-size: 12px !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      border-radius: 8px !important;
      top: -42px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      white-space: nowrap !important;
      pointer-events: none !important;
      z-index: 9999999 !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
      font-weight: 600 !important;
    }
    .__inspector-tooltip::after {
      content: '' !important;
      position: absolute !important;
      bottom: -6px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      border-left: 6px solid transparent !important;
      border-right: 6px solid transparent !important;
      border-top: 6px solid #7C5DFA !important;
    }
  \`;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = '__inspector-overlay';
  overlay.style.display = 'none';
  document.body.appendChild(overlay);

  const tooltip = document.createElement('div');
  tooltip.className = '__inspector-tooltip';
  overlay.appendChild(tooltip);

  let lastElement = null;

  const updateOverlay = (target) => {
    if (!target || target.classList.contains('__inspector-overlay') ||
        target.classList.contains('__inspector-tooltip')) return;

    const rect = target.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.top = (rect.top + window.scrollY) + 'px';
    overlay.style.left = (rect.left + window.scrollX) + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    const tagName = target.tagName.toLowerCase();
    const classes = target.className ? (typeof target.className === 'string' ? target.className.split(' ').filter(c => c && !c.startsWith('__inspector')).slice(0, 2).join(' ') : '') : '';
    const id = target.id || '';

    let tooltipText = '<' + tagName + '>';
    if (id) tooltipText = '<' + tagName + '#' + id + '>';
    else if (classes) tooltipText = '<' + tagName + '.' + classes.split(' ').join('.') + '>';

    const textContent = target.textContent?.trim().substring(0, 25);
    if (textContent) {
      tooltipText += ' "' + textContent + (target.textContent.length > 25 ? '...' : '') + '"';
    }
    tooltipText += '  ' + Math.round(rect.width) + '×' + Math.round(rect.height);
    tooltip.textContent = tooltipText;
    lastElement = target;
  };

  const handleMouseMove = (e) => { updateOverlay(e.target); };

  const selectElement = () => {
    if (!lastElement) return;
    const tagName = lastElement.tagName.toLowerCase();
    const className = lastElement.className || '';
    const id = lastElement.id || '';
    const text = lastElement.textContent?.substring(0, 50) || '';

    overlay.style.borderColor = '#00D084';
    overlay.style.background = 'rgba(0, 208, 132, 0.2)';
    overlay.style.animation = 'none';
    overlay.style.boxShadow = '0 0 0 3px rgba(0, 208, 132, 0.3)';
    tooltip.style.background = 'linear-gradient(135deg, #00D084 0%, #00B972 100%)';
    tooltip.textContent = '✓ Selected';

    window.ReactNativeWebView?.postMessage(JSON.stringify({
      type: 'ELEMENT_SELECTED',
      element: { tag: tagName, className, id, text, innerHTML: lastElement.innerHTML?.substring(0, 200) }
    }));

    window.__selectedElement = lastElement;

    window.__selectParentElement = () => {
      const parent = window.__selectedElement?.parentElement;
      if (parent && parent !== document.body && parent !== document.documentElement) {
        window.__selectedElement = parent;
        lastElement = parent;
        const rect = parent.getBoundingClientRect();
        overlay.style.top = (rect.top + window.scrollY) + 'px';
        overlay.style.left = (rect.left + window.scrollX) + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
        window.ReactNativeWebView?.postMessage(JSON.stringify({
          type: 'ELEMENT_SELECTED',
          element: {
            tag: parent.tagName.toLowerCase(),
            className: parent.className || '',
            id: parent.id || '',
            text: parent.textContent?.substring(0, 50) || '',
            innerHTML: parent.innerHTML?.substring(0, 200)
          }
        }));
      }
    };

    setTimeout(() => {
      overlay.style.borderColor = 'rgba(59, 130, 246, 0.8)';
      overlay.style.background = 'rgba(59, 130, 246, 0.15)';
      overlay.style.animation = 'inspectorPulse 2s ease-in-out infinite';
      overlay.style.boxShadow = 'none';
      tooltip.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }, 600);

    window.__clearInspectSelection = () => {
      overlay.style.transition = 'opacity 0.3s ease';
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (window.__inspectorCleanup) { window.__inspectorCleanup(); }
      }, 300);
    };
  };

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target) { updateOverlay(target); }
    selectElement();
    return false;
  };

  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);

  window.__inspectorCleanup = () => {
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
    overlay.remove();
    style.remove();
    window.__inspectorEnabled = false;
    delete window.__inspectorCleanup;
    delete window.__clearInspectSelection;
  };
})();
true;
`;
