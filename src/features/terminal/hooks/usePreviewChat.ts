import { useState, useEffect, useRef, useMemo } from 'react';
import { LayoutAnimation, TextInput, Keyboard, Platform, Animated } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAgentStream } from '../../../hooks/api/useAgentStream';
import { useChatEngine, type ChatEngineMessage } from '../../../hooks/engine/useChatEngine';
import { useChatStore } from '../../../core/terminal/chatStore';
import { useUIStore } from '../../../core/terminal/uiStore';
import type { AIMessage } from '../components/PreviewAIChat';
import i18next from 'i18next';

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

const MAX_LOCAL_HISTORY_MESSAGES = 200;
const PREVIEW_CONFIRMATION_RE = /^(vai|va bene|ok|okay|procedi|prosegui|continua|fallo|fai tu|yes|yep|go ahead|do it)$/i;
const PREVIEW_CONTEXTUAL_FOLLOW_UP_RE = /^(start|avvia|inizia|parti|comincia|procedi|continua|vai|fallo|fai tu|ok|okay|yes|yep|go ahead|do it|same|uguale|come prima|undo|annulla|ripristina)$/i;

type PreviewSelectedElement = {
  selector: string;
  text: string;
  tag?: string;
  className?: string;
  id?: string;
  innerHTML?: string;
};

type PendingPreviewAction = {
  element: PreviewSelectedElement;
  request: string;
};

type PreviewPromptLanguage = 'it' | 'en';

function buildConversationHistory(messages: AIMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((m) => {
      if (m.type !== 'user' && m.type !== 'text' && m.type !== 'tool_result') return false;
      return String(m.content ?? '').trim().length > 0;
    })
    .map((m) => ({
      role: m.type === 'user' ? 'user' as const : 'assistant' as const,
      content: m.type === 'tool_result'
        ? `[Tool result${m.tool ? `: ${m.tool}` : ''}]\n${String(m.content ?? '').trim()}`
        : String(m.content ?? '').trim(),
    }));
}

function summarizeSelectedElement(element: PreviewSelectedElement): string {
  return `selector="${element.selector}" tag="${element.tag || ''}" class="${element.className || ''}" id="${element.id || ''}" text="${(element.text || '').slice(0, 140)}"`;
}

function detectPreviewPromptLanguage(message: string): PreviewPromptLanguage {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return 'en';

  const italianHints = [
    'ciao', 'come', 'fai', 'fallo', 'rosso', 'uguale', 'prima', 'annulla', 'ripristina',
    'rendi', 'metti', 'cambia', 'porta', 'riporta', 'puoi', 'potresti', 'riesci', 'questo',
    'quello', 'gli', 'altri', 'header', 'titolo', 'bottone'
  ];
  const englishHints = [
    'make', 'this', 'that', 'same', 'start', 'undo', 'restore', 'revert', 'header', 'button',
    'title', 'change', 'set', 'turn', 'bring', 'move', 'keep', 'match', 'render', 'fix',
    'can you', 'could you', 'please', 'floating', 'sticky'
  ];

  const italianScore = italianHints.filter(token => normalized.includes(token)).length;
  const englishScore = englishHints.filter(token => normalized.includes(token)).length;

  return englishScore > italianScore ? 'en' : 'it';
}

function isQuestionLikeMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return false;
  const actionVerbQuestion =
    /^(puoi|potresti|riesci a|mi fai|fai|rendi|cambia|metti|porta|riporta|allinea|sistema|modifica|usa|applica)\b/i.test(normalized);
  if (normalized.includes('?') && !actionVerbQuestion) return true;
  return /^(che cos'?è|cos'?è|what is|who are you|puoi spiegare|spiegami|come funziona|perché)\b/i.test(normalized);
}

function buildSelectedElementPrompt(element: PreviewSelectedElement, userMessage: string): string {
  const elementSummary = summarizeSelectedElement(element);
  const normalized = userMessage.trim();
  const language = detectPreviewPromptLanguage(userMessage);

  if (isQuestionLikeMessage(normalized)) {
    return language === 'it'
      ? [
          'L’utente ha selezionato un elemento nella preview.',
          `Elemento selezionato: ${elementSummary}`,
          `Richiesta: ${normalized}`,
          'Rispondi rispetto a QUESTO elemento selezionato. Se l’utente chiede una modifica, applicala; se sta chiedendo una spiegazione, rispondi in modo utile senza perdere il contesto dell’elemento.',
          'Rispondi in italiano.',
        ].join('\n')
      : [
          'The user selected an element in the preview.',
          `Selected element: ${elementSummary}`,
          `Request: ${normalized}`,
          'Respond about THIS selected element. If the user is asking for a change, apply it; if the user is asking for an explanation, answer helpfully without losing the element context.',
          'Reply in English.',
        ].join('\n');
  }

  return language === 'it'
    ? [
        'L’utente ha selezionato un elemento specifico nella preview e vuole che tu modifichi PROPRIO quello.',
        `Elemento selezionato: ${elementSummary}`,
        `Modifica richiesta: ${normalized}`,
        'Interpreta la richiesta come un’azione da eseguire subito sul codice del progetto.',
        'Non limitarti a descrivere il piano: usa i tool e applica direttamente la modifica.',
        'Se la richiesta è breve o implicita, assumila come modifica visuale/di stile dell’elemento selezionato.',
        'Se il testo è un colore come "red", applicalo in modo sensato all’elemento selezionato (di solito text color, altrimenti background/accento a seconda del tipo di elemento).',
        'Rispondi in italiano.',
      ].join('\n')
    : [
        'The user selected a specific element in the preview and wants you to modify THAT exact element.',
        `Selected element: ${elementSummary}`,
        `Requested change: ${normalized}`,
        'Interpret the request as an action to execute immediately on the project code.',
        'Do not just describe the plan: use tools and apply the change directly.',
        'If the request is short or implicit, treat it as a visual or styling change for the selected element.',
        'If the text is a color like "red", apply it sensibly to the selected element (usually text color, otherwise background or accent depending on the element type).',
        'Reply in English.',
      ].join('\n');
}

function buildConfirmationPrompt(action: PendingPreviewAction): string {
  const language = detectPreviewPromptLanguage(action.request);
  return language === 'it'
    ? [
        'L’utente sta confermando di procedere con una modifica già riferita a un elemento selezionato nella preview.',
        `Elemento selezionato: ${summarizeSelectedElement(action.element)}`,
        `Richiesta già data: ${action.request}`,
        'Procedi ORA con la modifica sul codice usando i tool.',
        'Non fare solo una descrizione o un nuovo piano.',
        'Rispondi in italiano.',
      ].join('\n')
    : [
        'The user is confirming that you should proceed with a change already tied to a selected preview element.',
        `Selected element: ${summarizeSelectedElement(action.element)}`,
        `Previous request: ${action.request}`,
        'Proceed NOW with the code change using tools.',
        'Do not only describe the plan or restate the request.',
        'Reply in English.',
      ].join('\n');
}

function isContextualFollowUpMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return false;
  if (PREVIEW_CONTEXTUAL_FOLLOW_UP_RE.test(normalized)) return true;

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount > 5) return false;

  const hasQuestion = normalized.includes('?');
  if (hasQuestion && !/^(same|uguale|come prima|come gli altri|like the others)\b/i.test(normalized)) {
    return false;
  }

  return /^(make|set|put|use|change|turn|bring|move|keep|match|render|restore|revert|fix|fai|rendi|metti|usa|cambia|porta|riporta|mantieni|allinea|sistema|ripristina|fallo)\b/i.test(normalized);
}

function buildContextualFollowUpPrompt(action: PendingPreviewAction, userMessage: string): string {
  const language = detectPreviewPromptLanguage(userMessage);
  return language === 'it'
    ? [
        'L’utente sta inviando un follow-up breve nella preview chat.',
        `Elemento selezionato o ultimo target attivo: ${summarizeSelectedElement(action.element)}`,
        `Ultima richiesta concreta su questo elemento: ${action.request}`,
        `Nuovo follow-up dell’utente: ${userMessage.trim()}`,
        'Interpreta il nuovo messaggio usando il contesto recente della conversazione, i tool_result già presenti e l’ultima modifica discussa su questo elemento.',
        'Se il follow-up implica di procedere, continuare, rifare, annullare o allineare la modifica, agisci subito con i tool sul codice.',
        'Non trattare questo messaggio come una richiesta standalone priva di contesto.',
        'Rispondi in italiano.',
      ].join('\n')
    : [
        'The user is sending a short follow-up in the preview chat.',
        `Selected element or last active target: ${summarizeSelectedElement(action.element)}`,
        `Last concrete request for this element: ${action.request}`,
        `New user follow-up: ${userMessage.trim()}`,
        'Interpret the new message using the recent conversation context, any existing tool results, and the last change discussed for this element.',
        'If the follow-up means proceed, continue, redo, undo, restore, or align the change, act immediately with tools on the code.',
        'Do not treat this message as a standalone request with no context.',
        'Reply in English.',
      ].join('\n');
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
    eventsVersion: agentEventsVersion,
    reset: resetAgent,
  } = useAgentStream('fast');

  // ── Shared chat engine ──────────────────────────────────────────────────
  const engine = useChatEngine(agentEvents, agentStreaming, agentEventsVersion);

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

  // ── Context window usage estimate ─────────────────────────────────────
  const contextUsage = useMemo(() => {
    let totalChars = 15000; // system prompt estimate
    for (const m of aiMessages) {
      totalChars += String(m.content ?? '').length;
    }
    const windows: Record<string, number> = {
      'claude-4-6-sonnet': 200000, 'claude-4-6-opus': 200000, 'claude-haiku-3.5': 200000,
      'claude-sonnet-4': 200000, 'gemini-3-flash': 1000000, 'gemini-3.1-pro': 1000000,
      'gpt-5-3': 128000, 'llama-3.3-70b': 128000,
    };
    const windowTokens = windows[selectedModel] || 200000;
    const pct = Math.min(100, Math.round((Math.ceil(totalChars / 3.5) / windowTokens) * 100));
    return Math.max(pct, engine.contextUsagePercent);
  }, [aiMessages, selectedModel, engine.contextUsagePercent]);

  // ── Inspect mode ────────────────────────────────────────────────────────
  const [isInspectMode, setIsInspectMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<PreviewSelectedElement | null>(null);
  const pendingPreviewActionRef = useRef<PendingPreviewAction | null>(null);

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

    const hasSelectedElement = !!selectedElement;
    const isConfirmationOnly = PREVIEW_CONFIRMATION_RE.test(userMessage);

    if (selectedElement) {
      prompt = buildSelectedElementPrompt(selectedElement, userMessage);
      if (!isQuestionLikeMessage(userMessage)) {
        pendingPreviewActionRef.current = {
          element: selectedElement,
          request: userMessage,
        };
      }
    } else if (isConfirmationOnly && pendingPreviewActionRef.current) {
      prompt = buildConfirmationPrompt(pendingPreviewActionRef.current);
    } else if (pendingPreviewActionRef.current && isContextualFollowUpMessage(userMessage)) {
      prompt = buildContextualFollowUpPrompt(pendingPreviewActionRef.current, userMessage);
    }

    const newUserMsg: AIMessage = {
      type: 'user',
      content: userMessage,
      selectedElement: selectedElement ? { selector: selectedElement.selector, tag: selectedElement.tag } : undefined,
    };

    // Snapshot current engine messages into history, then add user message
    const currentRunMapped = engine.messages.map(mapEngineToAI);
    const historyBeforeUserMessage = [...history, ...currentRunMapped];
    setHistory(prev => [...prev, ...currentRunMapped, newUserMsg].slice(-MAX_LOCAL_HISTORY_MESSAGES));

    // Build conversation history for the API (exclude current prompt; sent separately)
    const conversationHistory = buildConversationHistory(historyBeforeUserMessage);

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
    if (!hasSelectedElement && !isConfirmationOnly) {
      pendingPreviewActionRef.current = null;
    }

    // Reset engine + agent for new run
    engine.reset();
    resetAgent();
    startAgent(prompt, currentWorkstationId, selectedModel, conversationHistory, [], 'minimal');
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
      update: { type: LayoutAnimation.Types.easeInEaseOut },
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
      duration: 300,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
    Animated.timing(fabContentOpacity, {
      toValue: 0, duration: 150, useNativeDriver: false,
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
      const historyBeforeResponse = [...history, ...currentRunMapped];
      const conversationHistory = buildConversationHistory(historyBeforeResponse);
      setHistory(prev => [...prev, ...currentRunMapped, { type: 'user', content: responseMessage }].slice(-MAX_LOCAL_HISTORY_MESSAGES));

      engine.reset();
      resetAgent();
      startAgent(responseMessage, currentWorkstationId, selectedModel, conversationHistory, [], 'minimal');
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
    contextUsagePercent: contextUsage,
    selectedModel,
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
      border-radius: 12px !important;
    }
    .__inspector-tooltip {
      position: absolute !important;
      background: rgba(30, 30, 40, 0.75) !important;
      -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
      backdrop-filter: blur(20px) saturate(180%) !important;
      color: rgba(255, 255, 255, 0.9) !important;
      padding: 5px 10px !important;
      font-size: 11px !important;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif !important;
      border-radius: 20px !important;
      top: -32px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      white-space: nowrap !important;
      pointer-events: none !important;
      z-index: 9999999 !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1) !important;
      font-weight: 500 !important;
      letter-spacing: -0.2px !important;
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

    overlay.style.borderColor = '#8B7CF6';
    overlay.style.background = 'rgba(139, 124, 246, 0.08)';
    overlay.style.animation = 'none';
    overlay.style.boxShadow = '0 0 0 2px rgba(139, 124, 246, 0.25)';
    tooltip.style.background = 'rgba(139, 124, 246, 0.85)';
    tooltip.style.backdropFilter = 'blur(20px)';
    tooltip.style.webkitBackdropFilter = 'blur(20px)';
    tooltip.textContent = ${JSON.stringify(`✓ ${i18next.t('terminal:preview.elementSelected')}`)};

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
