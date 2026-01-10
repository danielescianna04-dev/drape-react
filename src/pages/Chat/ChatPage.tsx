import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Keyboard, Pressable, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence, interpolate, Extrapolate, Easing } from 'react-native-reanimated';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { TerminalItemType } from '../../shared/types';
import { AppColors } from '../../shared/theme/colors';
import { WelcomeView } from '../../features/terminal/components/WelcomeView';
import { TerminalItem as TerminalItemComponent } from '../../features/terminal/components/TerminalItem';
import { Sidebar } from '../../features/terminal/components/Sidebar';
import { VSCodeSidebar } from '../../features/terminal/components/VSCodeSidebar';
import { SafeText } from '../../shared/components/SafeText';
// import { PreviewEye } from './components/PreviewEye';
import { githubService } from '../../core/github/githubService';
import { aiService } from '../../core/ai/aiService';
import { useTabStore, Tab } from '../../core/tabs/tabStore';
import { ToolService } from '../../core/ai/toolService';

import { FileViewer } from '../../features/terminal/components/FileViewer';
import { TerminalView } from '../../features/terminal/components/TerminalView';
import { GitHubView } from '../../features/terminal/components/views/GitHubView';
import { BrowserView } from '../../features/terminal/components/views/BrowserView';
import { PreviewView } from '../../features/terminal/components/views/PreviewView';
import { SupabaseView } from '../../features/terminal/components/views/SupabaseView';
import { FigmaView } from '../../features/terminal/components/views/FigmaView';
import { EnvVarsView } from '../../features/terminal/components/views/EnvVarsView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSidebarOffset } from '../../features/terminal/context/SidebarContext';
import { useChatState } from '../../hooks/business/useChatState';
import { useContentOffset } from '../../hooks/ui/useContentOffset';
import { AnthropicIcon, GoogleIcon } from '../../shared/components/icons';
import { useFileHistoryStore } from '../../core/history/fileHistoryStore';
import { UndoRedoBar } from '../../features/terminal/components/UndoRedoBar';
import { useAgentStream } from '../../hooks/api/useAgentStream';
import { useAgentStore } from '../../core/agent/agentStore';
import { AgentProgress } from '../../shared/components/molecules/AgentProgress';
import { PlanApprovalModal } from '../../shared/components/molecules/PlanApprovalModal';
import { AgentStatusBadge } from '../../shared/components/molecules/AgentStatusBadge';
import { TodoList } from '../../shared/components/molecules/TodoList';
import { AskUserQuestionModal } from '../../shared/components/modals/AskUserQuestionModal';
import { SubAgentStatus } from '../../shared/components/molecules/SubAgentStatus';
// WebSocket log service disabled - was causing connect/disconnect loop
// import { websocketLogService, BackendLog } from '../../core/services/websocketLogService';

const colors = AppColors.dark;
const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// Helper to parse undo data from tool results
const parseUndoData = (result: string): { cleanResult: string; undoData: any | null } => {
  const undoMatch = result.match(/<!--UNDO:(.*?)-->/s);
  if (undoMatch) {
    try {
      const undoData = JSON.parse(undoMatch[1]);
      const cleanResult = result.replace(/\n?<!--UNDO:.*?-->/s, '');
      return { cleanResult, undoData };
    } catch (e) {
      console.warn('Failed to parse undo data:', e);
    }
  }
  return { cleanResult: result, undoData: null };
};

// Available AI models with custom icon components
const AI_MODELS = [
  { id: 'claude-sonnet-4', name: 'Claude 4', IconComponent: AnthropicIcon },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5', IconComponent: GoogleIcon },
];

interface ChatPageProps {
  tab?: Tab;
  isCardMode: boolean;
  cardDimensions: { width: number; height: number; };
  animatedStyle?: any;
}

const ChatPage = ({ tab, isCardMode, cardDimensions, animatedStyle }: ChatPageProps) => {
  // Use custom hooks for state management and UI concerns
  const chatState = useChatState(isCardMode);

  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const { sidebarTranslateX, hideSidebar, showSidebar, setForceHideToggle } = useSidebarOffset();

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

  // Agent state - 2-mode system (Fast or Planning only)
  const [agentMode, setAgentMode] = useState<'fast' | 'planning'>('fast');
  const {
    start: startAgent,
    isRunning: agentStreaming,
    events: agentEvents,
    currentTool: agentCurrentTool,
    plan: agentPlan,
    reset: resetAgent
  } = useAgentStream(agentMode);
  const [showPlanApproval, setShowPlanApproval] = useState(false);

  // New Claude Code components state
  const [currentTodos, setCurrentTodos] = useState<any[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<any>(null);
  const [currentSubAgent, setCurrentSubAgent] = useState<any>(null);

  // Agent store - use specific selectors to prevent unnecessary re-renders
  const agentIteration = useAgentStore((state) => state.iteration);
  const agentCurrentPrompt = useAgentStore((state) => state.currentPrompt);
  const agentFilesCreated = useAgentStore((state) => state.filesCreated);
  const agentFilesModified = useAgentStore((state) => state.filesModified);
  const setCurrentPrompt = useAgentStore((state) => state.setCurrentPrompt);
  const setCurrentProjectId = useAgentStore((state) => state.setCurrentProjectId);

  // Tools bottom sheet state
  const [showToolsSheet, setShowToolsSheet] = useState(false);
  const toolsSheetAnim = useSharedValue(SCREEN_HEIGHT);

  const toggleToolsSheet = useCallback(() => {
    if (showToolsSheet) {
      if (showSidebar) showSidebar();
      if (setForceHideToggle) setForceHideToggle(false);
      toolsSheetAnim.value = withTiming(SCREEN_HEIGHT, {
        duration: 300,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1)
      });
      setTimeout(() => setShowToolsSheet(false), 300);
    } else {
      if (hideSidebar) hideSidebar();
      if (setForceHideToggle) setForceHideToggle(true);
      setShowToolsSheet(true);
      toolsSheetAnim.value = withTiming(0, {
        duration: 400,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1)
      });
    }
  }, [showToolsSheet, hideSidebar, showSidebar, setForceHideToggle]);

  const toolsSheetStyle = useAnimatedStyle(() => {
    const sidebarLeft = interpolate(
      sidebarTranslateX.value,
      [-44, 0],
      [0, 44],
      Extrapolate.CLAMP
    );

    return {
      transform: [{ translateY: toolsSheetAnim.value }],
      left: sidebarLeft + 8,
      right: 8,
      bottom: 8,
      opacity: interpolate(toolsSheetAnim.value, [SCREEN_HEIGHT, 0], [0, 1]),
    };
  });

  const toolsBackdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(toolsSheetAnim.value, [SCREEN_HEIGHT, 0], [0, 1]),
    pointerEvents: showToolsSheet ? 'auto' : 'none',
  }));

  const { tabs, activeTabId, updateTab, addTerminalItem: addTerminalItemToStore } = useTabStore();

  // Model selector dropdown state
  const [showModelSelector, setShowModelSelector] = useState(false);
  const dropdownAnim = useSharedValue(0);

  // Animated styles for dropdown
  const dropdownAnimatedStyle = useAnimatedStyle(() => ({
    opacity: dropdownAnim.value,
    transform: [
      { translateY: interpolate(dropdownAnim.value, [0, 1], [8, 0]) },
      { scale: interpolate(dropdownAnim.value, [0, 1], [0.97, 1]) },
    ],
  }));

  // Toggle dropdown with animation
  const toggleModelSelector = useCallback(() => {
    if (showModelSelector) {
      // Close
      dropdownAnim.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.cubic) });
      setTimeout(() => setShowModelSelector(false), 150);
    } else {
      // Open
      setShowModelSelector(true);
      dropdownAnim.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    }
  }, [showModelSelector]);

  const closeDropdown = useCallback(() => {
    dropdownAnim.value = withTiming(0, { duration: 150 });
    setTimeout(() => setShowModelSelector(false), 150);
  }, []);

  // Get current model display name
  const currentModelName = useMemo(() => {
    const model = AI_MODELS.find(m => m.id === selectedModel);
    return model?.name || 'Claude 4';
  }, [selectedModel]);

  // Memoize currentTab to prevent infinite re-renders
  const currentTab = useMemo(() => {
    return tab || tabs.find(t => t.id === activeTabId);
  }, [tab, tabs, activeTabId]);

  // Always use tab-specific terminal items
  const tabTerminalItems = useMemo(() => currentTab?.terminalItems || [], [currentTab?.terminalItems]);
  const isLoading = currentTab?.isLoading || false;
  const hasChatStarted = tabTerminalItems.length > 0;



  // DEBUG: Log when terminal items count changes (reduced verbosity)
  useEffect(() => {
    // Only log significant changes (not every item)
    if (tabTerminalItems.length > 0 && tabTerminalItems.length % 5 === 0) {
      console.log(`💬 [ChatPage] Terminal items: ${tabTerminalItems.length} for tab ${currentTab?.id}`);
    }
  }, [tabTerminalItems.length, currentTab?.id]);

  // Custom input handler that saves to ref immediately (no extra re-renders)
  const handleInputChange = useCallback((text: string) => {
    previousInputRef.current = text;
    setInput(text);
    // Save to ref immediately - this won't trigger re-renders
    if (currentTab?.id) {
      tabInputsRef.current[currentTab.id] = text;
    }
  }, [currentTab?.id]);

  // Load input when tab changes (ONLY depends on tab ID)
  useEffect(() => {
    if (!currentTab?.id) return;

    // Only act if tab has actually changed
    if (previousTabIdRef.current !== currentTab.id) {
      // Load input for new tab
      const savedInput = tabInputsRef.current[currentTab.id] || '';
      setInput(savedInput);

      // Reset scroll padding when switching tabs to prevent content displacement
      // The keyboard listener will re-apply padding if keyboard is still open
      setScrollPaddingBottom(300);

      // Scroll to bottom of new tab after a brief delay
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
      }, 100);

      // Update previous tab reference
      previousTabIdRef.current = currentTab.id;
    }
  }, [currentTab?.id]); // ONLY depend on tab ID - NOT on input!

  const {
    hasInteracted,
    setGitHubUser,
    setGitHubRepositories,
    currentWorkstation,
  } = useTerminalStore();

  // Use tabTerminalItems directly (already memoized above)
  const terminalItems = tabTerminalItems;

  // Set loading state for current tab
  const setLoading = (loading: boolean) => {
    if (currentTab) {
      updateTab(currentTab.id, { isLoading: loading });
    }
  };

  // Always add item to tab-specific storage
  const addTerminalItem = useCallback((item: any) => {
    if (!currentTab) return;

    console.log('💾 Adding item to tab:', currentTab.id);
    // Use atomic function from store to avoid race conditions
    addTerminalItemToStore(currentTab.id, item);
  }, [currentTab, addTerminalItemToStore]);

  // Scroll to end when items count changes OR last item content updates (streaming)
  const lastItemContent = terminalItems[terminalItems.length - 1]?.content;
  useEffect(() => {
    if (terminalItems.length > 0) {
      // Use animated: true for smooth "following" effect
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  }, [terminalItems.length, lastItemContent]);

  // Load file history from storage on mount
  useEffect(() => {
    useFileHistoryStore.getState().loadHistory();
  }, []);

  // Handle plan approval modal for planning mode
  useEffect(() => {
    if (agentMode === 'planning' && agentPlan && !showPlanApproval) {
      setShowPlanApproval(true);
    }
  }, [agentPlan, agentMode, showPlanApproval]);

  // Process agent events for todos, questions, and sub-agents
  useEffect(() => {
    if (!agentEvents || agentEvents.length === 0) return;

    // Extract latest todo_update event
    const todoEvents = agentEvents.filter((e: any) => e.type === 'todo_update');
    if (todoEvents.length > 0) {
      const latestTodo = todoEvents[todoEvents.length - 1];
      setCurrentTodos((latestTodo as any).todos || []);
    }

    // Extract latest ask_user_question event
    const questionEvents = agentEvents.filter((e: any) => e.type === 'ask_user_question');
    if (questionEvents.length > 0) {
      const latestQuestion = questionEvents[questionEvents.length - 1];
      setPendingQuestion((latestQuestion as any).questions || null);
    }

    // Extract latest sub_agent_start event
    const subAgentStartEvents = agentEvents.filter((e: any) => e.type === 'sub_agent_start');
    const subAgentCompleteEvents = agentEvents.filter((e: any) => e.type === 'sub_agent_complete');

    if (subAgentCompleteEvents.length > subAgentStartEvents.length - 1) {
      // Sub-agent completed
      setCurrentSubAgent(null);
    } else if (subAgentStartEvents.length > 0) {
      const latestSubAgent = subAgentStartEvents[subAgentStartEvents.length - 1];
      setCurrentSubAgent({
        id: (latestSubAgent as any).agentId,
        type: (latestSubAgent as any).agentType,
        description: (latestSubAgent as any).description,
        iteration: (latestSubAgent as any).iteration || 0,
        maxIterations: (latestSubAgent as any).maxIterations || 50,
        status: 'running',
      });
    }
  }, [agentEvents]);

  // Replace AgentProgress with normal message when agent completes without tool calls
  useEffect(() => {
    if (!agentStreaming && agentEvents.length > 0 && currentTab?.id) {
      // Check if there were any tool calls
      const hadToolCalls = agentEvents.some(e =>
        e.type === 'tool_start' || e.type === 'tool_complete'
      );

      // If no tool calls, extract messages and replace AgentProgress with normal output
      if (!hadToolCalls) {
        const messages = agentEvents
          .filter(e => e.type === 'message')
          .map(e => (e as any).content || (e as any).message)
          .filter(Boolean);

        if (messages.length > 0) {
          // Find if AgentProgress item exists
          const hasAgentProgress = currentTab.terminalItems?.some(item => (item as any).isAgentProgress);

          if (hasAgentProgress) {
            // Get the last message
            const finalMessage = messages[messages.length - 1];

            // Replace AgentProgress with normal message in a single setState
            useTabStore.setState((state) => ({
              tabs: state.tabs.map(t =>
                t.id === currentTab.id
                  ? {
                    ...t,
                    terminalItems: [
                      ...(t.terminalItems?.filter(item => !(item as any).isAgentProgress) || []),
                      {
                        id: `agent-msg-${Date.now()}`,
                        content: finalMessage,
                        type: TerminalItemType.OUTPUT,
                        timestamp: new Date(),
                      }
                    ]
                  }
                  : t
              )
            }));
          }
        }
      }
    }
  }, [agentStreaming, agentEvents.length, currentTab?.id]);

  // Scroll to end when keyboard opens to show last messages
  useEffect(() => {
    const keyboardDidShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardDidShow' : 'keyboardDidShow',
      () => {
        if (hasChatStarted && terminalItems.length > 0) {
          // Delay scroll slightly to ensure layout has updated
          setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      }
    );

    return () => {
      keyboardDidShow.remove();
    };
  }, [hasChatStarted, terminalItems.length]);

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
        // Update scroll padding to prevent messages going under widget
        // Reduced padding to prevent content going too high
        const extraPadding = e.endCoordinates.height - insets.bottom + 80;
        setScrollPaddingBottom(300 + extraPadding);

        // Force scroll to end after padding update
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 150);
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
      inputPositionAnim.value = 0;
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
    if (input.trim() && !forcedMode) {
      setIsTerminalMode(isCommand(input.trim()));
    }
  }, [input, forcedMode]);

  useEffect(() => {
    // Animazione quando cambia il toggle
    if (isTerminalMode) {
      scaleAnim.value = withSpring(1.2, { duration: 100 });
      scaleAnim.value = withSpring(1, { duration: 100 });
    } else {
      scaleAnim.value = withSpring(1.2, { duration: 100 });
      scaleAnim.value = withSpring(1, { duration: 100 });
    }
  }, [isTerminalMode]);

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
    const paddingLeft = interpolate(
      sidebarTranslateX.value,
      [-50, 0],
      [0, 44],
      Extrapolate.CLAMP
    );

    return {
      paddingLeft,
    };
  });

  const inputWrapperAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    const animProgress = inputPositionAnim.value;

    // Calcola left in base allo stato della sidebar
    const sidebarLeft = interpolate(
      sidebarTranslateX.value,
      [-50, 0],
      [0, 44],
      Extrapolate.CLAMP
    );

    // Se la tastiera è aperta, usa bottom positioning (appena sopra la tastiera)
    if (keyboardHeight.value > 0) {
      return {
        bottom: keyboardHeight.value,
        left: sidebarLeft,
        top: undefined,
        transform: []
      };
    }

    // Altrimenti usa top + translateY (comportamento normale)
    const baseTranslateY = interpolate(
      animProgress,
      [0, 1],
      [0, 280], // Sposta 280px verso il basso quando chat si avvia
      Extrapolate.CLAMP
    );

    // Compensa la crescita del widget
    const heightDiff = Math.max(0, widgetHeight.value - 90);
    const translateY = baseTranslateY - heightDiff;

    return {
      top: 410,
      left: sidebarLeft,
      bottom: undefined,
      transform: [{ translateY }]
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



  const handleToggleMode = (mode: 'fast' | 'planning') => {
    // Switch between fast and planning agent modes
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

  const isCommand = (text: string): boolean => {
    const commandPrefixes = ['ls', 'cd', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'echo', 'touch', 'grep', 'find', 'chmod', 'chown', 'ps', 'kill', 'top', 'df', 'du', 'tar', 'zip', 'unzip', 'wget', 'curl', 'git', 'npm', 'node', 'python', 'pip', 'java', 'gcc', 'make', 'docker', 'kubectl'];
    const firstWord = text.trim().split(' ')[0].toLowerCase();
    return commandPrefixes.includes(firstWord) || text.includes('&&') || text.includes('|') || text.includes('>');
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

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
    Keyboard.dismiss();

    const userMessage = input.trim();

    // Check if agent mode is active (fast or planning)
    const isAgentMode = agentMode === 'fast' || agentMode === 'planning';

    // If agent mode AND we have a workstation, use agent stream
    if (isAgentMode && currentWorkstation?.id) {
      // Add user message to terminal
      addTerminalItem({
        id: Date.now().toString(),
        content: userMessage,
        type: TerminalItemType.USER_MESSAGE,
        timestamp: new Date(),
      });

      setInput('');
      setLoading(true);

      // Store the prompt in the agent store
      setCurrentPrompt(userMessage);
      setCurrentProjectId(currentWorkstation.id);

      // Start agent stream
      startAgent(userMessage, currentWorkstation.id);

      // Add agent progress placeholder
      const agentProgressId = `agent-progress-${Date.now()}`;
      addTerminalItem({
        id: agentProgressId,
        content: '',
        type: TerminalItemType.OUTPUT,
        timestamp: new Date(),
        isAgentProgress: true,
      });

      setLoading(false);
      return;
    }

    // Auto-save chat on first message - check if this is the first USER message (not system messages)
    const userMessages = currentTab?.terminalItems?.filter(item =>
      item.type === TerminalItemType.USER_MESSAGE || item.type === TerminalItemType.COMMAND
    ) || [];
    const isFirstMessage = userMessages.length === 0;

    if (isFirstMessage && currentTab?.type === 'chat' && currentTab.data?.chatId) {
      const chatId = currentTab.data.chatId;
      const existingChat = useTerminalStore.getState().chatHistory.find(c => c.id === chatId);

      // Generate title from first message
      let title = userMessage.slice(0, 50);
      const punctuationIndex = title.search(/[.!?]/);
      if (punctuationIndex > 10) {
        title = title.slice(0, punctuationIndex);
      }
      if (userMessage.length > 50) title += '...';

      if (existingChat) {
        // Chat already exists, update description and lastUsed
        // Only update title if it's still the default (not manually renamed by user)
        const wasManuallyRenamed = existingChat.title !== 'Nuova Conversazione';
        const finalTitle = wasManuallyRenamed ? existingChat.title : title;

        useTerminalStore.getState().updateChat(chatId, {
          title: finalTitle,
          description: userMessage.slice(0, 100),
          lastUsed: new Date(),
          repositoryId: existingChat.repositoryId || currentWorkstation?.id,
          repositoryName: existingChat.repositoryName || currentWorkstation?.name,
        });

        // Update tab title to match chat title (only if not manually renamed)
        if (!wasManuallyRenamed) {
          updateTab(currentTab.id, { title: finalTitle });
        }
      } else {
        // Chat doesn't exist yet, create it now
        const newChat = {
          id: chatId,
          title: title,
          description: userMessage.slice(0, 100),
          createdAt: new Date(),
          lastUsed: new Date(),
          messages: [],
          aiModel: 'llama-3.1-8b-instant',
          repositoryId: currentWorkstation?.id,
          repositoryName: currentWorkstation?.name,
        };

        console.log('✨ Creating new chat:', { chatId, title });
        useTerminalStore.getState().addChat(newChat);

        // Update tab title to match chat title
        updateTab(currentTab.id, { title: title });
      }
    } else if (currentTab?.type === 'chat' && currentTab.data?.chatId) {
      // Update lastUsed for existing chat
      useTerminalStore.getState().updateChatLastUsed(currentTab.data.chatId);
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
    // This ensures "Thinking..." appears right away without depending on parent isLoading state
    if (!shouldExecuteCommand) {
      addTerminalItem({
        id: streamingMessageId,
        content: '',
        type: TerminalItemType.OUTPUT,
        timestamp: new Date(),
        isThinking: true,
      });
    }

    setLoading(true);

    try {
      if (shouldExecuteCommand) {
        // Terminal mode - execute command
        const response = await axios.post(
          `${process.env.EXPO_PUBLIC_API_URL}/terminal/execute`,
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
        // This delay ensures the placeholder is visible before any API response arrives
        await new Promise(resolve => setTimeout(resolve, 400));

        // Track when we started to ensure minimum "Thinking..." display time
        const thinkingStartTime = Date.now();
        const MIN_THINKING_TIME = 500; // Show "Thinking..." for at least 500ms total
        let hasShownFirstContent = false;

        // Use XMLHttpRequest for streaming (works in React Native)
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.open('POST', `${process.env.EXPO_PUBLIC_API_URL}/ai/chat`);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.timeout = 60000; // 60 second timeout

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
                  const parsed = JSON.parse(data);

                  // Handle tool results from backend
                  if (parsed.toolResult) {
                    const { name, args, result } = parsed.toolResult;
                    console.log('🎯 Tool result received:', name, args);

                    // CRITICAL: Clear isThinking on current streaming message before creating new one
                    useTabStore.setState((state) => ({
                      tabs: state.tabs.map(t =>
                        t.id === tab.id
                          ? {
                            ...t,
                            terminalItems: t.terminalItems?.map(item =>
                              item.id === streamingMessageId
                                ? { ...item, isThinking: false }
                                : item
                            )
                          }
                          : t
                      )
                    }));

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
                      console.log('📝 [Undo] Recorded modification for:', undoData.filePath);
                    }

                    // Format the result based on tool type (Claude Code style)
                    let formattedOutput = '';

                    if (name === 'read_file') {
                      const lines = cleanResult.split('\n').length;
                      const fileName = args.filePath.split('/').pop() || args.filePath;
                      // Include both header and content
                      formattedOutput = `Read ${fileName}\n└─ ${lines} line${lines !== 1 ? 's' : ''}\n\n${cleanResult}`;
                    } else if (name === 'write_file') {
                      const fileName = args.filePath.split('/').pop() || args.filePath;
                      formattedOutput = `Write ${fileName}\n└─ File created\n\n${cleanResult}`;
                    } else if (name === 'edit_file') {
                      const fileName = args.filePath.split('/').pop() || args.filePath;
                      formattedOutput = `Edit ${fileName}\n└─ File modified\n\n${cleanResult}`;
                    } else if (name === 'list_files') {
                      const fileCount = cleanResult.split('\n').filter((line: string) => line.trim()).length;
                      formattedOutput = `List files in ${args.directory || '.'}\n└─ ${fileCount} file${fileCount !== 1 ? 's' : ''}\n\n${cleanResult}`;
                    } else if (name === 'search_in_files') {
                      const matches = cleanResult.split('\n').filter((line: string) => line.includes(':')).length;
                      formattedOutput = `Search "${args.pattern}"\n└─ ${matches} match${matches !== 1 ? 'es' : ''}\n\n${cleanResult}`;
                    } else if (name === 'execute_command') {
                      formattedOutput = `Execute: ${args.command}\n└─ Command completed\n\n${cleanResult}`;
                    } else if (name === 'glob_files') {
                      // For glob_files, just use the result as-is (it's already formatted from backend)
                      formattedOutput = cleanResult;
                    } else if (name === 'list_directory') {
                      formattedOutput = `List directory: ${args.dirPath || '.'}\n└─ Completed\n\n${cleanResult}`;
                    } else if (name === 'create_folder') {
                      formattedOutput = `Create folder: ${args.folderPath}\n└─ Completed\n\n${cleanResult}`;
                    } else if (name === 'delete_file') {
                      formattedOutput = `Delete: ${args.filePath}\n└─ Completed\n\n${cleanResult}`;
                    } else if (name === 'move_file') {
                      formattedOutput = `Move: ${args.sourcePath} → ${args.destPath}\n└─ Completed\n\n${cleanResult}`;
                    } else if (name === 'copy_file') {
                      formattedOutput = `Copy: ${args.sourcePath} → ${args.destPath}\n└─ Completed\n\n${cleanResult}`;
                    } else if (name === 'web_fetch') {
                      const urlShort = args.url.length > 50 ? args.url.substring(0, 50) + '...' : args.url;
                      formattedOutput = `Fetch: ${urlShort}\n└─ Completed\n\n${cleanResult.substring(0, 2000)}${cleanResult.length > 2000 ? '...' : ''}`;
                    } else if (name === 'think') {
                      formattedOutput = `💭 ${cleanResult}`;
                    } else {
                      // Generic format for other tools - include result
                      formattedOutput = `${name}\n└─ Completed\n\n${cleanResult}`;
                    }

                    // Add tool result as a separate terminal item
                    const toolResultId = `tool-result-${Date.now()}`;
                    useTabStore.setState((state) => ({
                      tabs: state.tabs.map(t =>
                        t.id === tab.id
                          ? {
                            ...t,
                            terminalItems: [
                              ...(t.terminalItems || []),
                              {
                                id: toolResultId,
                                type: TerminalItemType.OUTPUT,
                                content: formattedOutput,
                                timestamp: new Date()
                              }
                            ]
                          }
                          : t
                      )
                    }));

                    // IMPORTANT: Create a new streaming message for text after the tool
                    // This ensures text before and after tool execution are separate messages
                    streamingMessageId = `stream-after-tool-${Date.now()}`;
                    streamedContent = '';

                    addTerminalItem({
                      id: streamingMessageId,
                      content: '',
                      type: TerminalItemType.OUTPUT,
                      timestamp: new Date(),
                    });
                  }
                  // OPTIMIZATION 15: Handle batched tool results (multiple tools executed in parallel)
                  else if (parsed.toolResultsBatch) {
                    const { toolResultsBatch, executionTime, count } = parsed;
                    console.log(`🎯 Batch of ${count} tool results received (executed in ${executionTime})`);

                    // CRITICAL: Clear isThinking on current streaming message before creating new one
                    useTabStore.setState((state) => ({
                      tabs: state.tabs.map(t =>
                        t.id === tab.id
                          ? {
                            ...t,
                            terminalItems: t.terminalItems?.map(item =>
                              item.id === streamingMessageId
                                ? { ...item, isThinking: false }
                                : item
                            )
                          }
                          : t
                      )
                    }));

                    // 🚀 OPTIMIZATION: Format ALL tool results FIRST, then add them ALL at once
                    const formattedToolItems = toolResultsBatch.map((toolResult: any, index: number) => {
                      const { name, args, result } = toolResult;

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
                        console.log('📝 [Undo] Recorded batch modification for:', undoData.filePath);
                      }

                      // Format the result based on tool type (Claude Code style)
                      let formattedOutput = '';

                      if (name === 'read_file') {
                        const lines = cleanResult.split('\n').length;
                        const fileName = args.filePath.split('/').pop() || args.filePath;
                        formattedOutput = `Read ${fileName}\n└─ ${lines} line${lines !== 1 ? 's' : ''}\n\n${cleanResult}`;
                      } else if (name === 'write_file') {
                        const fileName = args.filePath.split('/').pop() || args.filePath;
                        formattedOutput = `Write ${fileName}\n└─ File created\n\n${cleanResult}`;
                      } else if (name === 'edit_file') {
                        const fileName = args.filePath.split('/').pop() || args.filePath;
                        formattedOutput = `Edit ${fileName}\n└─ File modified\n\n${cleanResult}`;
                      } else if (name === 'list_files') {
                        const fileCount = cleanResult.split('\n').filter((line: string) => line.trim()).length;
                        formattedOutput = `List files in ${args.directory || '.'}\n└─ ${fileCount} file${fileCount !== 1 ? 's' : ''}\n\n${cleanResult}`;
                      } else if (name === 'search_in_files') {
                        const matches = cleanResult.split('\n').filter((line: string) => line.includes(':')).length;
                        formattedOutput = `Search "${args.pattern}"\n└─ ${matches} match${matches !== 1 ? 'es' : ''}\n\n${cleanResult}`;
                      } else if (name === 'execute_command') {
                        formattedOutput = `Execute: ${args.command}\n└─ Command completed\n\n${cleanResult}`;
                      } else if (name === 'glob_files') {
                        formattedOutput = cleanResult;
                      } else if (name === 'list_directory') {
                        formattedOutput = `List directory: ${args.dirPath || '.'}\n└─ Completed\n\n${cleanResult}`;
                      } else if (name === 'create_folder') {
                        formattedOutput = `Create folder: ${args.folderPath}\n└─ Completed\n\n${cleanResult}`;
                      } else if (name === 'delete_file') {
                        formattedOutput = `Delete: ${args.filePath}\n└─ Completed\n\n${cleanResult}`;
                      } else if (name === 'move_file') {
                        formattedOutput = `Move: ${args.sourcePath} → ${args.destPath}\n└─ Completed\n\n${cleanResult}`;
                      } else if (name === 'copy_file') {
                        formattedOutput = `Copy: ${args.sourcePath} → ${args.destPath}\n└─ Completed\n\n${cleanResult}`;
                      } else if (name === 'web_fetch') {
                        const urlShort = args.url.length > 50 ? args.url.substring(0, 50) + '...' : args.url;
                        formattedOutput = `Fetch: ${urlShort}\n└─ Completed\n\n${cleanResult.substring(0, 2000)}${cleanResult.length > 2000 ? '...' : ''}`;
                      } else if (name === 'think') {
                        formattedOutput = `💭 ${cleanResult}`;
                      } else {
                        formattedOutput = `${name}\n└─ Completed\n\n${cleanResult}`;
                      }

                      return {
                        id: `tool-result-${Date.now()}-${name}-${index}`,
                        type: TerminalItemType.OUTPUT,
                        content: formattedOutput,
                        timestamp: new Date()
                      };
                    });

                    // ⚡ Add ALL tool results in a SINGLE setState call (shows them all at once!)
                    useTabStore.setState((state) => ({
                      tabs: state.tabs.map(t =>
                        t.id === tab.id
                          ? {
                            ...t,
                            terminalItems: [
                              ...(t.terminalItems || []),
                              ...formattedToolItems // Spread all items at once
                            ]
                          }
                          : t
                      )
                    }));

                    // IMPORTANT: Create a new streaming message for text after the batched tools
                    streamingMessageId = `stream-after-batch-${Date.now()}`;
                    streamedContent = '';

                    addTerminalItem({
                      id: streamingMessageId,
                      content: '',
                      type: TerminalItemType.OUTPUT,
                      timestamp: new Date(),
                    });
                  }
                  // Handle function call in progress (Gemini sends this before executing tool)
                  else if (parsed.functionCall) {
                    const { name, args } = parsed.functionCall;
                    console.log('🔧 Function call in progress:', name);

                    // CRITICAL: Clear isThinking on current streaming message before creating new one
                    useTabStore.setState((state) => ({
                      tabs: state.tabs.map(t =>
                        t.id === tab.id
                          ? {
                            ...t,
                            terminalItems: t.terminalItems?.map(item =>
                              item.id === streamingMessageId
                                ? { ...item, isThinking: false }
                                : item
                            )
                          }
                          : t
                      )
                    }));

                    // Add a "tool executing" indicator to the terminal
                    // Format: "Executing: tool_name" - will be styled in TerminalItem
                    const toolIndicatorId = `tool-${Date.now()}-${name}`;
                    addTerminalItem({
                      id: toolIndicatorId,
                      content: `Executing: ${name}`,
                      type: TerminalItemType.OUTPUT,
                      timestamp: new Date(),
                    });

                    // IMPORTANT: Create a new streaming message for text AFTER the tool call
                    // This prevents the AI's text from being "split" around the tool indicator
                    streamingMessageId = `stream-after-tool-${Date.now()}`;
                    streamedContent = '';

                    addTerminalItem({
                      id: streamingMessageId,
                      content: '',
                      type: TerminalItemType.OUTPUT,
                      timestamp: new Date(),
                    });
                  }
                  // Handle text responses
                  else if (parsed.text) {
                    streamedContent += parsed.text;

                    // Function to update UI with content
                    const updateContent = () => {
                      useTabStore.setState((state) => ({
                        tabs: state.tabs.map(t =>
                          t.id === tab.id
                            ? {
                              ...t,
                              terminalItems: t.terminalItems?.map(item =>
                                item.id === streamingMessageId
                                  ? { ...item, content: streamedContent, isThinking: false }
                                  : item
                              )
                            }
                            : t
                        )
                      }));
                    };

                    // For first content, ensure minimum "Thinking..." display time
                    if (!hasShownFirstContent) {
                      hasShownFirstContent = true;
                      const elapsed = Date.now() - thinkingStartTime;
                      const remaining = MIN_THINKING_TIME - elapsed;

                      if (remaining > 0) {
                        // Wait for remaining time before showing content
                        setTimeout(updateContent, remaining);
                      } else {
                        // Already waited enough, show immediately
                        updateContent();
                      }
                    } else {
                      // After first content, update immediately
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
            // Include username for multi-user context
            username: (useTerminalStore.getState().userId || 'anonymous').split('@')[0].replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(),
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

          // Detect tool calls from the AI's response
          const toolCalls = ToolService.detectToolCalls(streamedContent);

          if (toolCalls.length > 0) {
            // Set flag to prevent duplicate processing
            isProcessingToolsRef.current = true;
            console.log('🔧 Processing', toolCalls.length, 'tool calls');

            // Split content into before and after tool calls
            const firstToolCallMatch = streamedContent.match(/(read_file|write_file|list_files|search_in_files)\s*\(/);
            const toolCallIndex = firstToolCallMatch ? streamedContent.indexOf(firstToolCallMatch[0]) : -1;

            let beforeToolCall = streamedContent;
            let afterToolCall = '';

            if (toolCallIndex !== -1) {
              beforeToolCall = streamedContent.substring(0, toolCallIndex).trim();
              // Find where tool call ends and extract text after it
              const afterToolCallStart = streamedContent.substring(toolCallIndex);
              const toolCallEnd = afterToolCallStart.indexOf('\n');
              if (toolCallEnd !== -1) {
                afterToolCall = afterToolCallStart.substring(toolCallEnd + 1).trim();
              }
            }

            // Clean the AI message by removing tool call syntax (keep only before part)
            const cleanedContent = ToolService.removeToolCallsFromText(beforeToolCall);

            // Update the AI message to show only the part before tool call
            useTabStore.setState((state) => ({
              tabs: state.tabs.map(t =>
                t.id === currentTab?.id
                  ? {
                    ...t,
                    terminalItems: t.terminalItems?.map(item =>
                      item.id === streamingMessageId
                        ? { ...item, content: cleanedContent }
                        : item
                    )
                  }
                  : t
              )
            }));

            // Execute each tool call in separate terminal items (as bash commands)
            for (const toolCall of toolCalls) {
              // For write_file and edit_file, only show output (no command)
              if (toolCall.tool === 'write_file' || toolCall.tool === 'edit_file') {
                // Execute the tool
                const result = await ToolService.executeTool(projectId, toolCall);

                // Show only the output (formatted edit)
                addTerminalItem({
                  id: (Date.now() + Math.random()).toString(),
                  content: result,
                  type: TerminalItemType.OUTPUT,
                  timestamp: new Date(),
                });

                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
              }

              // Format command based on tool type (for other tools)
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

              // Add as bash command
              addTerminalItem({
                id: (Date.now() + Math.random()).toString(),
                content: commandText,
                type: TerminalItemType.COMMAND,
                timestamp: new Date(),
              });

              // Small delay for visual separation
              await new Promise(resolve => setTimeout(resolve, 100));

              // Execute the tool and show result as output
              const result = await ToolService.executeTool(projectId, toolCall);

              addTerminalItem({
                id: (Date.now() + Math.random()).toString(),
                content: result,
                type: TerminalItemType.OUTPUT,
                timestamp: new Date(),
              });

              // Small delay between tools
              await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Add the text that came after the tool call (AI's response after tool execution)
            if (afterToolCall) {
              const cleanedAfterToolCall = ToolService.removeToolCallsFromText(afterToolCall);
              if (cleanedAfterToolCall.trim()) {
                addTerminalItem({
                  id: (Date.now() + Math.random()).toString(),
                  content: cleanedAfterToolCall,
                  type: TerminalItemType.OUTPUT,
                  timestamp: new Date(),
                });
              }
            }

            // Update streamedContent for conversation history
            // Include both before and after tool call text, but not the tool output
            streamedContent = cleanedContent + (afterToolCall ? '\n' + ToolService.removeToolCallsFromText(afterToolCall) : '');

            // Reset flag after processing
            isProcessingToolsRef.current = false;
          }
        }

        // Update conversation history with both user message and AI response
        setConversationHistory([...conversationHistory, userMessage, streamedContent]);
      }
    } catch (error) {
      console.error('❌ [ChatPage] AI request failed:', error);

      // Remove isThinking from the placeholder item so "Thinking..." disappears
      useTabStore.setState((state) => ({
        tabs: state.tabs.map(t =>
          t.id === tab.id
            ? {
              ...t,
              terminalItems: t.terminalItems?.map(item =>
                item.id === streamingMessageId
                  ? { ...item, isThinking: false, content: '' }
                  : item
              ).filter(item => item.content !== '' || item.isThinking) // Remove empty items
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
      if (currentTab?.type === 'chat' && currentTab.data?.chatId) {
        const chatId = currentTab.data.chatId;
        const existingChat = useTerminalStore.getState().chatHistory.find(c => c.id === chatId);

        if (existingChat) {
          // Get fresh tab state from store to ensure we have latest messages
          const freshTab = useTabStore.getState().tabs.find(t => t.id === currentTab.id);
          const updatedMessages = freshTab?.terminalItems || [];

          console.log('💾 Saving chat messages:', { chatId, messageCount: updatedMessages.length });

          useTerminalStore.getState().updateChat(chatId, {
            messages: updatedMessages,
            lastUsed: new Date(),
          });
        } else {
          console.log('⚠️ Chat not found in chatHistory:', chatId);
        }
      }
    }
  };

  return (
    <Animated.View style={[
      styles.container,
      cardDimensionsAnimatedStyle, // Animated width, height, borderRadius, marginTop, overflow
      cardBorderAnimatedStyle,
      animatedStyle
    ]}>
      {/* Content wrapper with sidebar offset */}
      <Animated.View style={[{ flex: 1, backgroundColor: '#0d0d0f' }, animatedContentStyle]}>
        {currentTab?.type === 'file' ? (
          <FileViewer
            visible={true}
            projectId={currentTab.data?.projectId || ''}
            filePath={currentTab.data?.filePath || ''}
            repositoryUrl={currentTab.data?.repositoryUrl || ''}
            userId={'anonymous'}
            onClose={() => { }}
          />
        ) : currentTab?.type === 'terminal' ? (
          <TerminalView
            terminalTabId={currentTab.id}
            sourceTabId={currentTab.data?.sourceTabId || currentTab.id}
          />
        ) : currentTab?.type === 'github' ? (
          <GitHubView tab={currentTab} />
        ) : currentTab?.type === 'browser' ? (
          <BrowserView tab={currentTab} />
        ) : currentTab?.type === 'preview' ? (
          <PreviewView tab={currentTab} />
        ) : currentTab?.type === 'envVars' ? (
          <EnvVarsView tab={currentTab} />
        ) : currentTab?.type === 'integration' ? (
          currentTab.data?.integration === 'supabase' ? (
            <SupabaseView tab={currentTab} />
          ) : currentTab.data?.integration === 'figma' ? (
            <FigmaView tab={currentTab} />
          ) : null
        ) : (
          <>
            {/* Chat background with gradient */}
            <LinearGradient
              colors={AppColors.gradient.dark}
              locations={[0, 0.3, 0.7, 1]}
              style={styles.background}
            >
              <View style={styles.glowTop} />
              <View style={styles.glowBottom} />
            </LinearGradient>
            <ScrollView
              ref={scrollViewRef}
              style={[styles.output, isCardMode && styles.outputCardMode]}
              contentContainerStyle={[styles.outputContent, { paddingBottom: scrollPaddingBottom }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >

              {terminalItems.length === 0 ? (
                <View style={styles.emptyState}>
                </View>
              ) : (
                <>
                  {(() => {
                    // Filter out null items, empty content items, and "Executing:" placeholders
                    // BUT: Keep items with isThinking=true or isAgentProgress=true even if content is empty
                    const filtered = terminalItems.filter(item =>
                      item &&
                      item.content != null &&
                      (item.content.trim() !== '' || item.isThinking || (item as any).isAgentProgress) &&  // Allow empty content if isThinking or isAgentProgress
                      item.content !== '...' &&  // Filter out placeholder ellipsis
                      !item.content.startsWith('Executing: ')  // Filter out tool execution indicators (replaced by tool results)
                    );

                    return filtered.reduce((acc, item, index, filteredArray) => {
                      // Skip OUTPUT items that follow a terminal COMMAND (they'll be grouped)
                      const prevItem = filteredArray[index - 1];
                      const isOutputAfterTerminalCommand =
                        item.type === TerminalItemType.OUTPUT &&
                        prevItem?.type === TerminalItemType.COMMAND &&
                        isCommand(prevItem.content || '');

                      if (isOutputAfterTerminalCommand) {
                        return acc;
                      }

                      // Check if next item exists and is not a user message
                      const nextItem = filteredArray[index + 1];
                      // Show thread line only if CURRENT item is NOT user message AND next item is NOT a user message
                      const isNextItemAI = item.type !== TerminalItemType.USER_MESSAGE &&
                        nextItem &&
                        nextItem.type !== TerminalItemType.USER_MESSAGE;
                      const isNextItemOutput = nextItem?.type === TerminalItemType.OUTPUT && !isCommand(nextItem.content || '');
                      const outputItem =
                        item.type === TerminalItemType.COMMAND &&
                          isCommand(item.content || '') &&
                          nextItem?.type === TerminalItemType.OUTPUT
                          ? nextItem
                          : undefined;

                      // Check if this is the last item and we're loading
                      const isLastItem = index === filteredArray.length - 1;
                      const shouldShowLoading = isLastItem && isLoading;

                      // Check if this is an agent progress item
                      if ((item as any).isAgentProgress) {
                        acc.push(
                          <AgentProgress
                            key={index}
                            events={agentEvents}
                            status={agentStreaming ? 'running' : 'complete'}
                            currentTool={agentCurrentTool}
                          />
                        );
                      } else {
                        acc.push(
                          <TerminalItemComponent
                            key={index}
                            item={item}
                            isNextItemOutput={isNextItemAI}
                            outputItem={outputItem}
                            isLoading={shouldShowLoading}
                          />
                        );
                      }
                      return acc;
                    }, [] as JSX.Element[]);
                  })()}

                  {/* Show TodoList if agent has active todos */}
                  {currentTodos.length > 0 && (
                    <TodoList todos={currentTodos} />
                  )}

                  {/* Show SubAgentStatus if a sub-agent is running */}
                  {currentSubAgent && (
                    <SubAgentStatus subAgent={currentSubAgent} />
                  )}
                </>
              )}
            </ScrollView>

            {/* AskUserQuestion Modal */}
            <AskUserQuestionModal
              visible={!!pendingQuestion}
              questions={pendingQuestion || []}
              onAnswer={(answers) => {
                // TODO: Send answers back to agent via SSE or API call
                console.log('User answers:', answers);
                setPendingQuestion(null);
              }}
              onCancel={() => {
                setPendingQuestion(null);
              }}
            />

            <Animated.View style={[
              styles.inputWrapper,
              isCardMode && styles.inputWrapperCardMode,
              inputWrapperAnimatedStyle
            ]}>
              <LinearGradient
                colors={[`${AppColors.dark.surface}F9`, `${AppColors.dark.surface}EB`]}
                style={styles.inputGradient}
                onLayout={(e) => {
                  // Aggiorna l'altezza del widget quando cambia
                  const newHeight = e.nativeEvent.layout.height;
                  widgetHeight.value = withTiming(newHeight, { duration: 100 });
                }}
              >
                {/* Top Controls */}
                <View style={styles.topControls}>
                  {/* Mode Toggle - 2-button system: Fast or Planning */}
                  <View style={styles.modeToggleContainer}>
                    <View style={styles.modeToggle}>
                      {/* Fast Agent Mode */}
                      <TouchableOpacity
                        onPress={() => handleToggleMode('fast')}
                        style={[
                          styles.modeButton,
                          agentMode === 'fast' && styles.modeButtonActive,
                        ]}
                      >
                        <Animated.View style={agentMode === 'fast' ? aiModeAnimatedStyle : undefined}>
                          <Ionicons
                            name="flash"
                            size={14}
                            color={agentMode === 'fast' ? AppColors.white.full : '#8A8A8A'}
                          />
                        </Animated.View>
                      </TouchableOpacity>

                      {/* Planning Agent Mode */}
                      <TouchableOpacity
                        onPress={() => handleToggleMode('planning')}
                        style={[
                          styles.modeButton,
                          agentMode === 'planning' && styles.modeButtonActive,
                        ]}
                      >
                        <Animated.View style={agentMode === 'planning' ? aiModeAnimatedStyle : undefined}>
                          <Ionicons
                            name="clipboard"
                            size={14}
                            color={agentMode === 'planning' ? AppColors.white.full : '#8A8A8A'}
                          />
                        </Animated.View>
                      </TouchableOpacity>
                    </View>

                    {/* Agent Status Badge - show when agent is running */}
                    {agentStreaming && (
                      <AgentStatusBadge
                        isRunning={agentStreaming}
                        currentTool={agentCurrentTool}
                        iteration={agentIteration}
                      />
                    )}
                  </View>

                  {/* Model Selector */}
                  <TouchableOpacity
                    style={styles.modelSelector}
                    onPress={toggleModelSelector}
                  >
                    <SafeText style={styles.modelText}>{currentModelName}</SafeText>
                    <Ionicons
                      name={showModelSelector ? "chevron-up" : "chevron-down"}
                      size={12}
                      color={AppColors.dark.bodyText}
                    />
                  </TouchableOpacity>
                </View>

                {/* Undo/Redo Bar - only show if there's a workstation with history */}
                {currentWorkstation?.id && (
                  <UndoRedoBar
                    projectId={currentWorkstation.id}
                    onUndoComplete={() => {
                      console.log('✅ [Undo] File restored');
                    }}
                    onRedoComplete={() => {
                      console.log('✅ [Redo] File re-applied');
                    }}
                  />
                )}

                {/* Main Input Row */}
                <View style={styles.mainInputRow}>
                  {/* Tools Button */}
                  <TouchableOpacity
                    style={styles.toolsButton}
                    onPress={toggleToolsSheet}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={24} color="#8A8A8A" />
                  </TouchableOpacity>

                  {/* Input Field */}
                  <TextInput
                    style={[styles.input, { textTransform: 'none' }]}
                    value={input}
                    onChangeText={handleInputChange}
                    placeholder={
                      agentMode === 'fast'
                        ? 'Fast agent - esecuzione diretta...'
                        : 'Planning agent - crea un piano...'
                    }
                    placeholderTextColor={AppColors.dark.bodyText}
                    multiline
                    maxLength={1000}
                    onSubmitEditing={handleSend}
                    keyboardAppearance="dark"
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    textContentType="none"
                    keyboardType="default"
                  />

                  {/* Send Button */}
                  <TouchableOpacity
                    onPress={handleSend}
                    disabled={!input.trim() || isLoading}
                    style={styles.sendButton}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="arrow-up-circle"
                      size={32}
                      color={input.trim() && !isLoading ? AppColors.primary : AppColors.dark.surfaceVariant}
                    />
                  </TouchableOpacity>

                </View>
              </LinearGradient>

              {/* Model Dropdown - positioned outside LinearGradient */}
              {showModelSelector && (
                <>
                  <Pressable
                    style={styles.dropdownOverlay}
                    onPress={closeDropdown}
                  />
                  <Animated.View style={[styles.modelDropdown, dropdownAnimatedStyle]}>
                    {AI_MODELS.map((model) => {
                      const IconComponent = model.IconComponent;
                      return (
                        <TouchableOpacity
                          key={model.id}
                          style={[
                            styles.modelDropdownItem,
                            selectedModel === model.id && styles.modelDropdownItemActive
                          ]}
                          onPress={() => {
                            setSelectedModel(model.id);
                            closeDropdown();
                          }}
                        >
                          <IconComponent size={16} />
                          <SafeText style={[
                            styles.modelDropdownText,
                            selectedModel === model.id && styles.modelDropdownTextActive
                          ]}>
                            {model.name}
                          </SafeText>
                          {selectedModel === model.id && (
                            <Ionicons name="checkmark" size={14} color={AppColors.primary} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </Animated.View>
                </>
              )}
            </Animated.View>
          </>
        )}
      </Animated.View>

      {/* Tools Bottom Sheet */}
      {showToolsSheet && (
        <Pressable style={StyleSheet.absoluteFill} onPress={toggleToolsSheet}>
          <Animated.View style={[styles.sheetBackdrop, toolsBackdropStyle]} />
        </Pressable>
      )}
      <Animated.View style={[styles.toolsSheet, toolsSheetStyle]}>
        <BlurView intensity={90} tint="dark" style={styles.sheetBlur}>
          <LinearGradient
            colors={['rgba(30, 30, 35, 0.4)', 'rgba(15, 15, 20, 0.6)']}
            style={styles.sheetGradient}
          >
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <Text style={styles.sheetHeaderTitle}>Drape</Text>
              <TouchableOpacity onPress={() => { }}>
                <Text style={styles.sheetHeaderAction}>Tutte le foto</Text>
              </TouchableOpacity>
            </View>

            {/* Photos Gallery */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryContainer}
            >
              <TouchableOpacity style={styles.cameraCard}>
                <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
                <Ionicons name="camera-outline" size={20} color="#fff" />
              </TouchableOpacity>
              {[1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={styles.galleryCard}>
                  <View style={styles.galleryImagePlaceholder}>
                    <Ionicons name="image-outline" size={18} color="rgba(255,255,255,0.2)" />
                  </View>
                  <View style={styles.gallerySelectCircle} />
                </View>
              ))}
            </ScrollView>

            <View style={styles.sheetDivider} />

            {/* Tools List */}
            <View style={styles.toolsList}>
              <TouchableOpacity style={styles.toolItem} activeOpacity={0.6}>
                <View style={styles.toolIconContainer}>
                  <Ionicons name="sparkles-outline" size={18} color="#fff" />
                </View>
                <View style={styles.toolTextContainer}>
                  <Text style={styles.toolTitle}>Crea immagine</Text>
                  <Text style={styles.toolSubtitle}>Rendi visibile ogni concetto</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolItem} activeOpacity={0.6}>
                <View style={styles.toolIconContainer}>
                  <Ionicons name="bulb-outline" size={18} color="#fff" />
                </View>
                <View style={styles.toolTextContainer}>
                  <Text style={styles.toolTitle}>Pensa</Text>
                  <Text style={styles.toolSubtitle}>Pensa più a lungo per risposte migliori</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolItem} activeOpacity={0.6}>
                <View style={styles.toolIconContainer}>
                  <Ionicons name="search-outline" size={18} color="#fff" />
                </View>
                <View style={styles.toolTextContainer}>
                  <Text style={styles.toolTitle}>Deep Research</Text>
                  <Text style={styles.toolSubtitle}>Ottieni un report dettagliato</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.toolItem} activeOpacity={0.6}>
                <View style={styles.toolIconContainer}>
                  <Ionicons name="globe-outline" size={18} color="#fff" />
                </View>
                <View style={styles.toolTextContainer}>
                  <Text style={styles.toolTitle}>Ricerca sul web</Text>
                  <Text style={styles.toolSubtitle}>Trova notizie e informazioni in tempo reale</Text>
                </View>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </BlurView>
      </Animated.View>

      {/* Plan Approval Modal - for planning mode */}
      <PlanApprovalModal
        visible={showPlanApproval}
        plan={agentPlan ? {
          title: `Plan for: ${agentCurrentPrompt || 'Task'}`,
          steps: agentPlan.steps.map(s => s.description),
          estimated_files: agentFilesCreated.length + agentFilesModified.length,
        } : null}
        onApprove={() => {
          setShowPlanApproval(false);
          // Execute the plan - switch to executing mode
          if (currentWorkstation?.id && agentCurrentPrompt) {
            // The agent will continue automatically
          }
        }}
        onReject={() => {
          setShowPlanApproval(false);
          resetAgent();
          setLoading(false);
        }}
        onClose={() => {
          setShowPlanApproval(false);
        }}
      />
    </Animated.View>
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
  glowTop: {
    position: 'absolute',
    top: -100,
    left: -50,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: AppColors.primaryAlpha.a08,
    opacity: 0.6,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -150,
    right: -80,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: AppColors.primaryAlpha.a05,
    opacity: 0.5,
  },
  inputWrapper: {
    position: 'absolute',
    right: 0,
    pointerEvents: 'box-none',
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
    borderRadius: 28,
    zIndex: 2000,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
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
    paddingLeft: 16,
    paddingTop: 100, // Further increased to add space below TabBar
  },
  outputCardMode: {
    paddingLeft: 0, // Remove sidebar offset in card mode
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
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
  }, outputContent: {
    padding: 20,
    paddingTop: 20, // Reduced since output already has paddingTop:80
    // paddingBottom managed dynamically via state
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  inputGradient: {
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: AppColors.primaryAlpha.a15,
    elevation: 8,
    justifyContent: 'flex-end', // Fa crescere il contenuto verso l'alto
    maxHeight: 250, // Limite massimo dell'intero widget
    marginHorizontal: 16, // Margine orizzontale per restringere la card
    overflow: 'visible',
    zIndex: 10,
  },
  topControls: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.dark.surfaceAlt,
    padding: 2,
  },
  autoLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: AppColors.primary,
    letterSpacing: 0.3,
  },
  modeButton: {
    width: 28,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  modeButtonActive: {
    backgroundColor: AppColors.primaryAlpha.a20,
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
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: AppColors.dark.surfaceAlt,
    gap: 4,
  },
  modelText: {
    fontSize: 10,
    color: AppColors.icon.default,
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
    backgroundColor: '#242428',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 6,
    paddingHorizontal: 4,
    minWidth: 150,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
  },
  modelDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderRadius: 10,
    marginHorizontal: 2,
    marginVertical: 2,
  },
  modelDropdownItemActive: {
    backgroundColor: AppColors.primaryAlpha.a15,
  },
  modelDropdownText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  modelDropdownTextActive: {
    color: AppColors.white.full,
    fontWeight: '600',
  },
  mainInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toolsButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: AppColors.dark.titleText,
    fontFamily: 'monospace',
    paddingHorizontal: 16,
    paddingVertical: 14,
    maxHeight: 150, // Altezza massima del campo di input
    lineHeight: 20,
    textAlignVertical: 'top', // Allinea il testo in alto nel campo
  },
});
export default ChatPage;
