import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator, Linking, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import Reanimated, { useAnimatedStyle, useAnimatedReaction, runOnJS, useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { WebView } from 'react-native-webview';
import { AppColors } from '../../../shared/theme/colors';
import { detectProjectType, ProjectInfo } from '../../../core/preview/projectDetector';
import { config } from '../../../config/config';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkConfig } from '../../../providers/NetworkConfigProvider';
import { IconButton } from '../../../shared/components/atoms';
import { useSidebarOffset } from '../context/SidebarContext';
import { logCommand, logOutput, logError, logSystem } from '../../../core/terminal/terminalLogger';

interface Props {
  onClose: () => void;
  previewUrl: string;
  projectName?: string;
  projectPath?: string; // Path to the project directory
}

export const PreviewPanel = ({ onClose, previewUrl, projectName, projectPath }: Props) => {
  const {
    currentWorkstation,
    previewServerStatus: globalServerStatus,
    previewServerUrl: globalServerUrl,
    setPreviewServerStatus,
    setPreviewServerUrl
  } = useTerminalStore();
  const { apiUrl } = useNetworkConfig();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current; // Fade in animation
  const { sidebarTranslateX } = useSidebarOffset();

  // Animate left position - WebView handles resize
  const containerAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      left: 44 + sidebarTranslateX.value,
    };
  });

  // Function to animate FAB width to target
  const animateFabWidth = (targetWidth: number) => {
    Animated.spring(fabWidthAnim, {
      toValue: targetWidth,
      useNativeDriver: false,
      damping: 20,
      stiffness: 180,
    }).start();
  };

  // Track if FAB is expanded for the animated reaction (shared value for UI thread access)
  const isExpandedShared = useSharedValue(false);

  // React to sidebar changes when FAB is expanded
  useAnimatedReaction(
    () => sidebarTranslateX.value,
    (currentValue, previousValue) => {
      // Only animate if FAB is expanded and sidebar position changed
      if (isExpandedShared.value && previousValue !== null && currentValue !== previousValue) {
        // Calculate new width: base 300 + sidebar offset (0 to 50)
        const newWidth = 300 + Math.abs(currentValue);
        runOnJS(animateFabWidth)(newWidth);
      }
    },
    []
  );
  const [isLoading, setIsLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  // Initialize from global store - preserves state when switching tabs
  const [serverStatus, setServerStatusLocal] = useState<'checking' | 'running' | 'stopped'>(globalServerStatus);

  // Wrapper to update both local and global state
  const setServerStatus = (status: 'checking' | 'running' | 'stopped') => {
    setServerStatusLocal(status);
    setPreviewServerStatus(status);
  };

  const [isStarting, setIsStarting] = useState(false);
  const [startingMessage, setStartingMessage] = useState('');
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  // Initialize from global store if available, otherwise use prop
  const [currentPreviewUrl, setCurrentPreviewUrlLocal] = useState(globalServerUrl || previewUrl);

  // Wrapper to update both local and global URL
  const setCurrentPreviewUrl = (url: string) => {
    setCurrentPreviewUrlLocal(url);
    setPreviewServerUrl(url);
  };
  const webViewRef = useRef<WebView>(null);
  const inputRef = useRef<TextInput>(null);
  const checkInterval = useRef<NodeJS.Timeout | null>(null);
  const [message, setMessage] = useState('');
  const [isInspectMode, setIsInspectMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{ selector: string; text: string } | null>(null);
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const fabWidthAnim = useRef(new Animated.Value(44)).current; // Start as small pill
  const fabOpacityAnim = useRef(new Animated.Value(1)).current;

  // Opening animation - fade in
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, []);

  // Update currentPreviewUrl when previewUrl prop changes
  // But don't overwrite if we already have a running server URL from global store
  useEffect(() => {
    if (previewUrl && previewUrl !== currentPreviewUrl && !globalServerUrl) {
      setCurrentPreviewUrl(previewUrl);
    }
  }, [previewUrl]);

  // NOTE: Server is NOT stopped on unmount - only when user clicks X button
  // This allows navigating to other pages while keeping server running

  // Check server status periodically (only if server is expected to be running)
  useEffect(() => {
    // Only start health checks if:
    // 1. Server status is 'checking' or 'running' (not 'stopped')
    // 2. We have a valid preview URL (not localhost:3001 placeholder)
    if (serverStatus === 'stopped' || currentPreviewUrl.includes('localhost:3001')) {
      console.log('⏸️ Skipping health checks - server not started yet');
      return;
    }

    // Wait 1 second before starting checks to allow URL to be updated from backend response
    const startTimeout = setTimeout(() => {
      checkServerStatus();

      // Check every 3 seconds
      checkInterval.current = setInterval(checkServerStatus, 3000);
    }, 1000);

    return () => {
      clearTimeout(startTimeout);
      if (checkInterval.current) {
        clearInterval(checkInterval.current);
      }
    };
  }, [currentPreviewUrl, serverStatus]);

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
          `${apiUrl}/workstation/${currentWorkstation.id}/detect-project`
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

  // Update preview URL when project type is detected
  useEffect(() => {
    if (projectInfo && projectInfo.defaultPort && apiUrl) {
      // Extract the host from apiUrl (e.g., "http://192.168.1.10:3000" -> "192.168.1.10")
      const urlMatch = apiUrl.match(/https?:\/\/([^:\/]+)/);
      if (urlMatch) {
        const host = urlMatch[1];
        const newPreviewUrl = `http://${host}:${projectInfo.defaultPort}`;
        console.log(`🔄 Updating preview URL to: ${newPreviewUrl} (port ${projectInfo.defaultPort})`);
        setCurrentPreviewUrl(newPreviewUrl);
      }
    }
  }, [projectInfo, apiUrl]);

  const checkServerStatus = async () => {
    try {
      console.log(`🔍 Checking server status at: ${currentPreviewUrl}`);

      // Try to fetch the URL
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(currentPreviewUrl, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        console.log(`✅ Server is running! Status: ${response.status}`);
        // Only log the first time (when transitioning from checking to running)
        if (serverStatus !== 'running') {
          logOutput(`Server is running at ${currentPreviewUrl}`, 'preview', 0);
        }
        setServerStatus('running');
      } else {
        console.log(`⚠️ Server responded but not OK. Status: ${response.status}`);
        // Don't set to stopped - just keep checking
      }
    } catch (error) {
      console.log(`❌ Server check failed: ${error.message}`);
      // Don't set to stopped - server might just be loading, keep the WebView visible
    }
  };

  const handleStartServer = async () => {
    if (!projectInfo) return;

    setIsStarting(true);
    setStartingMessage('Preparazione ambiente...');

    // Log the technical command to global terminal (for developers)
    logCommand(projectInfo.startCommand, 'preview');
    logSystem(`Starting server for ${currentWorkstation?.name || 'project'}...`, 'preview');

    try {
      setStartingMessage('Avvio del server...');
      console.log('Starting server with command:', projectInfo.startCommand);
      console.log('Current workstation:', currentWorkstation);
      console.log('Workstation ID to send:', currentWorkstation?.id);

      // Call backend API to execute the start command
      // Use longer timeout for Expo start (can take up to 40 seconds with health check)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 seconds timeout

      const response = await fetch(`${apiUrl}${config.endpoints.terminal}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: projectInfo.startCommand,
          workstationId: currentWorkstation?.id, // Use workstation ID from store
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      setStartingMessage('Quasi pronto...');
      const result = await response.json();
      console.log('📋 Server start result:', JSON.stringify(result, null, 2));

      // If there's a preview URL in the response, update our preview URL
      if (result.previewUrl) {
        console.log('🔗 Preview URL detected:', result.previewUrl);
        setStartingMessage('Connessione in corso...');
        setCurrentPreviewUrl(result.previewUrl); // Update the URL to check
      } else {
        console.log('⚠️ No preview URL in response');
      }

      // NEW: Backend now does health check and tells us if server is ready
      // This is production-ready: backend polls the server until it's verified running
      if (result.serverReady) {
        console.log('✅ Server is verified running by backend health check!');
        if (result.healthCheck) {
          console.log(`   Health check passed after ${result.healthCheck.attempts} attempts`);
          console.log(`   URL checked: ${result.healthCheck.url}`);
        }
        // Log success to global terminal (technical for developers)
        logOutput(`Server started successfully at ${result.previewUrl || currentPreviewUrl}`, 'preview', 0);
        setServerStatus('running');
      } else if (result.previewUrl) {
        // If we have a preview URL, try checking - server might be running even with exitCode != 0
        // This handles static servers that exit the spawning process but stay running
        console.log('🔍 Preview URL found, starting health checks...');
        console.log(`   Exit code: ${result.exitCode}`);
        console.log(`   Preview URL: ${result.previewUrl}`);
        // Log to terminal (technical for developers)
        logSystem(`Server starting at ${result.previewUrl}...`, 'preview');
        setServerStatus('checking');
        // Give server a moment to fully start, then check
        setTimeout(() => checkServerStatus(), 500);
      } else if (result.exitCode === 0) {
        // Fallback: If exitCode is 0 but serverReady is false, start checking
        console.log('⚠️ Server command executed but not verified ready');
        console.log(`   Exit code: ${result.exitCode}`);
        console.log(`   Preview URL: ${result.previewUrl || 'none'}`);
        console.log(`   Server ready: ${result.serverReady}`);
        if (result.healthCheck) {
          console.log(`   Health check result: ${JSON.stringify(result.healthCheck)}`);
        }
        console.log('   Starting local health checks...');
        // Log to terminal
        logSystem('Waiting for server to start...', 'preview');
        setServerStatus('checking');
        checkServerStatus();
      } else {
        // Command failed and no preview URL
        console.log('❌ Server command failed');
        console.log(`   Exit code: ${result.exitCode}`);
        console.log(`   Error output: ${result.error}`);
        // Log error to global terminal
        logError(`Server failed to start: ${result.error || 'Unknown error'}`, 'preview');
        setServerStatus('stopped');
      }
    } catch (error) {
      console.error('Failed to start server:', error);
      // Log error to global terminal
      logError(`Failed to start server: ${error.message || 'Connection error'}`, 'preview');
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

    // Stop the server if running
    if (serverStatus === 'running' || serverStatus === 'checking') {
      const portMatch = currentPreviewUrl.match(/:(\d+)/);
      if (portMatch && currentWorkstation?.id) {
        const port = parseInt(portMatch[1]);
        console.log(`🛑 Stopping server on port ${port}`);

        // Log stop command to global terminal
        logCommand(`kill -9 $(lsof -ti:${port})`, 'preview');
        logSystem(`Stopping server on port ${port}...`, 'preview');

        fetch(`${apiUrl}terminal/stop-server`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workstationId: currentWorkstation.id,
            port: port
          }),
        }).then(() => {
          console.log(`✅ Server stopped on port ${port}`);
          logOutput(`Server stopped on port ${port}`, 'preview', 0);
        }).catch((error) => {
          console.log(`⚠️ Failed to stop server: ${error.message}`);
          logError(`Failed to stop server: ${error.message}`, 'preview');
        });
      }

      // Reset global state when server is stopped
      setPreviewServerStatus('stopped');
      setPreviewServerUrl(null);
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

  // FAB expand animation - width depends on sidebar state
  const expandFab = () => {
    isExpandedShared.value = true;
    setIsInputExpanded(true);
    // Calculate width based on current sidebar position
    // sidebarTranslateX: 0 = sidebar visible, -50 = sidebar hidden
    const expandedWidth = 300 + Math.abs(sidebarTranslateX.value);
    Animated.spring(fabWidthAnim, {
      toValue: expandedWidth,
      useNativeDriver: false,
      damping: 18,
      stiffness: 200,
    }).start(() => {
      inputRef.current?.focus();
    });
  };

  // FAB collapse animation - slower and smoother than expand
  const collapseFab = () => {
    isExpandedShared.value = false;
    setIsInputExpanded(false); // Immediately hide input content
    Animated.spring(fabWidthAnim, {
      toValue: 44, // Collapsed width
      useNativeDriver: false,
      damping: 22, // Higher damping = less bounce
      stiffness: 140, // Lower stiffness = slower, gentler motion
    }).start();
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
    if (message.trim() || selectedElement) {
      // Combine selected element with message
      let fullMessage = message.trim();

      if (selectedElement) {
        const elementContext = `[Selected Element: ${selectedElement.selector}${selectedElement.text ? ` - "${selectedElement.text}"` : ''}]`;
        fullMessage = selectedElement && message.trim()
          ? `${elementContext}\n${message.trim()}`
          : elementContext;
      }

      console.log('Message sent:', fullMessage);
      console.log('Selected element:', selectedElement);

      // TODO: Implement message sending logic with fullMessage

      // Clear both message and selected element after sending
      setMessage('');
      setSelectedElement(null);
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

      <Reanimated.View style={[styles.container, containerAnimatedStyle]}>
        <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
          <LinearGradient
            colors={['#0a0a0a', '#000000']}
            style={StyleSheet.absoluteFill}
          />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={insets.top}
        >
          {/* Header - Only show when server is running */}
          {serverStatus === 'running' && (
            <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
              <View style={styles.headerRow}>
                {/* Close */}
                <TouchableOpacity
                  onPress={handleClose}
                  style={styles.closeButton}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={18} color="rgba(255, 255, 255, 0.7)" />
                </TouchableOpacity>

                {/* URL Bar - centered */}
                <View style={styles.urlBar}>
                  <View style={[
                    styles.statusIndicator,
                    { backgroundColor: '#00D084' }
                  ]} />
                  <Text style={styles.urlText} numberOfLines={1}>
                    {currentPreviewUrl ? currentPreviewUrl.replace(/^https?:\/\//, '') : 'localhost'}
                  </Text>
                </View>

                {/* Refresh */}
                <TouchableOpacity
                  onPress={handleRefresh}
                  style={styles.refreshButton}
                  activeOpacity={0.7}
                >
                  <Ionicons name="refresh" size={16} color="rgba(255, 255, 255, 0.7)" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* WebView Preview or Start Screen */}
          <View style={styles.webViewContainer}>
          {serverStatus === 'stopped' ? (
            // Server not running - Device mockup style with ChatPage background
            <View style={styles.startScreen}>
              {/* ChatPage gradient background */}
              <LinearGradient
                colors={['#0a0a0a', '#121212', '#1a1a1a', '#0f0f0f']}
                locations={[0, 0.3, 0.7, 1]}
                style={StyleSheet.absoluteFill}
              >
                <View style={styles.glowTop} />
                <View style={styles.glowBottom} />
              </LinearGradient>

              {/* Close button top right */}
              <TouchableOpacity
                onPress={handleClose}
                style={[styles.startCloseButton, { top: insets.top + 8, right: 16 }]}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color="rgba(255, 255, 255, 0.6)" />
              </TouchableOpacity>

              {/* iPhone 15 Pro style mockup */}
              <View style={styles.iphoneMockup}>
                {/* Status bar area - beside Dynamic Island */}
                <View style={styles.statusBarArea}>
                  {/* Time - left of Dynamic Island */}
                  <Text style={styles.fakeTime}>9:41</Text>

                  {/* Dynamic Island - center */}
                  <View style={styles.dynamicIsland} />

                  {/* Icons - right of Dynamic Island */}
                  <View style={styles.fakeStatusIcons}>
                    <Ionicons name="wifi" size={10} color="#fff" />
                    <Ionicons name="battery-full" size={10} color="#fff" />
                  </View>
                </View>

                {/* Screen content - fake app UI */}
                <View style={styles.iphoneScreen}>

                  {/* Fake app content */}
                  <View style={styles.fakeAppContent}>
                    {/* Header */}
                    <View style={styles.fakeHeader}>
                      <View style={styles.fakeAvatar} />
                      <View style={styles.fakeHeaderText}>
                        <View style={[styles.fakeLine, { width: 80 }]} />
                        <View style={[styles.fakeLine, { width: 50, opacity: 0.5 }]} />
                      </View>
                    </View>

                    {/* Cards */}
                    <View style={styles.fakeCard}>
                      <View style={styles.fakeCardImage} />
                      <View style={[styles.fakeLine, { width: '70%', marginTop: 8 }]} />
                      <View style={[styles.fakeLine, { width: '40%', opacity: 0.5 }]} />
                    </View>

                    <View style={[styles.fakeCard, { opacity: 0.6 }]}>
                      <View style={styles.fakeCardImage} />
                      <View style={[styles.fakeLine, { width: '60%', marginTop: 8 }]} />
                    </View>
                  </View>

                  {/* Home indicator */}
                  <View style={styles.homeIndicator} />
                </View>

                {/* Side buttons */}
                <View style={styles.iphoneSideButton} />
                <View style={styles.iphoneVolumeUp} />
                <View style={styles.iphoneVolumeDown} />
              </View>

              {/* Bottom section */}
              <View style={styles.startBottomSection}>
                <TouchableOpacity
                  style={[styles.startButton, isStarting && styles.startButtonDisabled]}
                  onPress={handleStartServer}
                  disabled={isStarting}
                  activeOpacity={0.7}
                >
                  {isStarting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="play" size={20} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
                {/* Status message during startup */}
                {isStarting && startingMessage && (
                  <View style={styles.startingMessageContainer}>
                    <Text style={styles.startingMessage}>{startingMessage}</Text>
                  </View>
                )}
                {!isStarting && projectInfo && (
                  <Text style={styles.projectTypeText}>
                    {projectInfo.description || projectInfo.type}
                  </Text>
                )}
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

                      // Create element selector string
                      let elementSelector = `<${data.element.tag}>`;
                      if (data.element.id) {
                        elementSelector = `<${data.element.tag}#${data.element.id}>`;
                      } else if (data.element.className) {
                        const classes = data.element.className.split(' ').filter(c => c && !c.startsWith('__inspector')).slice(0, 2);
                        if (classes.length > 0) {
                          elementSelector = `<${data.element.tag}.${classes.join('.')}>`;
                        }
                      }

                      // Store selected element as attachment-like object
                      const elementText = data.element.text?.trim() ? data.element.text.substring(0, 40) + (data.element.text.length > 40 ? '...' : '') : '';
                      setSelectedElement({
                        selector: elementSelector,
                        text: elementText
                      });

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
                // Performance optimizations for smooth sidebar animation
                renderToHardwareTextureAndroid={true}
                shouldRasterizeIOS={true}
                cacheEnabled={true}
                cacheMode="LOAD_CACHE_ELSE_NETWORK"
              />
            </>
          )}
          </View>
        </KeyboardAvoidingView>

          {/* Animated FAB / Input Box - Only show when server is running */}
          {serverStatus === 'running' && (
            <Reanimated.View style={[styles.fabInputWrapper, { bottom: insets.bottom + 8, left: 12 }]}>
              {/* Selected Element Chip - only when expanded */}
              {isInputExpanded && selectedElement && (
                <View style={styles.selectedElementContainer}>
                  <View style={styles.selectedElementChip}>
                    <View style={styles.chipIconContainer}>
                      <Ionicons name="code-slash" size={14} color={AppColors.primary} />
                    </View>
                    <View style={styles.chipContent}>
                      <Text style={styles.chipSelector}>{selectedElement.selector}</Text>
                      {selectedElement.text && (
                        <Text style={styles.chipText} numberOfLines={1}>{selectedElement.text}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => setSelectedElement(null)}
                      style={styles.chipClose}
                    >
                      <Ionicons name="close-circle" size={16} color="rgba(255, 255, 255, 0.6)" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Animated FAB that expands into input */}
              <Animated.View
                style={[
                  styles.fabAnimated,
                  { width: fabWidthAnim }
                ]}
              >
                <BlurView intensity={60} tint="dark" style={styles.fabBlur}>
                  {isInputExpanded ? (
                    <>
                      {/* Close Button */}
                      <TouchableOpacity
                        onPress={collapseFab}
                        style={styles.previewInputButton}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="close"
                          size={20}
                          color="rgba(255, 255, 255, 0.5)"
                        />
                      </TouchableOpacity>

                      {/* Inspect Mode Button */}
                      <TouchableOpacity
                        onPress={toggleInspectMode}
                        style={[
                          styles.previewInputButton,
                          isInspectMode && styles.previewInputButtonActive
                        ]}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="scan-outline"
                          size={18}
                          color={isInspectMode ? AppColors.primary : 'rgba(255, 255, 255, 0.5)'}
                        />
                      </TouchableOpacity>

                      {/* Text Input */}
                      <TextInput
                        ref={inputRef}
                        style={styles.previewInput}
                        value={message}
                        onChangeText={setMessage}
                        placeholder="Chiedi modifiche..."
                        placeholderTextColor="rgba(255, 255, 255, 0.35)"
                        multiline
                        maxLength={500}
                        onSubmitEditing={handleSendMessage}
                        keyboardAppearance="dark"
                        returnKeyType="send"
                      />

                      {/* Send Button */}
                      <TouchableOpacity
                        onPress={handleSendMessage}
                        disabled={!message.trim()}
                        style={styles.previewSendButton}
                        activeOpacity={0.7}
                      >
                        <View style={[
                          styles.previewSendButtonInner,
                          message.trim() && styles.previewSendButtonActive
                        ]}>
                          <Ionicons
                            name="arrow-up"
                            size={16}
                            color={message.trim() ? '#fff' : 'rgba(255, 255, 255, 0.3)'}
                          />
                        </View>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      onPress={expandFab}
                      style={styles.fabButton}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="pencil" size={20} color="#fff" />
                    </TouchableOpacity>
                  )}
                </BlurView>
              </Animated.View>
            </Reanimated.View>
          )}
        </Animated.View>
      </Reanimated.View>
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
    // left is animated via containerAnimatedStyle
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1000,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  urlBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  urlText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  webViewContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#0a0a0a', // Dark background to prevent white flash
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent', // Let container background show during resize
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
    paddingBottom: 100,
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
  startCloseButton: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  // iPhone 15 Pro mockup styles
  iphoneMockup: {
    width: 220,
    height: 450,
    backgroundColor: '#1c1c1e',
    borderRadius: 44,
    borderWidth: 4,
    borderColor: '#3a3a3c',
    overflow: 'hidden',
    position: 'relative',
    // Titanium frame effect
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  statusBarArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: '#1a1a2e',
    marginHorizontal: 4,
    marginTop: 4,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
  dynamicIsland: {
    width: 72,
    height: 20,
    backgroundColor: '#000',
    borderRadius: 12,
    marginHorizontal: 8,
  },
  iphoneScreen: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    marginHorizontal: 4,
    marginBottom: 4,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: 'hidden',
  },
  fakeTime: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    width: 32,
  },
  fakeStatusIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    width: 32,
    justifyContent: 'flex-end',
  },
  fakeAppContent: {
    flex: 1,
    paddingHorizontal: 14,
    gap: 12,
  },
  fakeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  fakeAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(139, 124, 246, 0.4)',
  },
  fakeHeaderText: {
    gap: 4,
  },
  fakeLine: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  fakeCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 10,
  },
  fakeCardImage: {
    width: '100%',
    height: 70,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
  },
  homeIndicator: {
    width: 100,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignSelf: 'center',
    marginBottom: 8,
    marginTop: 'auto',
  },
  // Side buttons
  iphoneSideButton: {
    position: 'absolute',
    right: -4,
    top: 120,
    width: 4,
    height: 60,
    backgroundColor: '#3a3a3c',
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
  },
  iphoneVolumeUp: {
    position: 'absolute',
    left: -4,
    top: 100,
    width: 4,
    height: 28,
    backgroundColor: '#3a3a3c',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  iphoneVolumeDown: {
    position: 'absolute',
    left: -4,
    top: 140,
    width: 4,
    height: 28,
    backgroundColor: '#3a3a3c',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  startBottomSection: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  startButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startingMessageContainer: {
    marginTop: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  startingMessage: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
  projectTypeText: {
    marginTop: 12,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
  },
  selectedElementContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  selectedElementChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 30, 46, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.2)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 6,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  chipIconContainer: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipContent: {
    flex: 1,
    gap: 1,
  },
  chipSelector: {
    fontSize: 11,
    fontWeight: '600',
    color: AppColors.primary,
    fontFamily: 'monospace',
    letterSpacing: 0.2,
  },
  chipText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    lineHeight: 13,
  },
  chipClose: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewInputButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  previewInputButtonActive: {
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
  },
  previewInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 8,
    maxHeight: 100,
    lineHeight: 20,
  },
  previewSendButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSendButtonInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSendButtonActive: {
    backgroundColor: AppColors.primary,
  },
  // New animated FAB styles
  fabInputWrapper: {
    position: 'absolute',
    // left is animated via fabWrapperAnimatedStyle (12 when sidebar visible, -38 when hidden -> expands)
    right: 12,
    alignItems: 'flex-end', // FAB starts from right
  },
  fabAnimated: {
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  fabBlur: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  fabButton: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
