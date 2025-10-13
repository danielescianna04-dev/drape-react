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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { TerminalItemType } from '../../shared/types';
import { AppColors } from '../../shared/theme/colors';
import { WelcomeView } from './components/WelcomeView';
import { TerminalItem as TerminalItemComponent } from './components/TerminalItem';
import { Sidebar } from './components/Sidebar';
import { githubService } from '../../core/github/githubService';

const colors = AppColors.dark;

export const TerminalScreen = () => {
  const [input, setInput] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const [isTerminalMode, setIsTerminalMode] = useState(true);
  const [selectedModel, setSelectedModel] = useState('auto');
  const scrollViewRef = useRef<ScrollView>(null);
  
  const {
    terminalItems,
    isLoading,
    hasInteracted,
    addTerminalItem,
    setLoading,
    setGitHubUser,
    setGitHubRepositories,
    setIsGitHubConnected,
  } = useTerminalStore();

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [terminalItems]);

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
          setIsGitHubConnected(true);
          
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
          setIsGitHubConnected(true);
        }
      }
    };

    handleGitHubCallback();
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');

    addTerminalItem({
      content: userMessage,
      type: TerminalItemType.COMMAND,
      timestamp: new Date(),
    });

    setLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      addTerminalItem({
        content: `Response to: ${userMessage}`,
        type: TerminalItemType.OUTPUT,
        timestamp: new Date(),
      });
    } catch (error) {
      addTerminalItem({
        content: `Error: ${error}`,
        type: TerminalItemType.ERROR,
        timestamp: new Date(),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {showSidebar && <Sidebar onClose={() => setShowSidebar(false)} />}

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
        <LinearGradient
          colors={[AppColors.primary, AppColors.primaryShade]}
          style={styles.menuButtonGradient}
        >
          <Ionicons name="menu" size={24} color="#FFFFFF" />
        </LinearGradient>
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
            <View style={styles.modeToggle}>
              <TouchableOpacity
                onPress={() => setIsTerminalMode(true)}
                style={[styles.modeButton, isTerminalMode && styles.modeButtonActive]}
              >
                <Ionicons
                  name="terminal"
                  size={16}
                  color={isTerminalMode ? '#fff' : '#8A8A8A'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setIsTerminalMode(false)}
                style={[styles.modeButton, !isTerminalMode && styles.modeButtonActive]}
              >
                <Ionicons
                  name="chatbubble-ellipses"
                  size={16}
                  color={!isTerminalMode ? '#fff' : '#8A8A8A'}
                />
              </TouchableOpacity>
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
    backgroundColor: '#090A0B',
  },
  output: {
    flex: 1,
  },
  outputContent: {
    padding: 20,
    paddingTop: 60,
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
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  menuButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputContainer: {
    position: 'absolute',
    bottom: 0,
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
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 3,
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
