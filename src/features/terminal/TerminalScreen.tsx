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
import { VSCodeSidebar } from './components/VSCodeSidebar';
import { SafeText } from '../../shared/components/SafeText';
// import { PreviewEye } from './components/PreviewEye';
import { githubService } from '../../core/github/githubService';
import { aiService } from '../../core/ai/aiService';
import { useTabStore } from '../../core/tabs/tabStore';
import { FileViewer } from './components/FileViewer';

const colors = AppColors.dark;

const TerminalScreen = () => {
  const [input, setInput] = useState('');
  const [isTerminalMode, setIsTerminalMode] = useState(true);
  const [forcedMode, setForcedMode] = useState<'terminal' | 'ai' | null>(null);
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash-exp');
  const scrollViewRef = useRef<ScrollView>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const inputPositionAnim = useRef(new Animated.Value(0)).current;
  
  const { tabs, activeTabId } = useTabStore();
  const activeTab = tabs.find(t => t.id === activeTabId);
  
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
    console.log('📊 Terminal items count:', terminalItems.length);
  }, [currentWorkstation]);
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

    // Animate input to bottom on first send
    if (!hasInteracted) {
      Animated.timing(inputPositionAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: false,
      }).start();
    }

    const userMessage = input.trim();
    const shouldExecuteCommand = isCommand(userMessage);
    
    // Aggiorna il toggle in base al tipo rilevato
    setIsTerminalMode(shouldExecuteCommand);
    
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
    <View style={styles.container}>
      <LinearGradient
        colors={['#000000', '#0a0a0f', '#1a0a2e', '#000000']}
        locations={[0, 0.3, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* VSCode-style Sidebar */}
      <VSCodeSidebar />
      

      {activeTab?.type === 'file' ? (
        <FileViewer
          visible={true}
          projectId={activeTab.data?.projectId || ''}
          filePath={activeTab.data?.filePath || ''}
          repositoryUrl={activeTab.data?.repositoryUrl || ''}
          userId={'anonymous'}
          onClose={() => {}}
        />
      ) : (
        <>
        <ScrollView
          ref={scrollViewRef}
          style={styles.output}
          contentContainerStyle={styles.outputContent}
          showsVerticalScrollIndicator={false}
        >
        {terminalItems.length === 0 ? (
          <View style={styles.emptyState}>
          </View>
        ) : (
          terminalItems
            .filter(item => item && item.content != null)
            .map((item, index) => (
            <TerminalItemComponent key={index} item={item} />
          ))
        )}
        
        {isLoading && (
          <View style={styles.loadingRow}>
            <SafeText style={[styles.loadingDot, { color: AppColors.primary }]}>●</SafeText>
            <SafeText style={[styles.loadingDot, { color: AppColors.primary }]}>●</SafeText>
            <SafeText style={[styles.loadingDot, { color: AppColors.primary }]}>●</SafeText>
          </View>
        )}
      </ScrollView>

      <View style={styles.inputWrapper}>
        <Animated.View
          style={{
            transform: [{
              translateY: inputPositionAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 310],
              })
            }]
          }}
        >
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
      </View>
      </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  inputWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 50,
    right: 0,
    top: 60,
    pointerEvents: 'box-none',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
  contextHeader: {
    position: 'absolute',
    top: 60,
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
    shadowColor: '#8B7CF6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  logoTitle: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: -1.5,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  logoSubtitle: {
    fontSize: 18,
    color: '#8B7CF6',
    fontWeight: '600',
    marginBottom: 24,
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  logoDivider: {
    width: 80,
    height: 3,
    backgroundColor: 'rgba(139, 124, 246, 0.4)',
    marginBottom: 24,
    borderRadius: 2,
    shadowColor: '#8B7CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  logoDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '400',
    maxWidth: 280,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },  outputContent: {
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
  inputContainer: {
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
export default TerminalScreen;
