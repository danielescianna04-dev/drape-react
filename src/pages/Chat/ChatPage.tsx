import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Keyboard, Modal, Pressable } from 'react-native';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSidebarOffset } from '../../features/terminal/context/SidebarContext';
import { useChatState } from '../../hooks/business/useChatState';
import { useContentOffset } from '../../hooks/ui/useContentOffset';

const colors = AppColors.dark;

// Available AI models
const AI_MODELS = [
  { id: 'claude-sonnet-4', name: 'Claude 4', icon: 'sparkles' as const },
  { id: 'gpt-oss-120b', name: 'GPT 120B', icon: 'flash' as const },
  { id: 'gpt-oss-20b', name: 'GPT 20B', icon: 'flash-outline' as const },
  { id: 'llama-4-scout', name: 'Llama 4', icon: 'paw' as const },
  { id: 'qwen-3-32b', name: 'Qwen 3', icon: 'code-slash' as const },
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
  const contentAnimatedStyle = useContentOffset();

  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const { sidebarTranslateX } = useSidebarOffset();

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

  const { tabs, activeTabId, updateTab, addTerminalItem: addTerminalItemToStore } = useTabStore();

  // Model selector modal state
  const [showModelSelector, setShowModelSelector] = useState(false);

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

  // DEBUG: Log when terminal items change
  useEffect(() => {
    console.log('💬💬💬 [ChatPage] === TERMINAL ITEMS UPDATED ===');
    console.log('💬 [ChatPage] currentTab?.id:', currentTab?.id);
    console.log('💬 [ChatPage] activeTabId:', activeTabId);
    console.log('💬 [ChatPage] tabTerminalItems.length:', tabTerminalItems.length);
    if (tabTerminalItems.length > 0) {
      console.log('💬 [ChatPage] Items:');
      tabTerminalItems.forEach((item, i) => {
        console.log(`   ${i}: type="${item.type}", content="${item.content?.substring(0, 50)}..."`);
      });
    }
  }, [tabTerminalItems, currentTab?.id, activeTabId]);

  // Custom input handler that saves to ref immediately (no extra re-renders)
  const handleInputChange = useCallback((text: string) => {
    const previousText = previousInputRef.current;
    let correctedText = text;

    // FIX: Invert case only for NEW characters to counteract keyboard's inverted caps lock
    if (text.length > previousText.length && text.startsWith(previousText)) {
      // New characters were added at the end
      const newChars = text.slice(previousText.length);
      const invertedNewChars = newChars.split('').map(char => {
        if (/[a-zA-Z]/.test(char)) {
          return char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase();
        }
        return char;
      }).join('');
      correctedText = previousText + invertedNewChars;
    } else if (text.length < previousText.length) {
      // Characters were deleted - use as is
      correctedText = text;
    } else if (text !== previousText) {
      // Text was modified (e.g., character replaced) - invert the whole thing
      correctedText = text.split('').map(char => {
        if (/[a-zA-Z]/.test(char)) {
          return char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase();
        }
        return char;
      }).join('');
    }

    previousInputRef.current = correctedText;
    setInput(correctedText);
    // Save to ref immediately - this won't trigger re-renders
    if (currentTab?.id) {
      tabInputsRef.current[currentTab.id] = correctedText;
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

  // Scroll to end when items count changes (not the array reference)
  const itemsCount = terminalItems.length;
  useEffect(() => {
    if (itemsCount > 0) {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  }, [itemsCount]);

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

  const inputWrapperAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    const animProgress = inputPositionAnim.value;

    // Anima da top:410 (centro) verso posizione più bassa (ma non troppo)
    const baseTranslateY = interpolate(
      animProgress,
      [0, 1],
      [0, 280], // Sposta 280px verso il basso quando chat si avvia
      Extrapolate.CLAMP
    );

    // Calcola l'offset extra per compensare la crescita del widget
    // widgetHeight inizia a 90px, quando cresce (es. 150px), compensiamo con 60px in più
    const heightDiff = Math.max(0, widgetHeight.value - 90);

    // Always maintain 8px distance from keyboard
    let translateY = baseTranslateY;

    if (keyboardHeight.value > 0) {
      // Calculate keyboard offset maintaining 8px distance
      const fullKeyboardOffset = keyboardHeight.value - insets.bottom + 8;

      // Interpolate keyboard offset smoothly based on widget position
      // When centered (animProgress=0): offset reduced by 280
      // When at bottom (animProgress=1): full offset
      const keyboardOffset = interpolate(
        animProgress,
        [0, 1],
        [Math.max(0, fullKeyboardOffset - 280), fullKeyboardOffset],
        Extrapolate.CLAMP
      );

      // Sottrai anche l'offset della crescita del widget per mantenere la distanza dalla tastiera
      translateY = baseTranslateY - keyboardOffset - heightDiff;
    } else {
      // Anche senza tastiera, compensa la crescita per evitare che vada troppo in basso
      translateY = baseTranslateY - heightDiff;
    }

    return {
      top: 410,
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



  const handleToggleMode = (mode: 'terminal' | 'ai') => {
    if (forcedMode === mode) {
      // Doppio click - disattiva forced mode
      setForcedMode(null);
      // Torna in auto mode
      if (input.trim()) {
        setIsTerminalMode(isCommand(input.trim()));
      }
    } else {
      // Attiva forced mode
      setForcedMode(mode);
      setIsTerminalMode(mode === 'terminal');
    }
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

    addTerminalItem({
      id: Date.now().toString(),
      content: userMessage,
      type: messageType,
      timestamp: new Date(),
    });

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

        // Create streaming message placeholder
        let streamingMessageId = (Date.now() + 2).toString();
        let streamedContent = '';

        addTerminalItem({
          id: streamingMessageId,
          content: '',
          type: TerminalItemType.OUTPUT,
          timestamp: new Date(),
        });

        // Use XMLHttpRequest for streaming (works in React Native)
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.open('POST', `${process.env.EXPO_PUBLIC_API_URL}/ai/chat`);
          xhr.setRequestHeader('Content-Type', 'application/json');

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

                    // Format the result based on tool type (Claude Code style)
                    let formattedOutput = '';

                    if (name === 'read_file') {
                      const lines = result.split('\n').length;
                      const fileName = args.filePath.split('/').pop() || args.filePath;
                      // Include both header and content
                      formattedOutput = `Read ${fileName}\n└─ ${lines} line${lines !== 1 ? 's' : ''}\n\n${result}`;
                    } else if (name === 'write_file') {
                      const fileName = args.filePath.split('/').pop() || args.filePath;
                      formattedOutput = `Write ${fileName}\n└─ File created\n\n${result}`;
                    } else if (name === 'edit_file') {
                      const fileName = args.filePath.split('/').pop() || args.filePath;
                      formattedOutput = `Edit ${fileName}\n└─ File modified\n\n${result}`;
                    } else if (name === 'list_files') {
                      const fileCount = result.split('\n').filter((line: string) => line.trim()).length;
                      formattedOutput = `List files in ${args.directory || '.'}\n└─ ${fileCount} file${fileCount !== 1 ? 's' : ''}\n\n${result}`;
                    } else if (name === 'search_in_files') {
                      const matches = result.split('\n').filter((line: string) => line.includes(':')).length;
                      formattedOutput = `Search "${args.pattern}"\n└─ ${matches} match${matches !== 1 ? 'es' : ''}\n\n${result}`;
                    } else if (name === 'execute_command') {
                      formattedOutput = `Execute: ${args.command}\n└─ Command completed\n\n${result}`;
                    } else if (name === 'glob_files') {
                      // For glob_files, just use the result as-is (it's already formatted from backend)
                      formattedOutput = result;
                    } else {
                      // Generic format for other tools - include result
                      formattedOutput = `${name}\n└─ Completed\n\n${result}`;
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

                    // 🚀 OPTIMIZATION: Format ALL tool results FIRST, then add them ALL at once
                    const formattedToolItems = toolResultsBatch.map((toolResult: any, index: number) => {
                      const { name, args, result } = toolResult;

                      // Format the result based on tool type (Claude Code style)
                      let formattedOutput = '';

                      if (name === 'read_file') {
                        const lines = result.split('\n').length;
                        const fileName = args.filePath.split('/').pop() || args.filePath;
                        formattedOutput = `Read ${fileName}\n└─ ${lines} line${lines !== 1 ? 's' : ''}\n\n${result}`;
                      } else if (name === 'write_file') {
                        const fileName = args.filePath.split('/').pop() || args.filePath;
                        formattedOutput = `Write ${fileName}\n└─ File created\n\n${result}`;
                      } else if (name === 'edit_file') {
                        const fileName = args.filePath.split('/').pop() || args.filePath;
                        formattedOutput = `Edit ${fileName}\n└─ File modified\n\n${result}`;
                      } else if (name === 'list_files') {
                        const fileCount = result.split('\n').filter((line: string) => line.trim()).length;
                        formattedOutput = `List files in ${args.directory || '.'}\n└─ ${fileCount} file${fileCount !== 1 ? 's' : ''}\n\n${result}`;
                      } else if (name === 'search_in_files') {
                        const matches = result.split('\n').filter((line: string) => line.includes(':')).length;
                        formattedOutput = `Search "${args.pattern}"\n└─ ${matches} match${matches !== 1 ? 'es' : ''}\n\n${result}`;
                      } else if (name === 'execute_command') {
                        formattedOutput = `Execute: ${args.command}\n└─ Command completed\n\n${result}`;
                      } else if (name === 'glob_files') {
                        formattedOutput = result;
                      } else {
                        formattedOutput = `${name}\n└─ Completed\n\n${result}`;
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
                  // Handle text responses
                  else if (parsed.text) {
                    streamedContent += parsed.text;

                    // Update the message content in real-time
                    useTabStore.setState((state) => ({
                      tabs: state.tabs.map(t =>
                        t.id === tab.id
                          ? {
                              ...t,
                              terminalItems: t.terminalItems?.map(item =>
                                item.id === streamingMessageId
                                  ? { ...item, content: streamedContent }
                                  : item
                              )
                            }
                          : t
                      )
                    }));
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

          xhr.send(JSON.stringify({
            prompt: userMessage,
            selectedModel: selectedModel,
            conversationHistory: conversationHistory,
            workstationId: currentWorkstation?.id,
            projectId: currentWorkstation?.projectId || currentWorkstation?.id,
            repositoryUrl: currentWorkstation?.githubUrl || currentWorkstation?.repositoryUrl,
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
      {/* Premium gradient background */}
      <LinearGradient
        colors={AppColors.gradient.dark}
        locations={[0, 0.3, 0.7, 1]}
        style={styles.background}
      >
        {/* Subtle glow effects */}
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />
      </LinearGradient>

      {/* Content wrapper with animation */}
      <Animated.View style={[{ flex: 1 }, contentAnimatedStyle]}>
      {currentTab?.type === 'file' ? (
        <FileViewer
          visible={true}
          projectId={currentTab.data?.projectId || ''}
          filePath={currentTab.data?.filePath || ''}
          repositoryUrl={currentTab.data?.repositoryUrl || ''}
          userId={'anonymous'}
          onClose={() => {}}
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
      ) : currentTab?.type === 'integration' ? (
        currentTab.data?.integration === 'supabase' ? (
          <SupabaseView tab={currentTab} />
        ) : currentTab.data?.integration === 'figma' ? (
          <FigmaView tab={currentTab} />
        ) : null
      ) : (
        <>
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
              const filtered = terminalItems.filter(item => item && item.content != null);

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

                acc.push(
                  <TerminalItemComponent
                    key={index}
                    item={item}
                    isNextItemOutput={isNextItemAI}
                    outputItem={outputItem}
                    isLoading={shouldShowLoading}
                  />
                );
                return acc;
              }, [] as JSX.Element[]);
            })()}
          </>
        )}
      </ScrollView>

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
            {/* Mode Toggle */}
            <View style={styles.modeToggleContainer}>
              <View style={styles.modeToggle}>
                <TouchableOpacity
                  onPress={() => handleToggleMode('terminal')}
                  style={[
                    styles.modeButton,
                    isTerminalMode && styles.modeButtonActive,
                    forcedMode === 'terminal' && styles.modeButtonForced
                  ]}
                >
                  <Animated.View style={isTerminalMode ? terminalModeAnimatedStyle : undefined}>
                    <Ionicons
                      name="code-slash"
                      size={14}
                      color={isTerminalMode ? AppColors.white.full : '#8A8A8A'}
                    />
                  </Animated.View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleToggleMode('ai')}
                  style={[
                    styles.modeButton,
                    !isTerminalMode && styles.modeButtonActive,
                    forcedMode === 'ai' && styles.modeButtonForced
                  ]}
                >
                  <Animated.View style={!isTerminalMode ? aiModeAnimatedStyle : undefined}>
                    <Ionicons
                      name="sparkles"
                      size={14}
                      color={!isTerminalMode ? AppColors.white.full : '#8A8A8A'}
                    />
                  </Animated.View>
                </TouchableOpacity>
              </View>



            </View>

            {/* Model Selector */}
            <TouchableOpacity
              style={styles.modelSelector}
              onPress={() => setShowModelSelector(true)}
            >
              <SafeText style={styles.modelText}>{currentModelName}</SafeText>
              <Ionicons name="chevron-down" size={12} color={AppColors.dark.bodyText} />
            </TouchableOpacity>

            {/* Model Selection Modal */}
            <Modal
              visible={showModelSelector}
              transparent
              animationType="fade"
              onRequestClose={() => setShowModelSelector(false)}
            >
              <Pressable
                style={styles.modelModalOverlay}
                onPress={() => setShowModelSelector(false)}
              >
                <View style={styles.modelModalContent}>
                  <SafeText style={styles.modelModalTitle}>Seleziona Modello AI</SafeText>
                  {AI_MODELS.map((model) => (
                    <TouchableOpacity
                      key={model.id}
                      style={[
                        styles.modelDropdownItem,
                        selectedModel === model.id && styles.modelDropdownItemActive
                      ]}
                      onPress={() => {
                        setSelectedModel(model.id);
                        setShowModelSelector(false);
                      }}
                    >
                      <Ionicons
                        name={model.icon}
                        size={18}
                        color={selectedModel === model.id ? AppColors.primary : '#8A8A8A'}
                      />
                      <SafeText style={[
                        styles.modelDropdownText,
                        selectedModel === model.id && styles.modelDropdownTextActive
                      ]}>
                        {model.name}
                      </SafeText>
                      {selectedModel === model.id && (
                        <Ionicons name="checkmark-circle" size={18} color={AppColors.primary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </Pressable>
            </Modal>
          </View>

          {/* Main Input Row */}
          <View style={styles.mainInputRow}>
            {/* Tools Button */}
            <TouchableOpacity style={styles.toolsButton}>
              <Ionicons name="attach" size={24} color="#8A8A8A" />
            </TouchableOpacity>

            {/* Input Field */}
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={handleInputChange}
              placeholder={isTerminalMode ? 'Scrivi un comando...' : 'Chiedi qualcosa all\'AI...'}
              placeholderTextColor={AppColors.dark.bodyText}
              multiline
              maxLength={1000}
              onSubmitEditing={handleSend}
              keyboardAppearance="dark"
              autoCapitalize="none"
              autoCorrect={false}
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
      </Animated.View>
        </>
      )}
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.dark.backgroundAlt,
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
    left: 44,
    right: 0,
    pointerEvents: 'box-none',
  },
  inputWrapperCentered: {
    top: 100,
    justifyContent: 'center',
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
    paddingLeft: 44,
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
  },  outputContent: {
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
  },
  topControls: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 4,
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
  modelModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modelModalContent: {
    backgroundColor: '#1a1a1c',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppColors.dark.surfaceAlt,
    paddingVertical: 12,
    paddingHorizontal: 8,
    minWidth: 200,
    maxWidth: 280,
  },
  modelModalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.white.full,
    textAlign: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.dark.surfaceAlt,
  },
  modelDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  modelDropdownItemActive: {
    backgroundColor: AppColors.primaryAlpha.a10,
  },
  modelDropdownText: {
    flex: 1,
    fontSize: 13,
    color: '#8A8A8A',
    fontWeight: '500',
  },
  modelDropdownTextActive: {
    color: AppColors.white.full,
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
