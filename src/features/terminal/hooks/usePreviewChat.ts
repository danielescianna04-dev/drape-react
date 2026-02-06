import { useState, useEffect, useRef } from 'react';
import { LayoutAnimation, TextInput, Keyboard, Platform, Animated } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAgentStream } from '../../../hooks/api/useAgentStream';
import { useChatStore } from '../../../core/terminal/chatStore';
import { useUIStore } from '../../../core/terminal/uiStore';
import type { AIMessage } from '../components/PreviewAIChat';

interface UsePreviewChatParams {
  currentWorkstationId: string | undefined;
  currentWorkstationName: string | undefined;
  webViewRef: React.RefObject<WebView>;
}

export function usePreviewChat({ currentWorkstationId, currentWorkstationName, webViewRef }: UsePreviewChatParams) {
  const chatHistory = useChatStore((state) => state.chatHistory);
  const selectedModel = useUIStore((state) => state.selectedModel);

  // Agent stream
  const {
    start: startAgent,
    stop: stopAgent,
    isRunning: agentStreaming,
    events: agentEvents,
    reset: resetAgent,
  } = useAgentStream('fast');

  // Chat state
  const [message, setMessage] = useState('');
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [previewChatId, setPreviewChatId] = useState<string | null>(null);
  const [currentTodos, setCurrentTodos] = useState<any[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<any[] | null>(null);

  // Inspect mode
  const [isInspectMode, setIsInspectMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{
    selector: string; text: string; tag?: string; className?: string; id?: string; innerHTML?: string;
  } | null>(null);

  // FAB state
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [isMessagesCollapsed, setIsMessagesCollapsed] = useState(false);
  const [showPastChats, setShowPastChats] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Refs
  const inputRef = useRef<TextInput>(null);
  const aiScrollViewRef = useRef<any>(null);
  const lastProcessedEventIndexRef = useRef<number>(-1);
  const fabContentOpacity = useRef(new Animated.Value(0)).current;

  // Track keyboard height
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height),
    );
    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0),
    );
    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  // Process agent events into aiMessages
  useEffect(() => {
    if (agentEvents.length === 0) return;
    const startIndex = lastProcessedEventIndexRef.current + 1;
    if (startIndex >= agentEvents.length) return;

    for (let i = startIndex; i < agentEvents.length; i++) {
      const event = agentEvents[i];
      const toolId = (event as any).id || `tool-${Date.now()}-${i}`;

      if (event.type === 'tool_start' && event.tool) {
        const input = (event as any).input || {};
        const filePath = input.filePath || input.dirPath || input.path || input.file_path || '';
        const pattern = input.pattern || input.command || input.query || '';
        setActiveTools(prev => [...prev, event.tool!]);
        setAiMessages(prev => [...prev, {
          type: 'tool_start', content: event.tool!, tool: event.tool,
          toolId, filePath, pattern,
        }]);
      }
      else if (event.type === 'tool_input' && event.tool) {
        const input = (event as any).input || {};
        const filePath = input.filePath || input.dirPath || input.path || input.file_path || '';
        const pattern = input.pattern || input.command || input.query || '';
        setActiveTools(prev => prev.includes(event.tool!) ? prev : [...prev, event.tool!]);
        setAiMessages(prev => {
          const updated = [...prev];
          const idx = updated.findIndex(
            m => m.toolId === toolId || ((m.type === 'tool_start') && m.tool === event.tool && !m.success)
          );
          if (idx >= 0) {
            updated[idx] = {
              ...updated[idx], toolId,
              filePath: filePath || updated[idx].filePath,
              pattern: pattern || updated[idx].pattern,
            };
          } else {
            updated.push({ type: 'tool_start', content: event.tool!, tool: event.tool, toolId, filePath, pattern });
          }
          return updated;
        });
      }
      else if (event.type === 'tool_complete' && event.tool) {
        setActiveTools(prev => prev.filter(t => t !== event.tool));
        setAiMessages(prev => {
          const updated = [...prev];
          for (let j = updated.length - 1; j >= 0; j--) {
            if (updated[j].toolId === toolId ||
              ((updated[j].type === 'tool_start' || updated[j].type === 'tool_result') &&
                updated[j].tool === event.tool && !updated[j].success)) {
              updated[j] = { ...updated[j], type: 'tool_result', success: !(event as any).error };
              break;
            }
          }
          return updated;
        });
      }
      else if (event.type === 'tool_error' && event.tool) {
        setActiveTools(prev => prev.filter(t => t !== event.tool));
        setAiMessages(prev => {
          const updated = [...prev];
          for (let j = updated.length - 1; j >= 0; j--) {
            if (updated[j].toolId === toolId ||
              ((updated[j].type === 'tool_start') && updated[j].tool === event.tool && !updated[j].success)) {
              updated[j] = { ...updated[j], type: 'tool_result', success: false };
              break;
            }
          }
          return updated;
        });
      }
      else if (event.type === 'thinking_start') {
        setAiMessages(prev => [...prev, { type: 'thinking', content: '', isThinking: true }]);
      }
      else if (event.type === 'thinking') {
        const thinkingText = (event as any).text;
        if (thinkingText) {
          setAiMessages(prev => {
            const updated = [...prev];
            for (let j = updated.length - 1; j >= 0; j--) {
              if (updated[j].type === 'thinking' && updated[j].isThinking) {
                updated[j] = { ...updated[j], content: (updated[j].content || '') + thinkingText };
                break;
              }
            }
            return updated;
          });
        }
      }
      else if (event.type === 'thinking_end') {
        setAiMessages(prev => {
          const updated = [...prev];
          for (let j = updated.length - 1; j >= 0; j--) {
            if (updated[j].type === 'thinking' && updated[j].isThinking) {
              updated[j] = { ...updated[j], isThinking: false };
              break;
            }
          }
          return updated;
        });
      }
      else if (event.type === 'iteration_start') {
        // no-op
      }
      else if (event.type === 'budget_exceeded') {
        setIsAiLoading(false);
        setAiMessages(prev => [...prev, { type: 'budget_exceeded', content: 'Budget AI esaurito' }]);
      }
      else if (event.type === 'text_delta') {
        const delta = (event as any).text;
        if (delta) {
          setAiMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.type === 'text') {
              const updated = [...prev];
              updated[updated.length - 1] = { ...last, content: (last.content || '') + delta };
              return updated;
            }
            return [...prev, { type: 'text', content: delta }];
          });
        }
      }
      else if (event.type === 'message' || event.type === 'response') {
        const msg = (event as any).content || (event as any).message || (event as any).text || (event as any).output;
        if (msg) {
          setAiMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.type === 'text' && last.content === msg) return prev;
            return [...prev, { type: 'text', content: msg }];
          });
        }
      }
      else if (event.type === 'complete' || event.type === 'done') {
        setIsAiLoading(false);
        setActiveTools([]);
        setAiMessages(prev => prev.map(msg =>
          msg.type === 'thinking' && msg.isThinking ? { ...msg, isThinking: false } : msg
        ));
      }
      else if (event.type === 'error' || event.type === 'fatal_error') {
        setIsAiLoading(false);
        setActiveTools([]);
        const errorMsg = (event as any).error || (event as any).message || 'Error';
        setAiMessages(prev => [...prev, { type: 'text', content: `❌ ${errorMsg}` }]);
      }
    }
    lastProcessedEventIndexRef.current = agentEvents.length - 1;
  }, [agentEvents]);

  // Extract todos and questions from agent events
  useEffect(() => {
    if (!agentEvents || agentEvents.length === 0) return;
    const todoEvents = agentEvents.filter((e: any) => e.type === 'todo_update');
    if (todoEvents.length > 0) {
      setCurrentTodos((todoEvents[todoEvents.length - 1] as any).todos || []);
    }
    const questionEvents = agentEvents.filter((e: any) => e.type === 'ask_user_question');
    if (questionEvents.length > 0) {
      setPendingQuestion((questionEvents[questionEvents.length - 1] as any).questions || null);
    }
  }, [agentEvents]);

  // Clear todos when agent completes
  useEffect(() => {
    if (!agentStreaming && agentEvents.length > 0) {
      if (agentEvents.some(e => e.type === 'complete' || e.type === 'done')) {
        setCurrentTodos([]);
      }
    }
  }, [agentStreaming, agentEvents]);

  // Save chat messages when agent completes
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

  // Clear selected element
  const clearSelectedElement = () => {
    setSelectedElement(null);
    webViewRef.current?.injectJavaScript(`
      if (window.__clearInspectSelection) { window.__clearInspectSelection(); }
      true;
    `);
  };

  // Select parent element
  const selectParentElement = () => {
    webViewRef.current?.injectJavaScript(`
      if (window.__selectParentElement) { window.__selectParentElement(); }
      true;
    `);
  };

  // Toggle inspect mode
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

  // Send message
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

    setAiResponse('');
    setIsAiLoading(true);

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
    setAiMessages(prev => [...prev, newUserMsg]);

    // Create or update chat in history
    const isFirstMessage = aiMessages.filter(m => m.type === 'user').length === 0;
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

    const conversationHistory = aiMessages
      .filter(m => m.type === 'user' || m.type === 'text')
      .map(m => ({ role: m.type === 'user' ? 'user' : 'assistant', content: m.content || '' }));

    setMessage('');
    clearSelectedElement();
    setIsInspectMode(false);

    resetAgent();
    lastProcessedEventIndexRef.current = -1;
    startAgent(prompt, currentWorkstationId, 'gemini-3-flash', conversationHistory, [], 'minimal');
  };

  // Load past chat
  const loadPastChat = (chat: any) => {
    const restored = (chat.messages || []).map((m: any) => ({
      type: m.type === 'user_message' ? 'user' as const : 'text' as const,
      content: m.content || '',
      tool: m.toolInfo?.tool,
      success: m.toolInfo?.status === 'completed',
      filePath: m.toolInfo?.input?.filePath,
    }));
    setAiMessages(restored);
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
    setAiMessages([]);
    setPreviewChatId(null);
    setAiResponse('');
    setShowPastChats(false);
  };

  // FAB expand/collapse
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

  // Handle question answers
  const handleQuestionAnswer = (answers: Record<string, string>) => {
    const questions = pendingQuestion || [];
    const responseLines = questions.map((q: any, idx: number) => {
      const answer = answers[`q${idx}`] || '';
      return `${q.question}: ${answer}`;
    }).join('\n');
    const responseMessage = `Ecco le mie risposte:\n${responseLines}`;
    setPendingQuestion(null);

    if (currentWorkstationId) {
      lastProcessedEventIndexRef.current = -1;
      resetAgent();
      setAiMessages(prev => [...prev, { type: 'user', content: responseMessage }]);
      startAgent(responseMessage, currentWorkstationId, 'gemini-3-flash', [], [], 'minimal');
    }
  };

  return {
    // Agent
    agentStreaming,
    stopAgent,
    // Chat state
    message, setMessage,
    aiMessages, setAiMessages,
    isAiLoading, setIsAiLoading,
    activeTools,
    previewChatId,
    currentTodos,
    pendingQuestion,
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

// Inspect mode JavaScript injection (extracted for readability)
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
