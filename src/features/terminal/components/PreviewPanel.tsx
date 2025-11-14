import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import { AppColors } from '../../../shared/theme/colors';
import { detectProjectType, ProjectInfo } from '../../../core/preview/projectDetector';
import { config } from '../../../config/config';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  onClose: () => void;
  previewUrl: string;
  projectName?: string;
  projectPath?: string; // Path to the project directory
}

export const PreviewPanel = ({ onClose, previewUrl, projectName, projectPath }: Props) => {
  const { currentWorkstation } = useTerminalStore();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current; // Fade in animation
  const [isLoading, setIsLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'running' | 'stopped'>('checking');
  const [isStarting, setIsStarting] = useState(false);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState(previewUrl); // Track the actual URL to use
  const webViewRef = useRef<WebView>(null);
  const inputRef = useRef<TextInput>(null);
  const checkInterval = useRef<NodeJS.Timeout | null>(null);
  const [message, setMessage] = useState('');
  const [isInspectMode, setIsInspectMode] = useState(false);

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
        // Use workstation ID from store to detect project type
        if (!currentWorkstation?.id) {
          console.log('No workstation ID, using default detection');
          const info: ProjectInfo = {
            type: 'unknown',
            defaultPort: 3000,
            startCommand: 'npm start',
            installCommand: 'npm install',
            description: 'Unknown Project Type'
          };
          setProjectInfo(info);
          return;
        }

        console.log('Detecting project type for workstation:', currentWorkstation.id);

        // Call backend API to detect project type
        const response = await fetch(
          `${config.apiUrl}/workstation/${currentWorkstation.id}/detect-project`
        );

        if (!response.ok) {
          throw new Error(`Detection failed: ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ Project type detected:', data.projectInfo);
        setProjectInfo(data.projectInfo);
      } catch (error) {
        console.error('Failed to detect project type:', error);
        // Fallback to default
        const info: ProjectInfo = {
          type: 'unknown',
          defaultPort: 3000,
          startCommand: 'npm start',
          installCommand: 'npm install',
          description: 'Unknown Project Type'
        };
        setProjectInfo(info);
      }
    };

    detectProject();
  }, [currentWorkstation]);

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

  const handleSendMessage = () => {
    if (message.trim()) {
      console.log('Message sent:', message);
      // TODO: Implement message sending logic
      setMessage('');
    }
  };

  const toggleInspectMode = () => {
    const newInspectMode = !isInspectMode;
    setIsInspectMode(newInspectMode);

    if (newInspectMode) {
      // Enable inspect mode
      webViewRef.current?.injectJavaScript(`
        (function() {
          // Remove existing inspector if any
          if (window.__inspectorEnabled) return;
          window.__inspectorEnabled = true;

          // Style for overlay
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

          // Create overlay element
          const overlay = document.createElement('div');
          overlay.className = '__inspector-overlay';
          overlay.style.display = 'none';
          document.body.appendChild(overlay);

          const tooltip = document.createElement('div');
          tooltip.className = '__inspector-tooltip';
          overlay.appendChild(tooltip);

          let lastElement = null;

          // Mouse move handler
          const handleMouseMove = (e) => {
            const target = e.target;
            if (target.classList.contains('__inspector-overlay') ||
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

            // Format tooltip text nicely
            let tooltipText = '<' + tagName + '>';
            if (id) tooltipText = '<' + tagName + '#' + id + '>';
            else if (classes) tooltipText = '<' + tagName + '.' + classes.split(' ').join('.') + '>';

            tooltip.textContent = tooltipText;

            lastElement = target;
          };

          // Click handler
          const handleClick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (lastElement) {
              const tagName = lastElement.tagName.toLowerCase();
              const className = lastElement.className || '';
              const id = lastElement.id || '';
              const text = lastElement.textContent?.substring(0, 50) || '';

              // Remove mousemove listener to freeze the selection
              document.removeEventListener('mousemove', handleMouseMove, true);

              // Change overlay style to show it's selected (not just hovered)
              overlay.style.borderColor = '#00D084';
              overlay.style.background = 'rgba(0, 208, 132, 0.2)';
              overlay.style.animation = 'none';
              overlay.style.boxShadow = '0 0 0 3px rgba(0, 208, 132, 0.3)';

              // Update tooltip to show "Selected!"
              tooltip.style.background = 'linear-gradient(135deg, #00D084 0%, #00B972 100%)';
              tooltip.textContent = '✓ Selected';
              tooltip.querySelector('::after')?.style.setProperty('border-top-color', '#00B972');

              // Send message to React Native
              window.ReactNativeWebView?.postMessage(JSON.stringify({
                type: 'ELEMENT_SELECTED',
                element: {
                  tag: tagName,
                  className: className,
                  id: id,
                  text: text,
                  innerHTML: lastElement.innerHTML?.substring(0, 200)
                }
              }));

              // Keep selection visible for 2 seconds, then fade out
              setTimeout(() => {
                overlay.style.transition = 'opacity 0.5s ease';
                overlay.style.opacity = '0';
                setTimeout(() => {
                  if (window.__inspectorCleanup) {
                    window.__inspectorCleanup();
                  }
                }, 500);
              }, 2000);
            }
            return false;
          };

          // Attach listeners
          document.addEventListener('mousemove', handleMouseMove, true);
          document.addEventListener('click', handleClick, true);

          // Store cleanup function
          window.__inspectorCleanup = () => {
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('click', handleClick, true);
            overlay.remove();
            style.remove();
            window.__inspectorEnabled = false;
            delete window.__inspectorCleanup;
          };

          console.log('Inspect mode enabled');
        })();
        true;
      `);
    } else {
      // Disable inspect mode
      webViewRef.current?.injectJavaScript(`
        if (window.__inspectorCleanup) {
          window.__inspectorCleanup();
          console.log('Inspect mode disabled');
        }
        true;
      `);
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

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={insets.top}
        >
          {/* Header */}
          <View style={[styles.header, { paddingTop: insets.top }]}>
            <View style={styles.headerContent}>
              <View style={styles.headerLeft}>
                <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>

                <View style={styles.titleContainer}>
                  <Text style={styles.headerTitle}>Preview</Text>
                  <View style={[
                    styles.statusDot,
                    { backgroundColor: serverStatus === 'running' ? '#00D084' : serverStatus === 'checking' ? '#FFA500' : '#FF4444' }
                  ]} />
                </View>
              </View>

              <View style={styles.headerRight}>
                <TouchableOpacity
                  onPress={handleGoBack}
                  disabled={!canGoBack}
                  style={[styles.iconButton, !canGoBack && styles.iconButtonDisabled]}
                >
                  <Ionicons name="arrow-back" size={20} color={canGoBack ? "#FFFFFF" : "rgba(255, 255, 255, 0.3)"} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleGoForward}
                  disabled={!canGoForward}
                  style={[styles.iconButton, !canGoForward && styles.iconButtonDisabled]}
                >
                  <Ionicons name="arrow-forward" size={20} color={canGoForward ? "#FFFFFF" : "rgba(255, 255, 255, 0.3)"} />
                </TouchableOpacity>

                <TouchableOpacity onPress={handleRefresh} style={styles.iconButton}>
                  <Ionicons name="refresh" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

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
                onLoadStart={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.log('🔵 WebView load start:', nativeEvent.url);
                  setIsLoading(true);
                }}
                onLoadEnd={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.log('✅ WebView load end:', nativeEvent.url);

                  // Inject error listener and check content
                  setTimeout(() => {
                    webViewRef.current?.injectJavaScript(`
                      // Capture all errors
                      window.addEventListener('error', (e) => {
                        window.ReactNativeWebView?.postMessage(JSON.stringify({
                          type: 'JS_ERROR',
                          message: e.message,
                          filename: e.filename,
                          lineno: e.lineno,
                          colno: e.colno
                        }));
                      });

                      // Capture console errors
                      const originalError = console.error;
                      console.error = function(...args) {
                        originalError.apply(console, args);
                        window.ReactNativeWebView?.postMessage(JSON.stringify({
                          type: 'CONSOLE_ERROR',
                          args: args.map(a => String(a))
                        }));
                      };

                      try {
                        const rootElement = document.getElementById('root');
                        const hasContent = rootElement && rootElement.children.length > 0;
                        const bodyBgColor = window.getComputedStyle(document.body).backgroundColor;

                        // Check if bundle script is loaded
                        const scripts = Array.from(document.scripts).map(s => s.src);
                        const hasBundle = scripts.some(src => src.includes('bundle'));

                        window.ReactNativeWebView?.postMessage(JSON.stringify({
                          type: 'PAGE_INFO',
                          hasContent: hasContent,
                          rootChildren: rootElement ? rootElement.children.length : 0,
                          backgroundColor: bodyBgColor,
                          readyState: document.readyState,
                          scripts: scripts,
                          hasBundle: hasBundle
                        }));
                      } catch (e) {
                        console.error('Page info error:', e);
                      }
                      true;
                    `);
                  }, 2000);

                  setIsLoading(false);
                }}
                onLoadProgress={({ nativeEvent }) => {
                  console.log('⏳ WebView progress:', nativeEvent.progress);
                }}
                onNavigationStateChange={(navState) => {
                  console.log('🧭 Navigation state:', navState.url, navState.loading);
                  setCanGoBack(navState.canGoBack);
                  setCanGoForward(navState.canGoForward);
                }}
                onMessage={(event) => {
                  try {
                    const data = JSON.parse(event.nativeEvent.data);

                    if (data.type === 'PAGE_INFO') {
                      console.log('📄 Page info:', data);
                      console.log(`   Has content: ${data.hasContent}`);
                      console.log(`   Root children: ${data.rootChildren}`);
                      console.log(`   Background: ${data.backgroundColor}`);
                      console.log(`   Ready state: ${data.readyState}`);
                      console.log(`   Has bundle: ${data.hasBundle}`);
                      console.log(`   Scripts:`, data.scripts);
                    }

                    if (data.type === 'JS_ERROR') {
                      console.error('🔴 JavaScript Error in WebView:');
                      console.error(`   Message: ${data.message}`);
                      console.error(`   File: ${data.filename}:${data.lineno}:${data.colno}`);
                    }

                    if (data.type === 'CONSOLE_ERROR') {
                      console.error('🟠 Console Error in WebView:', data.args);
                    }

                    if (data.type === 'ELEMENT_SELECTED') {
                      console.log('Element selected:', data.element);

                      // Create a user-friendly message for the input
                      let elementSelector = `<${data.element.tag}>`;
                      if (data.element.id) {
                        elementSelector = `<${data.element.tag}#${data.element.id}>`;
                      } else if (data.element.className) {
                        const classes = data.element.className.split(' ').filter(c => c && !c.startsWith('__inspector')).slice(0, 2);
                        if (classes.length > 0) {
                          elementSelector = `<${data.element.tag}.${classes.join('.')}>`;
                        }
                      }

                      // Auto-fill input with Lovable-style prompt
                      const elementText = data.element.text?.trim() ? ` - "${data.element.text.substring(0, 30)}${data.element.text.length > 30 ? '...' : ''}"` : '';
                      setMessage(`Modifica ${elementSelector}${elementText}`);

                      // Focus input
                      inputRef.current?.focus();

                      // Disable inspect mode UI button (but keep overlay visible for 2s as handled by JS)
                      setIsInspectMode(false);

                      // Note: Don't call __inspectorCleanup here - let the JS setTimeout handle it
                      // This keeps the selection visible for 2 seconds before auto-cleanup
                    }
                  } catch (error) {
                    console.error('Error parsing WebView message:', error);
                  }
                }}
                onError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.error('❌ WebView error:', nativeEvent);
                  console.error('   Description:', nativeEvent.description);
                  console.error('   Code:', nativeEvent.code);
                  setServerStatus('stopped');
                }}
                onHttpError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.error('🔴 WebView HTTP error:', nativeEvent.statusCode);
                  console.error('   URL:', nativeEvent.url);
                }}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                scalesPageToFit={true}
                bounces={false}
                mixedContentMode="always"
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                originWhitelist={['*']}
              />
            </>
          )}
          </View>

          {/* Input Box at Bottom */}
          <View style={styles.inputContainer}>
            <View style={styles.inputBorder} />
            <View style={styles.inputWrapper}>
              {/* Inspect Mode Button */}
              <TouchableOpacity
                style={[styles.inspectButton, isInspectMode && styles.inspectButtonActive]}
                onPress={toggleInspectMode}
              >
                <Ionicons
                  name="scan-outline"
                  size={22}
                  color={isInspectMode ? AppColors.primary : 'rgba(255, 255, 255, 0.6)'}
                />
              </TouchableOpacity>

              <TextInput
                ref={inputRef}
                style={styles.input}
                value={message}
                onChangeText={setMessage}
                placeholder="Scrivi un messaggio..."
                placeholderTextColor="rgba(255, 255, 255, 0.4)"
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={[styles.sendButton, !message.trim() && styles.sendButtonDisabled]}
                onPress={handleSendMessage}
                disabled={!message.trim()}
              >
                <LinearGradient
                  colors={message.trim() ? [AppColors.primary, '#7C5DFA'] : ['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.05)']}
                  style={styles.sendButtonGradient}
                >
                  <Ionicons
                    name="send"
                    size={20}
                    color={message.trim() ? '#FFFFFF' : 'rgba(255, 255, 255, 0.3)'}
                  />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: '#000000',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 44,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonDisabled: {
    opacity: 0.3,
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
  inputContainer: {
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  inputBorder: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  inspectButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  inspectButtonActive: {
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
    borderColor: AppColors.primary,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: 10,
    fontSize: 15,
    color: '#FFFFFF',
    maxHeight: 100,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sendButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonGradient: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
