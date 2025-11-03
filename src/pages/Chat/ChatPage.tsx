import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
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
import { FileViewer } from '../../features/terminal/components/FileViewer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const colors = AppColors.dark;

interface ChatPageProps {
  tab?: Tab;
  isCardMode: boolean;
  cardDimensions: { width: number; height: number; };
  animatedStyle?: any;
}

const LoadingIndicator = () => {
  const rotation = useSharedValue(0);

  React.useEffect(() => {
    rotation.value = withTiming(360, {
      duration: 800,
      easing: Easing.linear,
    });

    const interval = setInterval(() => {
      rotation.value = rotation.value + 360;
      rotation.value = withTiming(rotation.value, {
        duration: 800,
        easing: Easing.linear,
      });
    }, 800);

    return () => clearInterval(interval);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={styles.loadingContainer}>
      <Animated.View style={[styles.loadingSpinnerWrapper, animatedStyle]}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <View
            key={i}
            style={[
              styles.loadingRay,
              {
                transform: [{ rotate: `${i * 45}deg` }],
                opacity: 1 - (i * 0.1),
              },
            ]}
          />
        ))}
      </Animated.View>
    </View>
  );
};

const ChatPage = ({ tab, isCardMode, cardDimensions, animatedStyle }: ChatPageProps) => {
  const [input, setInput] = useState('');
  const [isTerminalMode, setIsTerminalMode] = useState(true);
  const [forcedMode, setForcedMode] = useState<'terminal' | 'ai' | null>(null);
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash-exp');
  const scrollViewRef = useRef<ScrollView>(null);
  const scaleAnim = useSharedValue(1);
  const inputPositionAnim = useSharedValue(0);
  const borderAnim = useSharedValue(0);
  const hasChatStartedAnim = useSharedValue(0); // 0 = not started, 1 = started
  const cardModeAnim = useSharedValue(isCardMode ? 1 : 0); // Animate card mode transitions
  const keyboardHeight = useSharedValue(0); // Track keyboard height
  const insets = useSafeAreaInsets();

  const { tabs, activeTabId, updateTab, addTerminalItem: addTerminalItemToStore } = useTabStore();
  const currentTab = tab || tabs.find(t => t.id === activeTabId);

  // Always use tab-specific terminal items
  const tabTerminalItems = currentTab?.terminalItems || [];
  const isLoading = currentTab?.isLoading || false;
  const hasChatStarted = tabTerminalItems.length > 0;
  
  console.log('📋 ChatPage - Tab:', currentTab?.id, 'Items:', tabTerminalItems.length, 'isCardMode:', isCardMode);
  
  const {
    hasInteracted,
    setGitHubUser,
    setGitHubRepositories,
    currentWorkstation,
  } = useTerminalStore();
  
  // Always use tab-specific items
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

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [terminalItems]);

  // Keyboard listeners - move input box up when keyboard opens
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        // Only move up if chat has started (input is at bottom)
        if (hasChatStarted) {
          keyboardHeight.value = withSpring(e.endCoordinates.height, {
            damping: 25,
            stiffness: 300,
            mass: 0.5,
          });
        }
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        keyboardHeight.value = withSpring(0, {
          damping: 25,
          stiffness: 300,
          mass: 0.5,
        });
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, [hasChatStarted]);

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

  const modeToggleAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: isTerminalMode ? scaleAnim.value : 1 }],
    };
  });

  const cardBorderAnimatedStyle = useAnimatedStyle(() => {
    return {
      borderWidth: borderAnim.value * 2,
      borderColor: `rgba(139, 124, 246, ${borderAnim.value * 0.3})`,
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
    // Usiamo un translateY smooth che sposta verso il basso
    const baseTranslateY = interpolate(
      animProgress,
      [0, 1],
      [0, 280], // Sposta 280px verso il basso (un po' più in alto rispetto a prima)
      Extrapolate.CLAMP
    );

    // When keyboard is open, move up by 80% of keyboard height
    const keyboardOffset = keyboardHeight.value * 0.8;
    const translateY = baseTranslateY - keyboardOffset;

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

    // Animate input to bottom on first send - Apple-style smooth animation
    if (!hasChatStarted) {
      hasChatStartedAnim.value = 1; // Mark chat as started
      inputPositionAnim.value = withSpring(1, {
        damping: 20,
        stiffness: 180,
        mass: 0.8,
      });
      // Dismiss keyboard with animation
      Keyboard.dismiss();
    }

    const userMessage = input.trim();

    // Se c'è un forced mode, usa quello, altrimenti auto-detect
    const shouldExecuteCommand = forcedMode
      ? forcedMode === 'terminal'
      : isCommand(userMessage);

    // Aggiorna il toggle in base al tipo rilevato (solo se non in forced mode)
    if (!forcedMode) {
      setIsTerminalMode(shouldExecuteCommand);
    }
    
    setInput('');

    addTerminalItem({
      id: Date.now().toString(),
      content: userMessage,
      type: TerminalItemType.COMMAND,
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
        
        let enhancedPrompt = userMessage;
        if (currentWorkstation && /analizza|analyze|spiega|explain|cosa fa/i.test(userMessage)) {
          addTerminalItem({
            id: (Date.now() + 0.5).toString(),
            content: '📂 Caricamento file...', 
            type: TerminalItemType.SYSTEM,
            timestamp: new Date(),
          });
          
          try {
            const filesResponse = await axios.post(
              `${process.env.EXPO_PUBLIC_API_URL}/workstation/list-files`,
              { workstationId: currentWorkstation.id }
            );
            
            const files = filesResponse.data.files || [];
            const mainFiles = files.filter(f => 
              f.includes('package.json') || f.includes('README') || 
              f.includes('index') || f.includes('App') || f.includes('main')
            ).slice(0, 5);
            
            const fileContents = await Promise.all(
              mainFiles.map(async (filePath) => {
                try {
                  const content = await axios.post(
                    `${process.env.EXPO_PUBLIC_API_URL}/workstation/read-file`,
                    { workstationId: currentWorkstation.id, filePath }
                  );
                  return '\n--- ' + filePath + ' ---\n' + content.data.content;
                } catch { return ''; }
              })
            );
            
            enhancedPrompt = userMessage + '\n\nFile del progetto:\n' + fileContents.join('\n');
          } catch (error) {
            console.error('Error loading files:', error);
          }
        }
        
        const response = await axios.post(
          `${process.env.EXPO_PUBLIC_API_URL}/ai/chat`,
          {
            prompt: enhancedPrompt,
            model: selectedModel,
            workstationId: currentWorkstation?.id,
            context: currentWorkstation ? {
              projectName: currentWorkstation.name || 'Unnamed Project',
              language: currentWorkstation.language || 'Unknown',
              repositoryUrl: currentWorkstation.repositoryUrl || ''
            } : undefined
          },
          {
            timeout: 60000 // 60 seconds timeout for AI requests
          }
        );
        
        addTerminalItem({
          id: (Date.now() + 2).toString(),
          content: response.data.content || '',
          type: TerminalItemType.OUTPUT,
          timestamp: new Date(),
        });
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
        colors={[
          '#0a0a0a',
          '#121212',
          '#1a1a1a',
          '#0f0f0f',
        ]}
        locations={[0, 0.3, 0.7, 1]}
        style={styles.background}
      >
        {/* Subtle glow effects */}
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />
      </LinearGradient>
      
      {currentTab?.type === 'file' ? (
        <FileViewer
          visible={true}
          projectId={currentTab.data?.projectId || ''}
          filePath={currentTab.data?.filePath || ''}
          repositoryUrl={currentTab.data?.repositoryUrl || ''}
          userId={'anonymous'}
          onClose={() => {}}
        />
      ) : (
        <>
        <ScrollView
          ref={scrollViewRef}
          style={[styles.output, isCardMode && styles.outputCardMode]}
          contentContainerStyle={styles.outputContent}
          showsVerticalScrollIndicator={false}
        >
        {terminalItems.length === 0 ? (
          <View style={styles.emptyState}>
          </View>
        ) : (
          <>
            {(() => {
              const filtered = terminalItems.filter(item => item && item.content != null);
              console.log('🟣 Rendering items, filtered count:', filtered.length);

              return filtered.reduce((acc, item, index, filteredArray) => {
                console.log('🟣 Processing item', index, ':', item.type, item.content?.substring(0, 30));

                // Skip OUTPUT items that follow a terminal COMMAND (they'll be grouped)
                const prevItem = filteredArray[index - 1];
                const isOutputAfterTerminalCommand =
                  item.type === TerminalItemType.OUTPUT &&
                  prevItem?.type === TerminalItemType.COMMAND &&
                  isCommand(prevItem.content || '');

                if (isOutputAfterTerminalCommand) {
                  console.log('🟣 Skipping output item', index, '(will be grouped with command)');
                  return acc;
                }

                // Check if next item is an OUTPUT for this COMMAND
                const nextItem = filteredArray[index + 1];
                const isNextItemOutput = nextItem?.type === TerminalItemType.OUTPUT && !isCommand(nextItem.content || '');
                const outputItem =
                  item.type === TerminalItemType.COMMAND &&
                  isCommand(item.content || '') &&
                  nextItem?.type === TerminalItemType.OUTPUT
                    ? nextItem
                    : undefined;

                console.log('🟣 Rendering item', index, 'with outputItem:', !!outputItem);

                acc.push(
                  <TerminalItemComponent
                    key={index}
                    item={item}
                    isNextItemOutput={isNextItemOutput}
                    outputItem={outputItem}
                  />
                );
                return acc;
              }, [] as JSX.Element[]);
            })()}
          </>
        )}
        
        {isLoading && <LoadingIndicator />}
      </ScrollView>

      <Animated.View style={[
        styles.inputWrapper,
        isCardMode && styles.inputWrapperCardMode,
        inputWrapperAnimatedStyle
      ]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.inputContainer}
          >
        <LinearGradient
          colors={['rgba(28, 28, 30, 0.98)', 'rgba(28, 28, 30, 0.92)']}
          style={styles.inputGradient}
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
                  <Animated.View style={modeToggleAnimatedStyle}>
                    <Ionicons
                      name="code-slash"
                      size={14}
                      color={isTerminalMode ? '#fff' : '#8A8A8A'}
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
                  <Animated.View style={{ transform: [{ scale: !isTerminalMode ? scaleAnim : 1 }] }}>
                    <Ionicons
                      name="sparkles"
                      size={14}
                      color={!isTerminalMode ? '#fff' : '#8A8A8A'}
                    />
                  </Animated.View>
                </TouchableOpacity>
              </View>



            </View>

            {/* Model Selector */}
            <TouchableOpacity style={styles.modelSelector}>
              <SafeText style={styles.modelText}>Gemini 2.0</SafeText>
              <Ionicons name="chevron-down" size={12} color="#666" />
            </TouchableOpacity>
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
              onChangeText={setInput}
              placeholder={isTerminalMode ? 'Scrivi un comando...' : 'Chiedi qualcosa all\'AI...'}
              placeholderTextColor="#6E7681"
              multiline
              maxLength={1000}
              onSubmitEditing={handleSend}
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
                color={input.trim() && !isLoading ? AppColors.primary : '#333'} 
              />
            </TouchableOpacity>

          </View>
        </LinearGradient>
      </KeyboardAvoidingView>
      </Animated.View>
        </>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    backgroundColor: 'rgba(139, 124, 246, 0.08)',
    opacity: 0.6,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -150,
    right: -80,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(139, 124, 246, 0.05)',
    opacity: 0.5,
  },
  inputWrapper: {
    position: 'absolute',
    left: 50,
    right: 0,
    pointerEvents: 'box-none',
  },
  inputWrapperCentered: {
    top: 100,
    justifyContent: 'center',
  },
  inputWrapperCardMode: {
    left: 0, // Remove sidebar offset in card mode
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
    color: 'rgba(255, 255, 255, 0.95)',
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
    paddingLeft: 50,
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
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: 'rgba(139, 124, 246, 0.3)',
    elevation: 8,
  },
  logoTitle: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  logoSubtitle: {
    fontSize: 18,
    color: '#8B7CF6',
    fontWeight: '600',
    marginBottom: 24,
  },
  logoDivider: {
    width: 80,
    height: 3,
    backgroundColor: 'rgba(139, 124, 246, 0.4)',
    marginBottom: 24,
    borderRadius: 2,
  },
  logoDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '400',
    maxWidth: 280,
  },  outputContent: {
    padding: 20,
    paddingTop: 20, // Reduced since output already has paddingTop:80
    paddingBottom: 300, // Space for input box at bottom
  },
  loadingContainer: {
    marginBottom: 4,
    alignItems: 'flex-start',
  },
  loadingLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 8,
  },
  loadingSpinnerWrapper: {
    width: 16,
    height: 16,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingRay: {
    position: 'absolute',
    width: 2,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 1,
    top: 0,
    left: '50%',
    marginLeft: -1,
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  inputGradient: {
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(139, 124, 246, 0.15)',
    elevation: 8,
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
    borderColor: '#1a1a1a',
    padding: 2,
  },
  autoLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#8B7CF6',
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
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
  },
  modeButtonForced: {
    borderWidth: 1,
    borderColor: '#8B7CF6',
  },
  modelSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#1a1a1a',
    gap: 4,
  },
  modelText: {
    fontSize: 10,
    color: '#888',
    fontWeight: '500',
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
    color: '#F0F0F0',
    fontFamily: 'monospace',
    paddingHorizontal: 16,
    paddingVertical: 14,
    maxHeight: 120,
    lineHeight: 20,
  },
});
export default ChatPage;
