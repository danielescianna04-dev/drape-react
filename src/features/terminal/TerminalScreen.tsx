import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { TerminalItemType } from '../../shared/types';
import { AppColors } from '../../shared/theme/colors';
import { WelcomeView } from './components/WelcomeView';
import { TerminalItem as TerminalItemComponent } from './components/TerminalItem';
import { Sidebar } from './components/Sidebar';
// import { PreviewEye } from './components/PreviewEye';
import { githubService } from '../../core/github/githubService';
import { aiService } from '../../core/ai/aiService';

const colors = AppColors.dark;

export const TerminalScreen = () => {
  const [input, setInput] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const [isTerminalMode, setIsTerminalMode] = useState(true);
  const [forcedMode, setForcedMode] = useState<'terminal' | 'ai' | null>(null);
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash-exp');
  const scrollViewRef = useRef<ScrollView>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  const {
    terminalItems,
    isLoading,
    hasInteracted,
    addTerminalItem,
    setLoading,
    setGitHubUser,
    setGitHubRepositories,
    
    currentWorkstation,
  } = useTerminalStore();

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [terminalItems]);

  useEffect(() => {
    // Aggiorna il toggle in tempo reale mentre scrivi (solo in auto mode)
    if (input.trim() && !forcedMode) {
      setIsTerminalMode(isCommand(input.trim()));
    }
  }, [input, forcedMode]);

  useEffect(() => {
    // Animazione quando cambia il toggle
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.2,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isTerminalMode]);

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

    const userMessage = input.trim();
    const shouldExecuteCommand = isCommand(userMessage);
    
    // Aggiorna il toggle in base al tipo rilevato
    setIsTerminalMode(shouldExecuteCommand);
    
    setInput('');

    addTerminalItem({
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
          content: response.data.output,
          type: TerminalItemType.OUTPUT,
          timestamp: new Date(),
        });
      } else {
        // Chat mode - AI response
        const response = await axios.post(
          `${process.env.EXPO_PUBLIC_API_URL}/ai/chat`,
          { 
            prompt: userMessage,
            model: selectedModel,
            workstationId: currentWorkstation?.id,
            context: currentWorkstation ? {
              projectName: currentWorkstation.name,
              language: currentWorkstation.language,
              repositoryUrl: currentWorkstation.repositoryUrl
            } : undefined
          }
        );
        
        addTerminalItem({
          content: response.data.content,
          type: TerminalItemType.OUTPUT,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      addTerminalItem({
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: TerminalItemType.ERROR,
        timestamp: new Date(),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#1a1a2e', '#1e1b3e', '#2d1b4e', '#000000']}
        locations={[0, 0.3, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      {showSidebar && <Sidebar onClose={() => setShowSidebar(false)} />}
      
      {/* Preview Eye - appears when URL is detected */}
      {/* <PreviewEye /> */}

      {/* Project Context Header */}
      {currentWorkstation && (
        <View style={styles.contextHeader}>
          <View style={styles.contextContent}>
            <Ionicons name="folder-open" size={18} color={AppColors.primary} />
            <Text style={styles.contextName} numberOfLines={1}>{currentWorkstation.name}</Text>
          </View>
          
          <TouchableOpacity
            style={[
              styles.eyeButton,
              { backgroundColor: currentWorkstation.status === 'running' ? AppColors.success : AppColors.dark.surfaceVariant }
            ]}
            onPress={() => {
              if (currentWorkstation.status === 'running' && currentWorkstation.webUrl) {
                console.log('Opening web preview:', currentWorkstation.webUrl);
              }
            }}
            disabled={currentWorkstation.status !== 'running'}
          >
            <Ionicons 
              name="eye" 
              size={16} 
              color={currentWorkstation.status === 'running' ? 'white' : AppColors.textSecondary} 
            />
          </TouchableOpacity>        </View>
      )}

      <ScrollView
        ref={scrollViewRef}
        style={styles.output}
        contentContainerStyle={styles.outputContent}
        showsVerticalScrollIndicator={false}
      >
        {!hasInteracted && terminalItems.length === 0 ? (
          <WelcomeView />
        ) : (
          terminalItems.map((item, index) => (
            <TerminalItemComponent key={index} item={item} />
          ))
        )}
        
        {isLoading && (
          <View style={styles.loadingRow}>
            <Text style={[styles.loadingDot, { color: AppColors.primary }]}>●</Text>
            <Text style={[styles.loadingDot, { color: AppColors.primary }]}>●</Text>
            <Text style={[styles.loadingDot, { color: AppColors.primary }]}>●</Text>
          </View>
        )}
      </ScrollView>

      {/* Floating Buttons */}
      <TouchableOpacity onPress={() => setShowSidebar(true)} style={styles.menuButton}>
        <BlurView intensity={30} tint="dark" style={styles.menuBlur}>
          <View style={styles.menuIconContainer}>
            <View style={[styles.menuLine, { width: 20 }]} />
            <View style={[styles.menuLine, { width: 14 }]} />
            <View style={[styles.menuLine, { width: 17 }]} />
          </View>
        </BlurView>
      </TouchableOpacity>

      {/* Input Area - Exact Flutter replica */}
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
                  <Animated.View style={{ transform: [{ scale: isTerminalMode ? scaleAnim : 1 }] }}>
                    <Ionicons
                      name="code-slash"
                      size={16}
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
                      size={16}
                      color={!isTerminalMode ? '#fff' : '#8A8A8A'}
                    />
                  </Animated.View>
                </TouchableOpacity>
              </View>
              {!forcedMode && (
                <Text style={styles.autoLabel}>AUTO</Text>
              )}
            </View>

            {/* Model Selector */}
            <TouchableOpacity style={styles.modelSelector}>
              <Text style={styles.modelText}>{selectedModel}</Text>
              <Ionicons name="chevron-down" size={14} color="#8A8A8A" />
            </TouchableOpacity>
          </View>

          {/* Main Input Row */}
          <View style={styles.mainInputRow}>
            {/* Tools Button */}
            <TouchableOpacity style={styles.toolsButton}>
              <Ionicons name="add-circle-outline" size={24} color="#8A8A8A" />
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
            >
              <LinearGradient
                colors={input.trim() && !isLoading ? ['#8B7CF6', '#7C6FE5'] : ['#2A2A2A', '#2A2A2A']}
                style={styles.sendGradient}
              >
                <Ionicons name="send" size={18} color={input.trim() && !isLoading ? '#fff' : '#8A8A8A'} />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </KeyboardAvoidingView>

      {showSidebar && (
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowSidebar(false)}
        >
          <BlurView intensity={10} style={StyleSheet.absoluteFill} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contextHeader: {
    position: 'absolute',
    top: 60,
    left: 80,
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
  eyeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },  },
  output: {
    flex: 1,
  },
  outputContent: {
    padding: 20,
    paddingTop: 120,
    paddingBottom: 180,
  },
  loadingRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 16,
  },
  loadingDot: {
    fontSize: 14,
  },
  menuButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  menuBlur: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
  },
  menuIconContainer: {
    gap: 4,
  },
  menuLine: {
    height: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
  inputContainer: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  inputGradient: {
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(139, 124, 246, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 3,
  },
  autoLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8B7CF6',
    letterSpacing: 0.5,
  },
  modeButton: {
    width: 32,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 15,
  },
  modeButtonActive: {
    backgroundColor: '#8B7CF6',
  },
  modeButtonForced: {
    borderWidth: 2,
    borderColor: '#8B7CF6',
  },
  modelSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(42, 42, 42, 0.5)',
    gap: 6,
  },
  modelText: {
    fontSize: 12,
    color: '#F0F0F0',
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
  input: {
    flex: 1,
    fontSize: 14,
    color: '#F0F0F0',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    paddingHorizontal: 16,
    paddingVertical: 14,
    maxHeight: 120,
    lineHeight: 20,
  },
  sendButton: {
    marginLeft: 12,
  },
  sendGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
});
