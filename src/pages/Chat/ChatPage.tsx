import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Keyboard, Dimensions, Modal, ActionSheetIOS, Alert, ActivityIndicator, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withDelay, withRepeat, interpolate, Extrapolate, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../core/terminal/chatStore';
import { persistChatMessagesSnapshotByTabId } from './chatSessionPersistence';
import { useWorkstationStore } from '../../core/terminal/workstationStore';
import { useUIStore } from '../../core/terminal/uiStore';
import { TerminalItemType, TerminalItem } from '../../shared/types';
import { AppColors } from '../../shared/theme/colors';
import { githubService } from '../../core/github/githubService';
import { useTabStore, Tab } from '../../core/tabs/tabStore';
import { workstationService } from '../../core/workstation/workstationService';
import { getAuthToken } from '../../core/api/getAuthToken';
import { config } from '../../config/config';
import { tracciaModelloSelezionato, tracciaImmagineCaricata, tracciaModalitaChatCambiata, tracciaPaginaPianiVista } from '../../core/services/analyticsService';
import { useAuthStore } from '../../core/auth/authStore';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSidebarOffset } from '../../features/terminal/context/SidebarContext';
import { useChatState } from '../../hooks/business/useChatState';
import { useFileHistoryStore } from '../../core/history/fileHistoryStore';
import { useAgentStream, AgentToolEvent } from '../../hooks/api/useAgentStream';
import { useChatEngine } from '../../hooks/engine/useChatEngine';
import { useAgentStore } from '../../core/agent/agentStore';
import { useFileCacheStore } from '../../core/cache/fileCacheStore';
import { useNavigationStore } from '../../core/navigation/navigationStore';
import { WorkspaceTabContent } from './WorkspaceTabContent';
import { ChatMessageList } from './ChatMessageList';
import { ChatComposerArea } from './ChatComposerArea';
import { ChatToolsSheet } from './ChatToolsSheet';
import { useChatBudget } from './useChatBudget';
import { useChatInputGlass } from './useChatInputGlass';
import { useChatMediaTools } from './useChatMediaTools';
import { useChatModelSelector } from './useChatModelSelector';
import { useChatScrollManager } from './useChatScrollManager';
import { useChatSendHandler } from './useChatSendHandler';
import { useChatEngineBridge } from './useChatEngineBridge';
import { clearInterruptedThinkingItems } from './chatTabStoreHelpers';
import { getProcessedTerminalItems } from './chatTerminalItems';
import { estimateContextUsage, isCommand, isTerminalInput, ACTIVITY_PREFIX, encodeActivityCard } from './chatToolFormatting';
// WebSocket log service disabled - was causing connect/disconnect loop
// import { websocketLogService, BackendLog } from '../../core/services/websocketLogService';

const colors = AppColors.dark;
const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

interface ChatPageProps {
  tab?: Tab;
  isCardMode: boolean;
  cardDimensions: { width: number; height: number; };
  animatedStyle?: Record<string, unknown>;
}

const DelayedMount = ({ delay, children }: { delay: number; children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) {
      setMounted(true);
      return;
    }

    setMounted(false);
    const timer = setTimeout(() => {
      setMounted(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  if (!mounted) return null;
  return <>{children}</>;
};

const getToolIcon = (toolName: string): string => {
  const name = toolName.toLowerCase();
  if (name.includes('read')) return 'document-text-outline';
  if (name.includes('write')) return 'document-attach-outline';
  if (name.includes('edit') || name.includes('patch')) return 'create-outline';
  if (name.includes('delete') || name.includes('remove')) return 'trash-outline';
  if (name.includes('command') || name.includes('bash') || name.includes('run')) return 'terminal-outline';
  if (name.includes('search') || name.includes('find') || name.includes('glob')) return 'search-outline';
  if (name.includes('web') || name.includes('fetch')) return 'globe-outline';
  if (name.includes('agent') || name.includes('task')) return 'people-outline';
  return 'cog-outline';
};

const getFriendlyToolName = (toolName: string): string => {
  if (toolName === 'read_file' || toolName === 'read') return 'Lettura file';
  if (toolName === 'write_file' || toolName === 'write') return 'Creazione file';
  if (toolName === 'edit_file' || toolName === 'edit' || toolName === 'multi_edit_file' || toolName === 'multiedit' || toolName === 'patch_file') return 'Modifica codice';
  if (toolName === 'delete_file') return 'Eliminazione file';
  if (toolName === 'move_file') return 'Spostamento file';
  if (toolName === 'create_folder') return 'Creazione cartella';
  if (toolName === 'list_directory' || toolName === 'list_files' || toolName === 'list') return 'Esplorazione cartella';
  if (toolName === 'glob_files' || toolName === 'glob_search' || toolName === 'glob') return 'Ricerca file';
  if (toolName === 'search_in_files' || toolName === 'grep_search' || toolName === 'grep' || toolName === 'code_search') return 'Ricerca testuale';
  if (toolName === 'run_command' || toolName === 'execute_command' || toolName === 'bash') return 'Comando terminale';
  if (toolName === 'web_fetch') return 'Lettura pagina web';
  if (toolName === 'web_search') return 'Ricerca su internet';
  if (toolName === 'diagnostics') return 'Scansione errori';
  if (toolName === 'load_skill' || toolName === 'skill') return 'Caricamento abilità';
  if (toolName === 'dispatch_agent' || toolName === 'task' || toolName === 'sub_agent' || toolName === 'launch_sub_agent') return 'Sotto-assistente';
  if (toolName === 'lsp') return 'Analisi semantica';
  if (toolName === 'ask_user_question' || toolName === 'user_question') return 'Richiesta conferma';
  return toolName;
};

const ChatPage = ({ tab, isCardMode, cardDimensions, animatedStyle }: ChatPageProps) => {
  const { t } = useTranslation('chat');
  const thinkingLevelLabels = useMemo<Record<string, string>>(() => ({
    none: t('terminal:chat.reasoningLevels.off'),
    minimal: t('terminal:chat.reasoningLevels.minimal'),
    low: t('terminal:chat.reasoningLevels.low'),
    medium: t('terminal:chat.reasoningLevels.medium'),
    high: t('terminal:chat.reasoningLevels.high'),
  }), [t]);
  const debugEffectCountsRef = useRef<Record<string, number>>({});
  const logChatDebug = useCallback((name: string, payload?: Record<string, unknown>) => {
    const nextCount = (debugEffectCountsRef.current[name] || 0) + 1;
    debugEffectCountsRef.current[name] = nextCount;
    if (nextCount <= 25) {
      console.log('[ChatDebug]', name, { count: nextCount, ...payload });
    }
  }, []);
  // Use custom hooks for state management and UI concerns
  const chatState = useChatState(isCardMode);
  const insets = useSafeAreaInsets();
  const { sidebarTranslateX, hideSidebar, showSidebar, setForceHideToggle } = useSidebarOffset();
  const {
    scrollViewRef,
    contentHeightRef,
    layoutHeightRef,
    isNearBottomRef,
    scrollLockUntilRef,
    isUserScrollActiveRef,
    showScrollToBottom,
    setNearBottomState,
    scrollToBottom,
  } = useChatScrollManager();

  // Destructure chat state for easier access
  const {
    input,
    setInput,
    isTerminalMode,
    setIsTerminalMode,
    forcedMode,
    setForcedMode,
    selectedModel,
    setSelectedModel,
    thinkingLevel,
    setThinkingLevel,
    conversationHistory,
    setConversationHistory,
    scrollPaddingBottom,
    setScrollPaddingBottom,
    isProcessingToolsRef,
    tabInputsRef,
    previousTabIdRef,
    previousInputRef,
    widgetHeight,
    scaleAnim,
    inputPositionAnim,
    borderAnim,
    hasChatStartedAnim,
    cardModeAnim,
    keyboardHeight,
  } = chatState;

  // Agent state - 2-mode system (Fast or Terminal)
  const [agentMode, setAgentMode] = useState<'fast' | 'terminal'>('fast');
  const [isAgentDetailsVisible, setIsAgentDetailsVisible] = useState(false);
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);
  const [isInputbarTodoCollapsed, setIsInputbarTodoCollapsed] = useState(false);
  const [isInputbarTodoDismissed, setIsInputbarTodoDismissed] = useState(false);

  // User plan state for upgrade CTA
  const { user } = useAuthStore();
  const isPaidUser = ['go', 'pro', 'team'].includes(user?.plan || '');
  const navigateTo = useNavigationStore((state) => state.navigateTo);
  const {
    start: startAgent,
    stop: stopAgent,
    isRunning: agentStreaming,
    events: agentEvents,
    eventsVersion: agentEventsVersion,
    currentTool: agentCurrentTool,
  } = useAgentStream('fast');
  // const [activeAgentProgressId, setActiveAgentProgressId] = useState<string | null>(null); // REMOVED

  // Liquid Glass Shimmer Animation - flows across the button
  const shimmerX = useSharedValue(-150);
  const inputRevealAnim = useSharedValue(0);
  // Need activeTabId BEFORE the glass useEffect so the dependency array works
  const activeTabId = useTabStore((state) => state.activeTabId);
  const isSidebarOpen = useUIStore((state) => state.isSidebarOpen);
  const chatWelcomeVisible = false; // ChatWelcomeOverlay removed — SpotlightOverlay handles onboarding
  const isActiveTab = (tab?.id ?? activeTabId) === activeTabId;

  useEffect(() => {
    shimmerX.value = withRepeat(
      withTiming(150, { duration: 3000, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
      -1,
      false
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }, { skewX: '-20deg' }] as { translateX: number }[],
  }));

  const { budgetInfo } = useChatBudget(user?.uid, isPaidUser, agentStreaming);

  // ── Engine: shared event processing ──────────────────────────────
  const engine = useChatEngine(agentEvents, agentStreaming, agentEventsVersion);

  // Sub-agent state (not handled by engine)
  const [currentSubAgent, setCurrentSubAgent] = useState<{
    id: string;
    type: string;
    description: string;
    iteration: number;
    maxIterations: number;
    status: string;
  } | null>(null);

  // Agent store - use specific selectors to prevent unnecessary re-renders
  const agentIteration = useAgentStore((state) => state.iteration);
  const agentCurrentPrompt = useAgentStore((state) => state.currentPrompt);
  const agentFilesCreated = useAgentStore((state) => state.filesCreated);
  const agentFilesModified = useAgentStore((state) => state.filesModified);

  // Usa selettori specifici per evitare re-render su ogni cambio di store
  const tabs = useTabStore((state) => state.tabs);
  // activeTabId is declared earlier (before glass useEffect)
  const updateTab = useTabStore((state) => state.updateTab);
  const addTerminalItemToStore = useTabStore((state) => state.addTerminalItem);
  const removeTerminalItemById = useTabStore((state) => state.removeTerminalItemById);
  const updateTerminalItemById = useTabStore((state) => state.updateTerminalItemById);

  const {
    showModelSelector,
    showContextInfo,
    setShowContextInfo,
    dropdownAnimatedStyle,
    toggleModelSelector,
    closeDropdown,
    currentModelName,
  } = useChatModelSelector(selectedModel, setSelectedModel);

  // Memoize currentTab to prevent infinite re-renders
  const currentTab = useMemo(() => {
    return tab || tabs.find(t => t.id === activeTabId);
  }, [tab, tabs, activeTabId]);
  const isCreationFlow = currentTab?.data?.creationFlow === true;

  // Always use tab-specific terminal items
  const tabTerminalItems = useMemo(() => currentTab?.terminalItems || [], [currentTab?.terminalItems]);
  const isLoading = currentTab?.isLoading || false;
  const hasChatStarted = tabTerminalItems.length > 0;



  // Custom input handler that saves to ref immediately (no extra re-renders)
  const handleInputChange = useCallback((text: string) => {
    previousInputRef.current = text;
    setInput(text);
    // Save to ref immediately - this won't trigger re-renders
    if (currentTab?.id) {
      tabInputsRef.current[currentTab.id] = text;
    }
    // Auto-switch toggle based on input content
    if (text.trim().length > 0 && isTerminalInput(text)) {
      if (agentMode !== 'terminal') setAgentMode('terminal');
    } else {
      if (agentMode !== 'fast') setAgentMode('fast');
    }
  }, [currentTab?.id, agentMode]);

  // Load input when tab changes (ONLY depends on tab ID)
  useEffect(() => {
    if (!currentTab?.id) return;

    // Only act if tab has actually changed
    if (previousTabIdRef.current !== currentTab.id) {
      logChatDebug('tab_change_effect', {
        tabId: currentTab.id,
        previousTabId: previousTabIdRef.current ?? null,
      });
      // Load input for new tab
      const savedInput = tabInputsRef.current[currentTab.id] || '';
      setInput(savedInput);

      // Reset scroll padding when switching tabs to prevent content displacement
      // The keyboard listener will re-apply padding if keyboard is still open
      setScrollPaddingBottom(300);

      // Scroll to bottom of new tab after a brief delay
      setNearBottomState(true);
      setTimeout(() => scrollToBottom(false), 100);

      // Update previous tab reference
      previousTabIdRef.current = currentTab.id;
    }
  }, [currentTab?.id, logChatDebug]); // ONLY depend on tab ID - NOT on input!

  // Use specific selectors from focused stores to minimize re-renders
  const hasInteracted = useUIStore((state) => state.hasInteracted);
  const setGitHubUser = useWorkstationStore((state) => state.setGitHubUser);
  const setGitHubRepositories = useWorkstationStore((state) => state.setGitHubRepositories);
  const currentWorkstation = useWorkstationStore((state) => state.currentWorkstation);
  const setWorkstationGlobal = useWorkstationStore((state) => state.setWorkstation);
  const [pendingFirstPrompt, setPendingFirstPrompt] = useState<string | null>(null);
  const [creatingProjectFromPrompt, setCreatingProjectFromPrompt] = useState(false);

  const cleanupTempAutoCreateItems = useCallback((tabId: string) => {
    removeTerminalItemById(tabId, 'temp-auto-create-user');
    removeTerminalItemById(tabId, 'temp-auto-create-bootstrap');
    removeTerminalItemById(tabId, 'temp-auto-create-thinking');
  }, [removeTerminalItemById]);

  // Reset project creation state on tab change.
  // NOTE: we deliberately don't cleanup the temp user bubble on workstation
  // change here — it must survive the workstation switch fired by
  // handleSendWithAutoProject so the chat looks continuous (no flash).
  // It gets dropped naturally when the real engine-driven user message
  // arrives, OR via the explicit tab change branch below.
  useEffect(() => {
    setCreatingProjectFromPrompt(false);
    if (currentTab?.id) {
      cleanupTempAutoCreateItems(currentTab.id);
    }
  }, [currentTab?.id, cleanupTempAutoCreateItems]);

  // Hydrate the active tab's terminalItems from chatHistory when the user
  // switches to a project that already has a saved conversation. Without
  // this, navigating back to an existing project shows the empty welcome
  // screen even though the agent's chat is persisted in useChatStore.
  // Persisted messages are 1:1 copies of terminalItems (see
  // persistChatMessagesSnapshotByTabId), so we can drop them in as-is.
  useEffect(() => {
    if (!currentTab?.id || !currentWorkstation?.id) return;
    if ((currentTab.terminalItems?.length ?? 0) > 0) return;
    const chats = useChatStore.getState().chatHistory
      .filter((c) => c.repositoryId === currentWorkstation.id && (c.messages?.length ?? 0) > 0)
      .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime());
    const latest = chats[0];
    if (!latest) return;
    updateTab(currentTab.id, {
      terminalItems: latest.messages as any,
      data: { ...currentTab.data, chatId: latest.id },
    });
  }, [currentWorkstation?.id, currentTab?.id]); // intentionally narrow deps — fire only on project/tab switch

  const [homeMenuVisible, setHomeMenuVisible] = useState(false);
  const [homeMenuView, setHomeMenuView] = useState<'root' | 'attach'>('root');
  const inputMountDelay = hasChatStarted ? 0 : 300;
  const inputGlassRevealDelay = hasChatStarted ? 0 : inputMountDelay + 140;
  const inputMountKey = `${currentWorkstation?.id ?? 'none'}:${currentTab?.id ?? 'none'}`;
  const {
    inputBarGlassId,
    glassApplied,
    applyInputGlass,
  } = useChatInputGlass({
    tabId: tab?.id,
    activeTabId,
    isActiveTab,
    hasChatStarted,
    inputGlassRevealDelay,
    chatWelcomeVisible,
  });
  const {
    showToolsSheet,
    recentPhotos,
    selectedPhotoIds,
    selectedInputImages,
    setSelectedPhotoIds,
    setSelectedInputImages,
    toggleToolsSheet,
    pickImageFromLibrary,
    sendSelectedPhotos,
    toolsSheetStyle,
    toolsBackdropStyle,
  } = useChatMediaTools({
    screenHeight: SCREEN_HEIGHT,
    sidebarTranslateX,
    inputBarGlassId,
    hideSidebar,
    showSidebar,
    setForceHideToggle,
    applyInputGlass,
    onTrackImageUpload: tracciaImmagineCaricata,
    labels: {
      galleryPermissionTitle: t('common:galleryPermissionTitle'),
      galleryPermissionRequired: t('common:galleryPermissionRequired'),
      cancel: t('common:cancel'),
      openSettings: t('common:openSettings'),
      maxImagesTitle: t('composer.maxImagesTitle'),
      maxImagesMessage: t('composer.maxImagesMessage'),
      maxImagesPartialMessage: (count) => t('composer.maxImagesPartialMessage', { count }),
    },
  });

  const showAttachActionSheet = useCallback(() => {
    const labelsList = ['Annulla', 'Libreria foto', 'Scatta una foto o registra un video', 'Scegli file'];
    const handle = async (idx: number) => {
      if (idx === 1) {
        pickImageFromLibrary();
      } else if (idx === 2) {
        const cam = await ImagePicker.requestCameraPermissionsAsync();
        if (cam.status !== 'granted') return;
        const res = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8, base64: true });
        if (!res.canceled && res.assets?.[0]) {
          const a = res.assets[0];
          setSelectedInputImages((prev) => [...prev, { uri: a.uri, base64: a.base64 ?? '', type: a.mimeType ?? 'image/jpeg' }].slice(0, 4));
        }
      } else if (idx === 3) {
        const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
        if (!res.canceled && res.assets?.[0]) {
          const a = res.assets[0];
          setSelectedInputImages((prev) => [...prev, { uri: a.uri, base64: '', type: a.mimeType ?? 'application/octet-stream' }].slice(0, 4));
        }
      }
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: labelsList, cancelButtonIndex: 0 },
        (i) => handle(i),
      );
    } else {
      Alert.alert('Attach', undefined, [
        { text: labelsList[0], style: 'cancel' },
        { text: labelsList[1], onPress: () => handle(1) },
        { text: labelsList[2], onPress: () => handle(2) },
        { text: labelsList[3], onPress: () => handle(3) },
      ]);
    }
  }, [pickImageFromLibrary, setSelectedInputImages]);

  // Use tabTerminalItems directly (already memoized above)
  const terminalItems = tabTerminalItems;
  const hasUserMessaged = terminalItems.some(item => item.type === TerminalItemType.USER_MESSAGE);

  useLayoutEffect(() => {
    logChatDebug('input_reveal_layout_effect', {
      workstationId: currentWorkstation?.id ?? null,
      tabId: currentTab?.id ?? null,
      hasChatStarted,
    });
    if (hasChatStarted) {
      inputRevealAnim.value = 1;
      return;
    }

    inputRevealAnim.value = 0;
  }, [currentWorkstation?.id, currentTab?.id, hasChatStarted, logChatDebug]);

  useEffect(() => {
    logChatDebug('input_reveal_effect', {
      workstationId: currentWorkstation?.id ?? null,
      tabId: currentTab?.id ?? null,
      hasChatStarted,
      inputMountDelay,
    });
    if (hasChatStarted) {
      inputRevealAnim.value = 1;
      return;
    }

    inputRevealAnim.value = withDelay(
      inputMountDelay,
      withTiming(1, {
        duration: 320,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, [currentWorkstation?.id, currentTab?.id, hasChatStarted, inputMountDelay, logChatDebug]);

  // Always add item to tab-specific storage
  const addTerminalItem = useCallback((item: Partial<TerminalItem> & { id: string; content: string }) => {
    if (!currentTab) return;

    // Use atomic function from store to avoid race conditions
    addTerminalItemToStore(currentTab.id, item);
  }, [currentTab, addTerminalItemToStore]);

  const autoCreationLaunchRef = useRef<string | null>(null);
  const creationCompleteHandledRef = useRef<string | null>(null);

  useEffect(() => {
    const autoStart = currentTab?.data?.autoStartAgent;
    if (!isActiveTab || !currentTab?.id || !currentWorkstation?.id || !autoStart) return;
    if (autoStart.kind !== 'project_creation' || !autoStart.prompt) return;
    if (agentStreaming) return;

    const requestId = String(autoStart.requestId || `${currentTab.id}:${currentWorkstation.id}`);
    if (autoCreationLaunchRef.current === requestId) return;
    autoCreationLaunchRef.current = requestId;

    const chatId = String(currentTab.data?.chatId || `create-${currentWorkstation.id}`);
    const displayPrompt = String(autoStart.displayPrompt || autoStart.prompt).trim();
    const initialUserMessage = displayPrompt || `Crea la prima versione di ${currentWorkstation.name || 'questo progetto'}.`;
    const creationChatTitle = currentWorkstation.name || currentTab.title || 'Nuovo progetto';

    if (autoStart.model && autoStart.model !== selectedModel) {
      setSelectedModel(autoStart.model);
    }

    const existingChat = useChatStore.getState().chatHistory.find((chat) => chat.id === chatId);
    if (!existingChat) {
      const chatSession = {
        id: chatId,
        title: creationChatTitle,
        description: initialUserMessage.slice(0, 100),
        createdAt: new Date(),
        lastUsed: new Date(),
        messages: [],
        aiModel: autoStart.model || selectedModel,
        repositoryId: currentWorkstation.id,
        repositoryName: currentWorkstation.name,
      };
      useChatStore.getState().addChat(chatSession);
    } else {
      useChatStore.getState().updateChat(chatId, {
        title: existingChat.title || creationChatTitle,
        description: existingChat.description || initialUserMessage.slice(0, 100),
        lastUsed: new Date(),
        repositoryId: existingChat.repositoryId || currentWorkstation.id,
        repositoryName: existingChat.repositoryName || currentWorkstation.name,
      });
    }

    useChatStore.getState().setCurrentChat(
      useChatStore.getState().chatHistory.find((chat) => chat.id === chatId) || null,
    );

    addTerminalItem({
      id: `auto-create-user-${requestId}`,
      content: initialUserMessage,
      type: TerminalItemType.USER_MESSAGE,
      timestamp: new Date(),
    });

    addTerminalItem({
      id: `auto-create-assistant-${requestId}`,
      content: `Perfetto, creo la prima versione di ${creationChatTitle}. Ti faccio vedere file, modifiche, preview e verify direttamente qui in chat.`,
      type: TerminalItemType.OUTPUT,
      timestamp: new Date(),
    });

    startAgent(
      autoStart.prompt,
      currentWorkstation.id,
      autoStart.model || selectedModel,
      [],
      [],
      autoStart.thinkingLevel || thinkingLevel,
      undefined,
      {
        endpointPath: '/agent/create',
        bodyExtras: {
          projectName: autoStart.projectName || currentWorkstation.name,
          mode: autoStart.mode || 'fast',
        },
      },
    );

    updateTab(currentTab.id, {
      title: creationChatTitle,
        data: {
          ...currentTab.data,
          creationFlow: true,
          autoStartAgent: null,
          projectId: currentWorkstation.projectId || currentWorkstation.id,
        },
    });
  }, [
    currentTab?.id,
    currentTab?.data,
    currentWorkstation?.id,
    currentWorkstation?.name,
    currentWorkstation?.projectId,
    isActiveTab,
    agentStreaming,
    selectedModel,
    setSelectedModel,
    thinkingLevel,
    startAgent,
    updateTab,
    addTerminalItem,
  ]);

  useEffect(() => {
    if (!currentTab?.id) return;
    const latestComplete = [...agentEvents].reverse().find((event) => event.type === 'complete') as (AgentToolEvent & { result?: { success?: boolean; projectId?: string; verificationFailed?: boolean } }) | undefined;
    if (!latestComplete) return;

    const success = latestComplete.result?.success === true;
    const isProjectCreationCompletion = String(latestComplete.message || '').toLowerCase().includes('project created');
    const completionKey = `${currentTab.id}:${latestComplete.id}`;
    if (!success || !isProjectCreationCompletion || creationCompleteHandledRef.current === completionKey) return;
    creationCompleteHandledRef.current = completionKey;

    addTerminalItem({
      id: `preview-ready-${Date.now()}`,
      content: '__PREVIEW_READY__',
      type: TerminalItemType.SYSTEM,
      timestamp: new Date(),
    });
  }, [agentEventsVersion, currentTab?.id, addTerminalItem]);

  // ── Send handler hook (handleSend, handleStop, handleRetryTool, undo tracking, pending message) ──
  const {
    handleSend,
    handleStop,
    handleRetryTool,
    handleSendRef,
    preThinkingIdRef,
    engineIdMapRef,
    prevEngineMessagesRef,
    clearDanglingThinkingState,
  } = useChatSendHandler({
    tab,
    currentTab,
    currentWorkstation,
    engine,
    input,
    // Wrap setInput so programmatic clears (after send) also wipe the
    // per-tab ref. Without this, tabInputsRef.current[tabId] keeps the
    // sent prompt and the tab-change effect (or any future read of the
    // ref) re-populates the input field — which is the bug where the
    // user sees their prompt sitting in the input while the AI is
    // already streaming the response.
    setInput: (value: string) => {
      setInput(value);
      const tabId = currentTab?.id;
      if (tabId) tabInputsRef.current[tabId] = value;
    },
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
  });

  // ── Engine bridge: sync engine.messages → tabStore terminal items ──
  useChatEngineBridge({
    tabId: currentTab?.id,
    engineMessages: engine.messages,
    preThinkingIdRef,
    engineIdMapRef,
    prevEngineMessagesRef,
    addTerminalItem,
    removeTerminalItemById,
    updateTerminalItemById,
    unknownErrorLabel: t('composer.unknownError'),
  });

  // ── Auto-retry preview after AI fix completes ──────────────────
  const prevAgentStreamingRef = useRef(agentStreaming);
  useEffect(() => {
    logChatDebug('agent_autoretry_effect', {
      currentTabId: currentTab?.id ?? null,
      agentStreaming,
    });
    const wasStreaming = prevAgentStreamingRef.current;
    prevAgentStreamingRef.current = agentStreaming;
    // Agent just finished (was running, now stopped)
    if (wasStreaming && !agentStreaming && currentTab?.id) {
      // Snapshot the conversation into chatHistory now that the agent
      // stream has actually finished. handleSend's own persist call at
      // the bottom of its body never runs on the agent path — that
      // branch returns early after startAgentModeSend, so without this
      // hook the messages would only land in AsyncStorage when the
      // user manually stops mid-stream.
      persistChatMessagesSnapshotByTabId(currentTab.id);

      const { autoRetryPreview } = useUIStore.getState();
      if (autoRetryPreview) {
        useUIStore.getState().setAutoRetryPreview(false);
        // Add "Start preview" button to chat
        addTerminalItem({
          id: `preview-retry-${Date.now()}`,
          content: '__PREVIEW_RETRY__',
          type: TerminalItemType.SYSTEM,
          timestamp: new Date(),
        });
      }
    }
  }, [agentStreaming, currentTab?.id, logChatDebug]);

  // Load file history from storage on mount
  useEffect(() => {
    useFileHistoryStore.getState().loadHistory();
  }, []);

  // Process agent events for sub-agents (todos + questions handled by engine)
  useEffect(() => {
    logChatDebug('sub_agent_effect', {
      agentEventsVersion,
      agentEventsLength: agentEvents.length,
    });
    if (!agentEvents || agentEvents.length === 0) return;

    // Extract latest sub_agent_start event
    const subAgentStartEvents = agentEvents.filter(e => e.type === 'sub_agent_start');
    const subAgentCompleteEvents = agentEvents.filter(e => e.type === 'sub_agent_complete');

    if (subAgentCompleteEvents.length > subAgentStartEvents.length - 1) {
      setCurrentSubAgent((prev) => (prev === null ? prev : null));
    } else if (subAgentStartEvents.length > 0) {
      const latestSubAgent = subAgentStartEvents[subAgentStartEvents.length - 1] as AgentToolEvent & {
        agentId?: string; agentType?: string; description?: string;
        iteration?: number; maxIterations?: number;
      };
      const nextSubAgent = {
        id: latestSubAgent.agentId || '',
        type: latestSubAgent.agentType || '',
        description: latestSubAgent.description || '',
        iteration: latestSubAgent.iteration || 0,
        maxIterations: latestSubAgent.maxIterations || 50,
        status: 'running',
      } as const;
      setCurrentSubAgent((prev) => (
        prev
        && prev.id === nextSubAgent.id
        && prev.type === nextSubAgent.type
        && prev.description === nextSubAgent.description
        && prev.iteration === nextSubAgent.iteration
        && prev.maxIterations === nextSubAgent.maxIterations
        && prev.status === nextSubAgent.status
          ? prev
          : nextSubAgent
      ));
    }
  }, [agentEventsVersion, logChatDebug]);

  // Effect for cache invalidation and chat saving on agent completion
  useEffect(() => {
    logChatDebug('agent_completion_effect', {
      currentTabId: currentTab?.id ?? null,
      agentStreaming,
      agentEventsLength: agentEvents.length,
    });
    if (!agentStreaming && agentEvents.length > 0 && currentTab?.id) {
      // Save chat messages when agent completes
      if (currentTab?.type === 'chat' && currentTab.data?.chatId) {
        const chatId = currentTab.data.chatId;
        const existingChat = useChatStore.getState().chatHistory.find(c => c.id === chatId);

        if (existingChat) {
          const freshTab = useTabStore.getState().tabs.find(t => t.id === currentTab.id);
          const updatedMessages = freshTab?.terminalItems || [];

          useChatStore.getState().updateChat(chatId, {
            messages: updatedMessages,
            lastUsed: new Date(),
          });
        }
      }

      // Invalidate file cache when agent completes
      if (currentTab?.data?.projectId) {
        const hadFileChanges = agentEvents.some(e =>
          e.type === 'tool_complete' &&
          e.tool != null && ['write_file', 'edit_file', 'run_command', 'notebook_edit', 'launch_sub_agent'].includes(e.tool)
        );

        const projectId = currentTab?.data?.projectId;
        if (hadFileChanges && projectId) {
          useFileCacheStore.getState().clearCache(projectId);
        }
      }

      // NOTE: Do NOT reset prevEngineMessagesRef/engineIdMapRef here!
      // The engine still has messages and the bridge would re-add them all.
      // Bridge refs are only reset in handleSend/handleStop when engine.reset() is called.

      // Clean up any dangling "Thinking..." placeholders left in the tab
      // (can happen if the user navigated away while the agent was processing)
      clearDanglingThinkingState(currentTab.id);
    }
  }, [agentStreaming, agentEvents.length, currentTab?.id, currentTab?.data?.projectId, currentTab?.data?.chatId, clearDanglingThinkingState]);

  // Defensive cleanup when entering/re-entering a tab with completed iteration.
  // If no stream is active, any leftover isThinking state is stale UI.
  useEffect(() => {
    logChatDebug('dangling_cleanup_effect', {
      currentTabId: currentTab?.id ?? null,
      isActiveTab,
      agentStreaming,
      isLoading,
    });
    if (!currentTab?.id || !isActiveTab) return;
    if (agentStreaming || isLoading) return;
    clearDanglingThinkingState(currentTab.id);
  }, [currentTab?.id, isActiveTab, agentStreaming, isLoading, clearDanglingThinkingState, logChatDebug]);

  // Scroll to end when keyboard opens to show last messages
  useEffect(() => {
    const keyboardDidShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardDidShow' : 'keyboardDidShow',
      () => {
        if (hasChatStarted && terminalItems.length > 0) {
          setTimeout(() => scrollToBottom(true), 100);
        }
      }
    );

    return () => {
      keyboardDidShow.remove();
    };
  }, [hasChatStarted, terminalItems.length, scrollToBottom]);

  // Keyboard listeners - move input box up when keyboard opens
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        // Always move up when keyboard opens, regardless of chat state
        keyboardHeight.value = withTiming(e.endCoordinates.height, {
          duration: 250,
          easing: Easing.out(Easing.cubic),
        });

        const currentItems = useTabStore.getState().tabs.find(t => t.id === useTabStore.getState().activeTabId)?.terminalItems;
        if (currentItems && currentItems.length > 0) {
          // Chat mode: adjust scroll padding and scroll to end
          const extraPadding = e.endCoordinates.height - insets.bottom + 80;
          setScrollPaddingBottom(300 + extraPadding);
          setTimeout(() => scrollToBottom(true), 150);
        }
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        // Set to 0 immediately so widget jumps directly to final position
        // Widget stays in place while keyboard slides down underneath
        keyboardHeight.value = 0;
        // Reset scroll padding
        setScrollPaddingBottom(300);
        // Scroll to bottom after padding shrinks to prevent view jumping up
        // (the padding reduction shifts content and can set isNearBottom=false)
        if (isNearBottomRef.current) {
          setNearBottomState(true); // keep pinned
          setTimeout(() => scrollToBottom(false), 80);
        }
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, [insets.bottom]);

  // Sync hasChatStartedAnim with actual state (for tab switching)
  useEffect(() => {
    if (hasChatStarted) {
      hasChatStartedAnim.value = 1;
      inputPositionAnim.value = 1;
    } else {
      hasChatStartedAnim.value = 0;
      inputPositionAnim.value = 0.45;
    }
  }, [hasChatStarted, currentTab?.id]);

  // WebSocket log service DISABLED - was causing connect/disconnect loop issues
  // TODO: Re-enable when WebSocket stability is improved
  // The real-time backend logs feature is temporarily disabled to prevent
  // performance issues and log spam in the terminal.

  /*
  // Ref to hold the current addTerminalItem function (avoids re-subscribing on every render)
  const addTerminalItemRef = useRef(addTerminalItem);
  const isTerminalModeRef = useRef(isTerminalMode);

  // Keep refs up to date
  useEffect(() => {
    addTerminalItemRef.current = addTerminalItem;
  }, [addTerminalItem]);

  useEffect(() => {
    isTerminalModeRef.current = isTerminalMode;
  }, [isTerminalMode]);

  // Subscribe to real-time backend logs via WebSocket (only once on mount)
  useEffect(() => {
    const unsubscribe = websocketLogService.addListener((log: BackendLog) => {
      // Only show logs when in terminal mode
      if (!isTerminalModeRef.current) return;

      // Filter out WebSocket connection spam messages
      const spamPatterns = [
        /WebSocket.*connect/i,
        /WebSocket.*disconnect/i,
        /🔌.*WebSocket/i,
        /\[WebSocketLogService\]/i,
      ];

      if (spamPatterns.some(pattern => pattern.test(log.message))) {
        return; // Skip spam messages
      }

      // Add backend log to terminal
      addTerminalItemRef.current({
        id: `backend-log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content: log.message,
        type: log.level === 'error' ? TerminalItemType.ERROR : TerminalItemType.BACKEND_LOG,
        timestamp: new Date(log.timestamp),
        source: 'system',
      });
    });

    return () => {
      unsubscribe();
    };
  }, []); // Empty dependency array - subscribe only once on mount
  */

  useEffect(() => {
    // Aggiorna il toggle in tempo reale mentre scrivi (solo in auto mode)
    logChatDebug('input_terminal_mode_effect', {
      inputLength: input.length,
      forcedMode: forcedMode ?? null,
      nextTerminalMode: input.trim() && !forcedMode ? isCommand(input.trim()) : null,
    });
    if (input.trim() && !forcedMode) {
      setIsTerminalMode(isCommand(input.trim()));
    }
  }, [input, forcedMode, logChatDebug]);

  useEffect(() => {
    // Animazione quando cambia il toggle
    logChatDebug('terminal_mode_animation_effect', {
      isTerminalMode,
    });
    if (isTerminalMode) {
      scaleAnim.value = withSpring(1.2, { duration: 100 });
      scaleAnim.value = withSpring(1, { duration: 100 });
    } else {
      scaleAnim.value = withSpring(1.2, { duration: 100 });
      scaleAnim.value = withSpring(1, { duration: 100 });
    }
  }, [isTerminalMode, logChatDebug]);

  const terminalModeAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scaleAnim.value }],
    };
  });

  const aiModeAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scaleAnim.value }],
    };
  });

  const cardBorderAnimatedStyle = useAnimatedStyle(() => {
    return {
      borderWidth: borderAnim.value * 2,
      borderColor: `rgba(155, 138, 255, ${borderAnim.value * 0.3})`,
    };
  });

  const cardDimensionsAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    // Animate dimensions and border radius when entering/exiting card mode
    const borderRadius = interpolate(
      cardModeAnim.value,
      [0, 1],
      [0, 16]
    );

    const marginTop = interpolate(
      cardModeAnim.value,
      [0, 1],
      [0, insets.top + 10]
    );

    // Animate width and height too - use fixed values when in card mode
    const width = interpolate(
      cardModeAnim.value,
      [0, 0.01, 1],
      [0, cardDimensions.width, cardDimensions.width]
    );

    const height = interpolate(
      cardModeAnim.value,
      [0, 0.01, 1],
      [0, cardDimensions.height - insets.top - 10, cardDimensions.height - insets.top - 10]
    );

    return {
      width: width > 0 ? width : undefined,
      height: height > 0 ? height : undefined,
      borderRadius,
      marginTop,
      overflow: 'hidden',
    };
  });

  const animatedContentStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      paddingLeft: 0,
    };
  });

  const welcomeAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    const translateY = interpolate(
      keyboardHeight.value,
      [0, 300],
      [0, -70],
      Extrapolate.CLAMP
    );
    return { transform: [{ translateY }] };
  });

  const inputWrapperAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    const animProgress = inputPositionAnim.value;
    const revealProgress = inputRevealAnim.value;
    const revealLift = interpolate(revealProgress, [0, 1], [18, 0], Extrapolate.CLAMP);

    // BYNOTMOB: sidebar removed, always 0
    const sidebarLeft = 0;

    // iPad: centra la input bar nell'area di contenuto
    const MAX_INPUT_WIDTH = 720;
    const isIPad = SCREEN_WIDTH >= 768;
    const computedLeft = isIPad
      ? sidebarLeft + (SCREEN_WIDTH - sidebarLeft - MAX_INPUT_WIDTH) / 2
      : sidebarLeft;
    const computedRight = isIPad
      ? SCREEN_WIDTH - computedLeft - MAX_INPUT_WIDTH
      : 0;

    // Se la tastiera è aperta, calcola top dalla posizione della tastiera
    if (keyboardHeight.value > 0) {
      const topFromKeyboard = SCREEN_HEIGHT - keyboardHeight.value - widgetHeight.value - 12;
      return {
        top: topFromKeyboard,
        left: computedLeft,
        right: computedRight,
        opacity: revealProgress,
        transform: [{ translateY: revealLift }]
      };
    }

    // Altrimenti usa top calcolato in base a insets.bottom e interpolato in base a inputPositionAnim (da welcome a chat attiva)
    const welcomeTop = Math.round(SCREEN_HEIGHT * 0.50 - 8);
    const bottomInset = Math.max(insets.bottom, 12);
    const activeTop = SCREEN_HEIGHT - bottomInset - widgetHeight.value - 12;

    const top = interpolate(
      animProgress,
      [0.45, 1],
      [welcomeTop, activeTop],
      Extrapolate.CLAMP
    );

    return {
      top,
      left: computedLeft,
      right: computedRight,
      opacity: revealProgress,
      transform: [{ translateY: revealLift }]
    };
  });

  useEffect(() => {
    if (isCardMode) {
      borderAnim.value = withSpring(1, {
        damping: 20,
        stiffness: 180,
        mass: 0.6,
      });
      cardModeAnim.value = withSpring(1, {
        damping: 20,
        stiffness: 180,
        mass: 0.6,
      });
    } else {
      borderAnim.value = withSpring(0, {
        damping: 20,
        stiffness: 180,
        mass: 0.6,
      });
      cardModeAnim.value = withSpring(0, {
        damping: 20,
        stiffness: 180,
        mass: 0.6,
      });
    }
  }, [isCardMode]);



  const handleToggleMode = (mode: 'fast' | 'terminal') => {
    tracciaModalitaChatCambiata(mode);
    setAgentMode(mode);
  };

  useEffect(() => {
    // Handle GitHub OAuth callback
    const handleGitHubCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');

      if (code && state) {
        const success = await githubService.handleOAuthCallback(code, state);

        if (success) {
          const user = await githubService.getStoredUser();
          const repos = await githubService.fetchRepositories();

          setGitHubUser(user);
          setGitHubRepositories(repos);


          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } else {
        // Check if already authenticated
        const isAuth = await githubService.isAuthenticated();
        if (isAuth) {
          const user = await githubService.getStoredUser();
          const repos = await githubService.fetchRepositories();
          setGitHubUser(user);
          setGitHubRepositories(repos);

        }
      }
    };

    handleGitHubCallback();
  }, []);

  // ── Estimate context window usage from conversation length ──────
  const contextUsage = useMemo(() => {
    return estimateContextUsage(currentTab?.terminalItems || [], selectedModel, engine.contextUsagePercent);
  }, [currentTab?.terminalItems, selectedModel, engine.contextUsagePercent]);

  // handleSend, handleStop, handleRetryTool are provided by useChatSendHandler above

  const handleSendWithAutoProject = useCallback(async () => {
    const text = input.trim();
    if (currentWorkstation || !text || creatingProjectFromPrompt) {
      handleSend();
      return;
    }
    setCreatingProjectFromPrompt(true);
    // Clear the input + the per-tab ref immediately so the welcome composer
    // empties on tap. The deferred handleSend (fired by the useEffect that
    // resumes after currentWorkstation is set) receives the prompt as an
    // explicit argument, so it doesn't depend on input state here.
    setInput('');
    if (currentTab?.id) {
      tabInputsRef.current[currentTab.id] = '';
      // Show the user's prompt + a thinking placeholder immediately so the
      // welcome layout swaps to the in-chat layout in the same frame as the
      // send. The only thing the user notices changing later is the project
      // name pill that lands at the top once create-with-template returns.
      addTerminalItemToStore(currentTab.id, {
        id: 'temp-auto-create-user',
        content: text,
        type: TerminalItemType.USER_MESSAGE,
        timestamp: new Date(),
      });
      addTerminalItemToStore(currentTab.id, {
        id: 'temp-auto-create-thinking',
        content: '',
        type: TerminalItemType.OUTPUT,
        isThinking: true,
        timestamp: new Date(),
      });
    }
    try {
      const token = await getAuthToken();
      if (!token) {
        setInput(text);
        if (currentTab?.id) {
          cleanupTempAutoCreateItems(currentTab.id);
        }
        handleSend();
        return;
      }
      // 1. Ask the AI for a short project name
      let title = text.split(/\s+/).slice(0, 5).join(' ').slice(0, 40);
      try {
        const titleRes = await fetch(`${config.apiUrl}/ai/chat/generate-title`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        });
        const titleData = await titleRes.json();
        if (titleData?.title) title = String(titleData.title).trim();
      } catch (_e) {
        /* fallback to the truncated prompt */
      }

      // 2. Create the project on the backend
      const createRes = await fetch(`${config.apiUrl}/workstation/create-with-template`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: title, technology: 'react', description: text }),
      });
      const createData = await createRes.json();
      if (!createData?.success) {
        if (currentTab?.id) {
          cleanupTempAutoCreateItems(currentTab.id);
        }
        handleSend();
        return;
      }

      // 3. Fetch the freshly created workstation and select it
      const list = await workstationService.getWorkstations();
      const created = list.find((p) => p.id === createData.projectId);
      if (created) {
        setWorkstationGlobal(created);
        setPendingFirstPrompt(text);
      } else {
        if (currentTab?.id) {
          cleanupTempAutoCreateItems(currentTab.id);
        }
        handleSend();
      }
    } catch (err) {
      console.warn('[ChatPage.handleSendWithAutoProject] failed', err);
      if (currentTab?.id) {
        cleanupTempAutoCreateItems(currentTab.id);
      }
      handleSend();
    } finally {
      setCreatingProjectFromPrompt(false);
    }
  }, [input, currentWorkstation, creatingProjectFromPrompt, handleSend, setWorkstationGlobal, currentTab?.id, addTerminalItemToStore, cleanupTempAutoCreateItems]);

  // Resume the send once the workstation has been set (zustand update
  // re-renders this component, then this effect fires the deferred send).
  // Pass the prompt EXPLICITLY to handleSend so it doesn't read the input
  // state (which was cleared upfront in handleSendWithAutoProject for
  // instant UX feedback — the closure-captured `input` here would be
  // empty and bail out of canSendChatMessage).
  useEffect(() => {
    if (currentWorkstation && pendingFirstPrompt) {
      const prompt = pendingFirstPrompt;
      setPendingFirstPrompt(null);
      // The temp user bubble + temp thinking placeholder mounted by
      // handleSendWithAutoProject must survive the workstation switch so
      // the chat looks continuous. Adopt the thinking placeholder as the
      // engine bridge's preId so the same spinner becomes the real
      // streaming target — no flash, no double bubble.
      handleSend(undefined, prompt, {
        skipUserBubble: true,
        reuseExistingThinkingId: 'temp-auto-create-thinking',
      });
      // Now that handleSend (→ startAgentModeSend) has adopted the temp
      // thinking placeholder, drop the "create-in-progress" flag.
      // Without this the ListFooter would still see isLoading=true even
      // after the engine starts, and mount a second "Sto pensando" pill
      // below the real one — what the user sees as the spinner restarting.
      setCreatingProjectFromPrompt(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkstation, pendingFirstPrompt, currentTab?.id]);
  // Memoized filtered and processed terminal items for FlatList
  const processedTerminalItems = useMemo(() => (
    getProcessedTerminalItems(
      isCreationFlow
        ? terminalItems.filter((item) => !(item.content || '').startsWith('__AGENT_STATUS__'))
        : terminalItems,
      {
      // Treat the project-auto-create window as "loading" too, otherwise
      // the temp thinking placeholder mounted by handleSendWithAutoProject
      // gets filtered out and the ListFooterComponent renders its big
      // pill fallback instead of the inline bullet indicator.
      isLoading: isLoading || creatingProjectFromPrompt,
      agentStreaming,
      isCommand,
      }
    )
  ), [terminalItems, isLoading, creatingProjectFromPrompt, agentStreaming, isCreationFlow]);

  const inputbarTodoRenderKey = useMemo(() => {
    if (!engine.currentTodos?.length) return 'no-todos';
    return engine.currentTodos
      .map((t: { id?: string; status?: string; activeForm?: string; content?: string }) => `${t.id || ''}:${t.status || ''}:${(t.activeForm || t.content || '').length}`)
      .join('|');
  }, [engine.currentTodos]);

  useEffect(() => {
    if (processedTerminalItems.length === 0 && !isNearBottomRef.current) {
      setNearBottomState(true);
    }
  }, [processedTerminalItems.length, setNearBottomState]);

  // Reset dismiss state when a new set of todos arrives
  const prevTodoCountRef = React.useRef(0);
  React.useEffect(() => {
    const count = engine.currentTodos?.length || 0;
    if (count > 0 && prevTodoCountRef.current === 0) {
      setIsInputbarTodoDismissed(false);
    }
    prevTodoCountRef.current = count;
  }, [engine.currentTodos?.length]);

  // Track updates on the last rendered item (also during streaming deltas)
  const lastItemAutoScrollKey = useMemo(() => {
    const last = processedTerminalItems[processedTerminalItems.length - 1]?.item;
    if (!last) return 'empty';
    const contentLen = (last.content || '').length;
    const thinkingLen = (last.thinkingContent || '').length;
    return `${processedTerminalItems.length}:${last.id || ''}:${last.type || ''}:${contentLen}:${thinkingLen}:${last.isThinking ? 1 : 0}`;
  }, [processedTerminalItems]);

  // Keep following the bottom while streaming, unless the user scrolled up.
  useEffect(() => {
    if (!isNearBottomRef.current || processedTerminalItems.length === 0) return;
    scrollToBottom(!(isLoading || agentStreaming));
  }, [lastItemAutoScrollKey, processedTerminalItems.length, isLoading, agentStreaming, scrollToBottom]);

  const groupedToolCalls = useMemo(() => {
    interface GroupedToolCall {
      id: string;
      toolName: string;
      startTime: Date;
      endTime?: Date;
      status: 'running' | 'completed' | 'failed';
      input?: any;
      output?: any;
      error?: string;
    }

    const list: GroupedToolCall[] = [];
    const activeCallsMap = new Map<string, GroupedToolCall>();

    for (const event of agentEvents) {
      if (event.type === 'tool_start') {
        const call: GroupedToolCall = {
          id: event.id || `tool-${event.timestamp instanceof Date ? event.timestamp.getTime() : Date.now()}-${event.tool}`,
          toolName: event.tool || 'unknown',
          startTime: event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp),
          status: 'running',
          input: event.input,
        };
        list.push(call);
        activeCallsMap.set(event.tool || 'unknown', call);
      } else if (event.type === 'tool_complete') {
        const call = activeCallsMap.get(event.tool || 'unknown');
        if (call) {
          call.endTime = event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp);
          call.status = 'completed';
          call.output = event.result || event.output;
          activeCallsMap.delete(event.tool || 'unknown');
        }
      } else if (event.type === 'tool_error') {
        const call = activeCallsMap.get(event.tool || 'unknown');
        if (call) {
          call.endTime = event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp);
          call.status = 'failed';
          call.error = event.error || event.message;
          activeCallsMap.delete(event.tool || 'unknown');
        }
      }
    }
    return list;
  }, [agentEvents, agentEventsVersion]);

  return (
    <Animated.View style={[
      styles.container,
      cardDimensionsAnimatedStyle, // Animated width, height, borderRadius, marginTop, overflow
      cardBorderAnimatedStyle,
      animatedStyle
    ]}>
      {/* Content wrapper with sidebar offset */}
      <Animated.View style={[{ flex: 1, backgroundColor: '#0d0d0f' }, animatedContentStyle]}>
        {/* Top Upgrade Pill - Custom Liquid Glass (Expo Safe) */}
        {!isPaidUser && currentTab?.type === 'terminal' && (
          <TouchableOpacity
            style={[
              styles.topUpgradePill,
              { top: insets.top + (isCardMode ? 47 : 40) }
            ]}
            onPress={() => { tracciaPaginaPianiVista('chat'); navigateTo('plans'); }}
            activeOpacity={0.8}
          >
            <BlurView intensity={35} tint="dark" style={styles.upgradePillBlur}>
              {/* Animated Shimmer Highlight (Liquid feel) */}
              <Animated.View style={[styles.shimmerLayer, shimmerStyle]}>
                <LinearGradient
                  colors={['transparent', 'rgba(255, 255, 255, 0.1)', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>

              {/* Inner Border Reflection */}
              <View style={styles.innerGloss} />

              <Ionicons name="flash" size={11} color="rgba(255,255,255,0.95)" />
              <Text style={styles.upgradePillText}>{t('terminal:preview.upgradeCta')}</Text>
            </BlurView>
          </TouchableOpacity>
        )}

        {currentTab && currentTab.type !== 'chat' ? (
          <WorkspaceTabContent tab={currentTab} />
        ) : (
          <>
            {/* Chat background with gradient */}
            <LinearGradient
              colors={AppColors.gradient.dark}
              locations={[0, 0.3, 0.7, 1]}
              style={styles.background}
            >
            </LinearGradient>
            <ChatMessageList
              processedTerminalItems={processedTerminalItems}
              terminalItemsLength={terminalItems.length}
              scrollViewRef={scrollViewRef}
              scrollPaddingBottom={scrollPaddingBottom}
              isCardMode={isCardMode}
              styles={styles}
              contentHeightRef={contentHeightRef}
              layoutHeightRef={layoutHeightRef}
              isNearBottomRef={isNearBottomRef}
              scrollLockUntilRef={scrollLockUntilRef}
              isUserScrollActiveRef={isUserScrollActiveRef}
              isLoading={isLoading || creatingProjectFromPrompt}
              agentStreaming={agentStreaming}
              agentEvents={agentEvents}
              agentCurrentTool={agentCurrentTool}
              budgetInfo={budgetInfo}
              keyboardHeight={keyboardHeight}
              onSuggestionPress={(text) => {
                handleInputChange(text);
                setTimeout(() => handleSend(), 100);
              }}
              onScrollToBottom={scrollToBottom}
              onSetNearBottomState={setNearBottomState}
              onRetryTool={handleRetryTool}
              creatingProject={creatingProjectFromPrompt}
              onOpenPlans={() => {
                tracciaPaginaPianiVista('chat');
                navigateTo('plans');
              }}
              onShowAgentDetails={() => setIsAgentDetailsVisible(true)}
              onStartPreview={() => useUIStore.getState().requestOpenPreview({ autoStart: true })}
            />

            {/* AskUserQuestion: shown inline in chat as Q&A card, user replies via input */}

            <DelayedMount key={inputMountKey} delay={inputMountDelay}>
            <Animated.View style={[
              styles.inputWrapper,
              isCardMode && styles.inputWrapperCardMode,
              inputWrapperAnimatedStyle,
            ]}>
              <ChatComposerArea
                styles={styles}
                currentWorkstationId={currentWorkstation?.id}
                currentWorkstationRepoUrl={currentWorkstation?.repositoryUrl || currentWorkstation?.githubUrl}
                selectedInputImages={selectedInputImages}
                showScrollToBottom={showScrollToBottom}
                input={input}
                handleInputChange={handleInputChange}
                handleSend={() => handleSendWithAutoProject()}
                handleStop={() => {
                  handleStop();
                  setCreatingProjectFromPrompt(false);
                  if (currentTab?.id) {
                    cleanupTempAutoCreateItems(currentTab.id);
                  }
                }}
                agentMode={agentMode}
                handleToggleMode={handleToggleMode}
                agentStreaming={agentStreaming}
                isLoading={isLoading || creatingProjectFromPrompt}
                selectedModel={selectedModel}
                currentModelName={currentModelName}
                showModelSelector={showModelSelector}
                toggleModelSelector={toggleModelSelector}
                closeDropdown={closeDropdown}
                setSelectedModel={setSelectedModel}
                tracciaModelloSelezionato={tracciaModelloSelezionato}
                isPaidUser={isPaidUser}
                thinkingLevel={thinkingLevel}
                setThinkingLevel={setThinkingLevel}
                contextUsage={contextUsage}
                showContextInfo={showContextInfo}
                setShowContextInfo={setShowContextInfo}
                budgetInfo={budgetInfo}
                navigateToPlans={() => {
                  tracciaPaginaPianiVista('chat');
                  navigateTo('plans');
                }}
                toggleToolsSheet={(currentWorkstation && hasChatStarted) ? toggleToolsSheet : () => setHomeMenuVisible(true)}
                inputBarGlassId={inputBarGlassId}
                glassApplied={glassApplied}
                widgetHeight={widgetHeight}
                isActiveTab={isActiveTab}
                isSidebarOpen={isSidebarOpen}
                hasChatStarted={hasChatStarted}
                inputGlassRevealDelay={inputGlassRevealDelay}
                applyInputGlass={applyInputGlass}
                aiModeAnimatedStyle={aiModeAnimatedStyle}
                dropdownAnimatedStyle={dropdownAnimatedStyle}
                scrollToBottom={scrollToBottom}
                onRemoveImage={(index) => {
                  setSelectedInputImages((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
                }}
                onOpenGit={() => { useUIStore.getState().requestOpenGitSheet(null); }}
                onOpenBranch={() => { useUIStore.getState().requestOpenGitSheet('branches'); }}
                onOpenEnvVars={() => useUIStore.getState().requestOpenEnvVars()}
                labels={{ scrollToBottom: t('composer.scrollToBottom') }}
              />
              {/* Home popover — anchored to the input bar so it always sits just
                  below the +, regardless of screen size or input bar height. */}
              {homeMenuVisible && !(currentWorkstation && hasChatStarted) && (
                <View pointerEvents="box-none" style={styles.homeMenuAnchor}>
                  <TouchableOpacity
                    activeOpacity={1}
                    style={StyleSheet.absoluteFill}
                    onPress={() => {
                      setHomeMenuVisible(false);
                      setHomeMenuView('root');
                    }}
                  />
                  <View style={styles.homeMenuPopover}>
                    {homeMenuView === 'root' ? (
                      <>
                        <View style={styles.homeMenuSearchRow}>
                          <Ionicons name="search" size={16} color="rgba(255,255,255,0.45)" />
                          <Text style={styles.homeMenuSearchPlaceholder}>Search…</Text>
                        </View>
                        <View style={styles.homeMenuDivider} />
                        {[
                          { id: 'attach', icon: 'attach' as const, label: 'Attach' },
                          { id: 'databases', icon: 'server-outline' as const, label: 'Databases' },
                        ].map((item) => (
                          <TouchableOpacity
                            key={item.id}
                            style={styles.homeMenuItem}
                            activeOpacity={0.7}
                            onPress={() => {
                              if (item.id === 'attach') {
                                setHomeMenuView('attach');
                              } else {
                                setHomeMenuVisible(false);
                              }
                            }}
                          >
                            <Ionicons name={item.icon} size={18} color="rgba(255,255,255,0.85)" />
                            <Text style={styles.homeMenuItemText}>{item.label}</Text>
                            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.35)" style={{ marginLeft: 'auto' }} />
                          </TouchableOpacity>
                        ))}
                      </>
                    ) : (
                      <>
                        <View style={styles.homeMenuSearchRow}>
                          <TouchableOpacity
                            onPress={() => setHomeMenuView('root')}
                            style={styles.homeMenuBackBtn}
                            activeOpacity={0.7}
                            hitSlop={6}
                          >
                            <Ionicons name="chevron-back" size={14} color="rgba(255,255,255,0.85)" />
                          </TouchableOpacity>
                          <Text style={styles.homeMenuSearchPlaceholder}>Search…</Text>
                        </View>
                        <View style={styles.homeMenuDivider} />
                        <TouchableOpacity
                          style={styles.homeMenuItem}
                          activeOpacity={0.7}
                          onPress={() => {
                            setHomeMenuVisible(false);
                            setHomeMenuView('root');
                            setTimeout(showAttachActionSheet, 80);
                          }}
                        >
                          <Ionicons name="document-outline" size={18} color="rgba(255,255,255,0.85)" />
                          <Text style={styles.homeMenuItemText}>File</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              )}
            </Animated.View>
            </DelayedMount>
          </>
        )}
      </Animated.View>

      <ChatToolsSheet
        styles={styles}
        visible={showToolsSheet}
        toolsBackdropStyle={toolsBackdropStyle}
        toolsSheetStyle={toolsSheetStyle}
        recentPhotos={recentPhotos}
        selectedPhotoIds={selectedPhotoIds}
        selectedInputImagesCount={selectedInputImages.length}
        onToggleSheet={toggleToolsSheet}
        onTogglePhoto={(photoId) => {
          setSelectedPhotoIds((prev) => {
            const next = new Set(prev);
            next.has(photoId) ? next.delete(photoId) : next.add(photoId);
            return next;
          });
        }}
        onSendSelectedPhotos={sendSelectedPhotos}
        onPickImageFromLibrary={pickImageFromLibrary}
        onOpenProjectSection={(section) => {
          const { addTab, setActiveTab, tabs: currentTabs } = useTabStore.getState();
          toggleToolsSheet();
          const openOrFocus = (id: string, type: any, title: string) => {
            const existing = currentTabs.find((t) => t.id === id);
            if (existing) {
              setActiveTab(id);
            } else {
              addTab({ id, type, title, data: {} });
            }
          };
          switch (section) {
            case 'files':
              openOrFocus('files', 'files', 'File del progetto');
              break;
            case 'git':
              useUIStore.getState().requestOpenGitSheet(null);
              break;
            case 'database':
              openOrFocus('database', 'database', 'Database');
              break;
          }
        }}
        labels={{
          allPhotos: t('composer.allPhotos'),
          maxImagesTitle: t('composer.maxImagesTitle'),
          maxImagesMessage: t('composer.maxImagesMessage'),
          selectPhotos: t('composer.selectPhotos', { count: selectedPhotoIds.size }),
          selectPhotosPlural: t('composer.selectPhotosPlural', { count: selectedPhotoIds.size }),
          photoPickerTitle: t('composer.photoPickerTitle'),
          photoPickerSubtitle: t('composer.photoPickerSubtitle'),
        }}
      />

      <Modal
        visible={isAgentDetailsVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAgentDetailsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={35} tint="dark" style={styles.modalBlurBackground}>
            <View style={[styles.modalSafeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderTitleContainer}>
                  <Text style={styles.modalTitle}>Attività Assistente</Text>
                  <Text style={styles.modalSubtitle}>
                    {agentStreaming ? "Elaborazione in corso..." : "Lavoro completato"} • {groupedToolCalls.length} passaggi
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setIsAgentDetailsVisible(false)}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollView} contentContainerStyle={styles.modalScrollContent}>
                {groupedToolCalls.length === 0 ? (
                  <View style={styles.modalEmptyState}>
                    <Ionicons name="terminal-outline" size={48} color="rgba(255, 255, 255, 0.25)" />
                    <Text style={styles.modalEmptyText}>Nessuna attività registrata per questa richiesta.</Text>
                  </View>
                ) : (
                  groupedToolCalls.map((call, i) => {
                    const isExpanded = expandedToolId === call.id;
                    const icon = getToolIcon(call.toolName);
                    const name = getFriendlyToolName(call.toolName);
                    const isRunning = call.status === 'running';
                    const isCompleted = call.status === 'completed';
                    const isFailed = call.status === 'failed';

                    let targetText = '';
                    try {
                      const parsedInput = typeof call.input === 'string' ? JSON.parse(call.input) : call.input;
                      if (parsedInput) {
                        if (call.toolName.includes('read') || call.toolName.includes('write') || call.toolName.includes('edit')) {
                          const path = parsedInput.filePath || parsedInput.path || parsedInput.targetFile || parsedInput.TargetFile || '';
                          targetText = path ? path.split('/').pop() : '';
                        } else if (call.toolName.includes('command') || call.toolName.includes('bash')) {
                          targetText = parsedInput.command || '';
                        } else if (call.toolName.includes('search')) {
                          targetText = parsedInput.query || parsedInput.pattern || '';
                        } else if (call.toolName.includes('web')) {
                          targetText = parsedInput.url || parsedInput.query || '';
                        }
                      }
                    } catch (_) {}

                    return (
                      <View key={call.id || i} style={styles.logCard}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => setExpandedToolId(isExpanded ? null : call.id)}
                          style={styles.logCardHeader}
                        >
                          <View style={styles.logIconCol}>
                            <View style={[styles.logIconBg, { backgroundColor: isFailed ? 'rgba(248, 81, 73, 0.15)' : isCompleted ? 'rgba(63, 185, 80, 0.15)' : 'rgba(109, 76, 255, 0.15)' }]}>
                              <Ionicons
                                name={icon as any}
                                size={16}
                                color={isFailed ? '#F85149' : isCompleted ? '#3FB950' : '#6D4CFF'}
                              />
                            </View>
                          </View>
                          <View style={styles.logInfoCol}>
                            <Text style={styles.logTitle}>{name}</Text>
                            {targetText ? (
                              <Text style={styles.logTarget} numberOfLines={1}>
                                {targetText}
                              </Text>
                            ) : null}
                          </View>
                          <View style={styles.logStatusCol}>
                            {isRunning ? (
                              <ActivityIndicator size="small" color="#6D4CFF" />
                            ) : isCompleted ? (
                              <Ionicons name="checkmark-circle" size={18} color="#3FB950" />
                            ) : (
                              <Ionicons name="alert-circle" size={18} color="#F85149" />
                            )}
                            <Ionicons
                              name={isExpanded ? "chevron-up" : "chevron-down"}
                              size={14}
                              color="rgba(255, 255, 255, 0.3)"
                              style={{ marginLeft: 8 }}
                            />
                          </View>
                        </TouchableOpacity>

                        {isExpanded && (
                          <View style={styles.logDetailsContainer}>
                            {call.input ? (
                              <View style={styles.detailCodeBlock}>
                                <Text style={styles.detailCodeLabel}>PARAMETRI DI INPUT (ARGUMENTS)</Text>
                                <Text style={styles.detailCodeText}>
                                  {typeof call.input === 'object' ? JSON.stringify(call.input, null, 2) : String(call.input)}
                                </Text>
                              </View>
                            ) : null}

                            {call.output ? (
                              <View style={[styles.detailCodeBlock, { marginTop: 8 }]}>
                                <Text style={styles.detailCodeLabel}>RISULTATO (OUTPUT)</Text>
                                <Text style={styles.detailCodeText}>
                                  {typeof call.output === 'object'
                                    ? (call.output.content || JSON.stringify(call.output, null, 2))
                                    : String(call.output)}
                                </Text>
                              </View>
                            ) : null}

                            {call.error ? (
                              <View style={[styles.detailCodeBlock, styles.detailCodeBlockError, { marginTop: 8 }]}>
                                <Text style={[styles.detailCodeLabel, { color: '#FF6B6B' }]}>ERRORE RISCONTRATO (ERROR)</Text>
                                <Text style={[styles.detailCodeText, { color: '#FF6B6B' }]}>{call.error}</Text>
                              </View>
                            ) : null}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </BlurView>
        </View>
      </Modal>

    </Animated.View >
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0f',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  homeMenuAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    paddingLeft: 18,
    paddingTop: 8,
    alignItems: 'flex-start',
    zIndex: 100,
  },
  homeMenuPopover: {
    width: 240,
    backgroundColor: 'rgba(28, 26, 40, 0.95)',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    paddingVertical: 6,
  },
  homeMenuSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  homeMenuBackBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -2,
  },
  homeMenuSearchPlaceholder: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
  },
  homeMenuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 2,
  },
  homeMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  homeMenuItemText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  inputWrapper: {
    position: 'absolute',
    right: 0,
    pointerEvents: 'box-none',
    overflow: 'visible',
  },
  scrollToBottomButton: {
    position: 'absolute',
    right: 18,
    bottom: '100%',
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(17, 17, 22, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.45)',
    zIndex: 140,
  },
  scrollToBottomButtonWithImages: {
    marginBottom: 58,
  },
  scrollToBottomText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: -0.1,
  },
  undoFloatingContainer: {
    position: 'absolute',
    left: 16,
    bottom: '100%',
    marginBottom: 12,
    zIndex: 130,
  },
  undoFloatingContainerWithImages: {
    marginBottom: 58,
  },
  inputWrapperCentered: {
    top: 100,
    justifyContent: 'center',
  },
  // Tools Sheet
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  toolsSheet: {
    position: 'absolute',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    zIndex: 2000,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  toolsSheetSolid: {
    backgroundColor: '#181820',
  },
  sheetBlur: {
    flex: 1,
  },
  sheetGradient: {
    paddingBottom: 16,
    paddingTop: 8,
  },
  sheetHandle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sheetHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  sheetHeaderAction: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  galleryContainer: {
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 14,
  },
  cameraCard: {
    width: 78,
    height: 78,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  galleryCard: {
    width: 78,
    height: 78,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  galleryImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  gallerySelectCircle: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  gallerySelectCircleActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  sendPhotosButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sendPhotosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  sendPhotosButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  sheetDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 16,
    marginBottom: 6,
  },
  toolsList: {
    paddingHorizontal: 6,
  },
  toolItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 12,
    borderRadius: 14,
  },
  toolIconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolTextContainer: {
    flex: 1,
    gap: 1,
  },
  toolTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.1,
  },
  toolSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 16,
  },
  inputWrapperCardMode: {
    left: 0,
  },
  contextHeader: {
    position: 'absolute',
    top: 100,
    left: 60,
    right: 20,
    height: 44,
    justifyContent: 'center',
    zIndex: 5,
  },
  contextContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contextName: {
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.white.full,
  },
  eyeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  output: {
    flex: 1,
    paddingLeft: 0,
    paddingTop: 88, // Space for minimal header
  },
  outputCardMode: {
    paddingLeft: 0, // Remove sidebar offset in card mode
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 120, // Push up slightly from center to account for input bar
  },
  welcomeContainer: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
    marginBottom: 6,
  },
  welcomeSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.25)',
    textAlign: 'center',
    marginBottom: 24,
  },
  suggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  suggestionChipGlass: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  suggestionChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  suggestionText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.45)',
  },
  logoWrapper: {
    alignItems: 'center',
    opacity: 0.9,
  },
  logoIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: AppColors.primaryAlpha.a15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: AppColors.primaryAlpha.a40,
    elevation: 8,
  },
  logoTitle: {
    fontSize: 48,
    fontWeight: '900',
    color: AppColors.white.full,
    marginBottom: 8,
  },
  logoSubtitle: {
    fontSize: 18,
    color: AppColors.primary,
    fontWeight: '600',
    marginBottom: 24,
  },
  logoDivider: {
    width: 80,
    height: 3,
    backgroundColor: AppColors.primaryAlpha.a40,
    marginBottom: 24,
    borderRadius: 2,
  },
  logoDescription: {
    fontSize: 16,
    color: AppColors.white.w60,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '400',
    maxWidth: 280,
  },
  topUpgradePill: {
    position: 'absolute',
    alignSelf: 'center',
    marginLeft: 0,
    zIndex: 100,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  upgradePillBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    gap: 6,
    borderRadius: 30,
    overflow: 'hidden',
  },
  shimmerLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '100%',
    opacity: 0.7,
  },
  innerGloss: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  upgradePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.95)',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  outputContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 20, // Reduced since output already has paddingTop:80
    // paddingBottom managed dynamically via state
  },
  inputContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  inputGradient: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    elevation: 8,
    marginHorizontal: 20,
    zIndex: 10,
  },
  inputGradientOverflow: {
    overflow: 'hidden',
  },
  inputGradientWithImages: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0,
  },
  inputbarTodoContainer: {
    paddingHorizontal: 10,
    paddingTop: 2,
    paddingBottom: 2,
  },
  topControls: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 4,
    overflow: 'visible',
    zIndex: 100,
  },
  modeToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderRadius: 20,
    padding: 3,
    gap: 1,
  },
  autoLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: AppColors.primary,
    letterSpacing: 0.3,
  },
  modeButton: {
    width: 30,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
  },
  modeButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  modeButtonForced: {
    borderWidth: 1,
    borderColor: AppColors.primary,
  },
  modelSelectorContainer: {
    position: 'relative',
    zIndex: 100,
  },
  modelSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  modelText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
  },
  dropdownOverlay: {
    position: 'absolute',
    top: -500,
    left: -500,
    right: -500,
    bottom: -500,
    zIndex: 998,
  },
  modelDropdown: {
    position: 'absolute',
    bottom: '100%',
    right: 16,
    marginBottom: 8,
    backgroundColor: '#1a1a1e',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 6,
    minWidth: 200,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 20,
    overflow: 'hidden',
  },
  modelDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderRadius: 12,
    marginHorizontal: 3,
    marginVertical: 2,
  },
  modelDropdownItemActive: {
    backgroundColor: AppColors.primaryAlpha.a25,
  },
  modelDropdownText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  modelDropdownTextActive: {
    color: AppColors.white.full,
    fontWeight: '700',
  },
  // Thinking level selector styles
  thinkingLevelContainer: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    marginTop: 4,
  },
  thinkingLevelLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 8,
    fontWeight: '500',
  },
  thinkingLevelOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  thinkingLevelChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  thinkingLevelChipActive: {
    backgroundColor: AppColors.primaryAlpha.a25,
    borderColor: AppColors.primary,
  },
  thinkingLevelChipText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  thinkingLevelChipTextActive: {
    color: AppColors.primary,
    fontWeight: '600',
  },
  imagePreviewContainer: {
    maxHeight: 100,
    paddingVertical: 8,
  },
  imagePreviewContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  imagePreviewItem: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
  },
  // Compact image preview bar (sopra l'input)
  compactImageBar: {
    position: 'absolute',
    bottom: '100%',
    left: 16,
    right: 16,
    backgroundColor: `${AppColors.dark.surface}F2`,
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 4,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  compactImageBarContent: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  compactImageItem: {
    width: 36,
    height: 36,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  compactImage: {
    width: '100%',
    height: '100%',
  },
  compactRemoveButton: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  mainInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  toolsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: AppColors.dark.titleText,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 300,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalBlurBackground: {
    flex: 1,
    width: '100%',
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: 'rgba(18, 17, 26, 0.95)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalHeaderTitleContainer: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  modalSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  modalEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  modalEmptyText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  logCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 12,
    overflow: 'hidden',
  },
  logCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  logIconCol: {
    justifyContent: 'center',
  },
  logIconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logInfoCol: {
    flex: 1,
    gap: 2,
  },
  logTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  logTarget: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.45)',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  logStatusCol: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logDetailsContainer: {
    padding: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  detailCodeBlock: {
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: 10,
  },
  detailCodeBlockError: {
    backgroundColor: 'rgba(248, 81, 73, 0.08)',
    borderColor: 'rgba(248, 81, 73, 0.2)',
  },
  detailCodeLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  detailCodeText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    color: '#D1D5DB',
  },
});
export default ChatPage;
