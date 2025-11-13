import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import { AppColors } from '../../../shared/theme/colors';
import { detectProjectType, ProjectInfo } from '../../../core/preview/projectDetector';
import { config } from '../../../config/config';
import { useTerminalStore } from '../../../core/terminal/terminalStore';

interface Props {
  onClose: () => void;
  previewUrl: string;
  projectName?: string;
  projectPath?: string; // Path to the project directory
}

export const PreviewPanel = ({ onClose, previewUrl, projectName, projectPath }: Props) => {
  const { currentWorkstation } = useTerminalStore();
  const fadeAnim = useRef(new Animated.Value(0)).current; // Fade in animation
  const [isLoading, setIsLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'running' | 'stopped'>('checking');
  const [isStarting, setIsStarting] = useState(false);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState(previewUrl); // Track the actual URL to use
  const webViewRef = useRef<WebView>(null);
  const checkInterval = useRef<NodeJS.Timeout | null>(null);

  // Opening animation - fade in
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, []);

  // Check server status periodically
  useEffect(() => {
    checkServerStatus();

    // Check every 3 seconds
    checkInterval.current = setInterval(checkServerStatus, 3000);

    return () => {
      if (checkInterval.current) {
        clearInterval(checkInterval.current);
      }
    };
  }, [currentPreviewUrl]);

  // Detect project type on mount
  useEffect(() => {
    const detectProject = async () => {
      try {
        if (!projectPath) {
          console.log('No project path provided, using default detection');
          // Default to React with port 8080 (avoid conflict with backend on 3000)
          const info: ProjectInfo = {
            type: 'react',
            defaultPort: 8080,
            startCommand: 'PORT=8080 npm start',
            installCommand: 'npm install',
            description: 'React Application'
          };
          setProjectInfo(info);
          return;
        }

        // TODO: In production, call backend API to read files and detect project type
        // For now, use mock detection with port 8080
        console.log('Detecting project type for:', projectPath);
        const info: ProjectInfo = {
          type: 'react',
          defaultPort: 8080,
          startCommand: 'PORT=8080 npm start',
          installCommand: 'npm install',
          description: 'React Application'
        };
        setProjectInfo(info);
      } catch (error) {
        console.error('Failed to detect project type:', error);
      }
    };

    detectProject();
  }, [projectPath]);

  const checkServerStatus = async () => {
    try {
      // Try to fetch the URL
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(currentPreviewUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        setServerStatus('running');
      } else {
        setServerStatus('stopped');
      }
    } catch (error) {
      setServerStatus('stopped');
    }
  };

  const handleStartServer = async () => {
    if (!projectInfo) return;

    setIsStarting(true);

    try {
      console.log('Starting server with command:', projectInfo.startCommand);
      console.log('Current workstation:', currentWorkstation);
      console.log('Workstation ID to send:', currentWorkstation?.id);

      // Call backend API to execute the start command
      const response = await fetch(`${config.apiUrl}${config.endpoints.terminal}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: projectInfo.startCommand,
          workstationId: currentWorkstation?.id, // Use workstation ID from store
        }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Server start result:', result);

      // If there's a preview URL in the response, update our preview URL
      if (result.previewUrl) {
        console.log('Preview URL detected:', result.previewUrl);
        setCurrentPreviewUrl(result.previewUrl); // Update the URL to check
      }

      // NEW: Backend now does health check and tells us if server is ready
      // This is production-ready: backend polls the server until it's verified running
      if (result.serverReady) {
        console.log('✅ Server is verified running by backend health check!');
        if (result.healthCheck) {
          console.log(`   Health check passed after ${result.healthCheck.attempts} attempts`);
        }
        setServerStatus('running');
      } else if (result.exitCode === 0) {
        // Fallback: If exitCode is 0 but serverReady is false, start checking
        console.log('⚠️ Server command executed but not verified ready, checking...');
        setServerStatus('checking');
        checkServerStatus();
      } else {
        // Command failed
        console.log('❌ Server command failed');
        setServerStatus('stopped');
      }
    } catch (error) {
      console.error('Failed to start server:', error);
      // Show error state
      setServerStatus('stopped');
    } finally {
      setIsStarting(false);
    }
  };

  const handleClose = () => {
    if (checkInterval.current) {
      clearInterval(checkInterval.current);
    }

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const handleRefresh = () => {
    webViewRef.current?.reload();
    checkServerStatus();
  };

  const handleGoBack = () => {
    if (canGoBack) {
      webViewRef.current?.goBack();
    }
  };

  const handleGoForward = () => {
    if (canGoForward) {
      webViewRef.current?.goForward();
    }
  };

  return (
    <>
      {/* Backdrop - Click to close */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      />

      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <LinearGradient
          colors={['#0a0a0a', '#000000']}
          style={StyleSheet.absoluteFill}
        />

        {/* WebView Preview or Start Screen */}
        <View style={styles.webViewContainer}>
          {serverStatus === 'stopped' ? (
            // Server not running - show start screen
            <View style={styles.startScreen}>
              <View style={styles.startContent}>
                <View style={styles.iconCircle}>
                  <Ionicons
                    name={projectInfo?.isReactNative ? "phone-portrait" : "rocket"}
                    size={48}
                    color={projectInfo?.isReactNative ? "#FFA500" : AppColors.primary}
                  />
                </View>

                <Text style={styles.startTitle}>
                  {projectInfo?.isReactNative ? "Progetto React Native/Expo" : "Anteprima non disponibile"}
                </Text>
                <Text style={styles.startSubtitle}>
                  {projectInfo?.isReactNative
                    ? "Avvio del server con tunnel Expo per anteprima web..."
                    : "Il server di sviluppo non è in esecuzione"}
                </Text>

                {projectInfo && (
                  <View style={styles.infoCard}>
                    <View style={styles.infoRow}>
                      <Ionicons name="folder-outline" size={18} color="rgba(255, 255, 255, 0.6)" />
                      <Text style={styles.infoLabel}>Progetto</Text>
                      <Text style={styles.infoValue}>{projectInfo.description}</Text>
                    </View>
                    <View style={styles.infoDivider} />
                    <View style={styles.infoRow}>
                      <Ionicons name="code-outline" size={18} color="rgba(255, 255, 255, 0.6)" />
                      <Text style={styles.infoLabel}>Comando</Text>
                      <Text style={styles.infoValueMono}>{projectInfo.startCommand}</Text>
                    </View>
                    {projectInfo.isReactNative && (
                      <>
                        <View style={styles.infoDivider} />
                        <View style={styles.infoRow}>
                          <Ionicons name="globe-outline" size={18} color="#00D9FF" />
                          <Text style={styles.infoLabel}>Tunnel</Text>
                          <Text style={styles.infoValue}>Expo Web + Tunnel</Text>
                        </View>
                      </>
                    )}
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.startButton, isStarting && styles.startButtonDisabled]}
                  onPress={handleStartServer}
                  disabled={isStarting}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={isStarting ? ['#555', '#444'] : [AppColors.primary, '#7C5DFA']}
                    style={styles.startButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    {isStarting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="play-circle" size={22} color="#FFFFFF" />
                    )}
                    <Text style={styles.startButtonText}>
                      {isStarting ? 'Avvio in corso...' : 'Avvia Server'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          ) : serverStatus === 'checking' ? (
            // Checking server status
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={AppColors.primary} />
              <Text style={styles.loadingText}>Connessione al server...</Text>
            </View>
          ) : (
            // Server running - show WebView
            <>
              {isLoading && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={AppColors.primary} />
                  <Text style={styles.loadingText}>Caricamento anteprima...</Text>
                </View>
              )}
              <WebView
                ref={webViewRef}
                source={{ uri: currentPreviewUrl }}
                style={styles.webView}
                onLoadStart={() => setIsLoading(true)}
                onLoadEnd={() => setIsLoading(false)}
                onNavigationStateChange={(navState) => {
                  setCanGoBack(navState.canGoBack);
                  setCanGoForward(navState.canGoForward);
                }}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                scalesPageToFit={true}
                bounces={false}
                onError={() => {
                  console.log('WebView error - server might have stopped');
                  setServerStatus('stopped');
                }}
              />
            </>
          )}
        </View>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 999,
  },
  container: {
    position: 'absolute',
    left: 50, // Offset for sidebar
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1000,
  },
  webViewContainer: {
    flex: 1,
    position: 'relative',
  },
  webView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  startScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  startContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    maxWidth: 500,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(139, 124, 246, 0.12)',
    borderWidth: 2,
    borderColor: 'rgba(139, 124, 246, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  startTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  startSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 32,
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
    width: '100%',
    marginBottom: 32,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 12,
  },
  infoLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '600',
    minWidth: 70,
  },
  infoValue: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
    flex: 1,
  },
  infoValueMono: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    fontFamily: 'monospace',
    flex: 1,
  },
  startButton: {
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
