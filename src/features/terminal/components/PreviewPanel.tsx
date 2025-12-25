import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator, Linking, TextInput, KeyboardAvoidingView, Platform, ScrollView, Keyboard } from 'react-native';
import Reanimated, { useAnimatedStyle, useAnimatedReaction, runOnJS, useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { WebView } from 'react-native-webview';
import { AppColors } from '../../../shared/theme/colors';
import { detectProjectType, ProjectInfo } from '../../../core/preview/projectDetector';
import { config } from '../../../config/config';
import { useTerminalStore } from '../../../core/terminal/terminalStore';
import { useAuthStore } from '../../../core/auth/authStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkConfig } from '../../../providers/NetworkConfigProvider';
import { IconButton } from '../../../shared/components/atoms';
import { useSidebarOffset } from '../context/SidebarContext';
import { logCommand, logOutput, logError, logSystem } from '../../../core/terminal/terminalLogger';
import { gitAccountService } from '../../../core/git/gitAccountService';
import { serverLogService } from '../../../core/services/serverLogService';
import { fileWatcherService } from '../../../core/services/agentService';

// 🚀 HOLY GRAIL MODE - Uses Fly.io MicroVMs instead of Coder
const USE_HOLY_GRAIL = true;

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
        // Calculate new width: base 320 + sidebar offset (0 to 50)
        const newWidth = 320 + Math.abs(currentValue);
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
  const [webViewReady, setWebViewReady] = useState(false); // Track if WebView loaded successfully
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  // Environment variables state
  const [requiredEnvVars, setRequiredEnvVars] = useState<Array<{ key: string; defaultValue: string; description: string; required: boolean }> | null>(null);
  const [envVarValues, setEnvVarValues] = useState<Record<string, string>>({});
  const [envTargetFile, setEnvTargetFile] = useState<string>('.env');
  const [isSavingEnv, setIsSavingEnv] = useState(false);
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
  const prevWorkstationId = useRef<string | null>(null);
  const [message, setMessage] = useState('');
  const [isInspectMode, setIsInspectMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{ selector: string; text: string; tag?: string; className?: string; id?: string; innerHTML?: string } | null>(null);
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [webCompatibilityError, setWebCompatibilityError] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [aiMessages, setAiMessages] = useState<Array<{
    type: 'text' | 'tool_start' | 'tool_result' | 'user';
    content: string;
    tool?: string;
    success?: boolean;
    filePath?: string;
    pattern?: string;
  }>>([]);
  const [coderToken, setCoderToken] = useState<string | null>(null);
  const [flyMachineId, setFlyMachineId] = useState<string | null>(null);
  const aiScrollViewRef = useRef<ScrollView>(null);
  const fabWidthAnim = useRef(new Animated.Value(44)).current; // Start as small pill
  const fabOpacityAnim = useRef(new Animated.Value(1)).current;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Track keyboard height for input positioning
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  // NOTE: Server logs SSE connection is now handled by serverLogService (global singleton)
  // This keeps the connection alive even when PreviewPanel is closed

  // Reset preview state when project changes
  useEffect(() => {
    const currentId = currentWorkstation?.id;

    // If workstation changed, reset preview state
    if (prevWorkstationId.current && prevWorkstationId.current !== currentId) {
      console.log(`🔄 Project changed: ${prevWorkstationId.current} → ${currentId}, resetting preview`);
      setServerStatus('stopped');
      setPreviewServerUrl(null);
      setProjectInfo(null);
      setCoderToken(null);
      setIsStarting(false);
      setWebCompatibilityError(null);
      setWebViewReady(false); // Reset so loading spinner shows for new project


      // Disconnect from previous project's logs (will reconnect to new project when server starts)
      serverLogService.disconnect();

      // Clear any running health checks
      if (checkInterval.current) {
        clearInterval(checkInterval.current);
        checkInterval.current = null;
      }
    }

    prevWorkstationId.current = currentId || null;
  }, [currentWorkstation?.id]);

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

  // HOT RELOAD: Connect to file watcher when server is running
  useEffect(() => {
    const workstationId = currentWorkstation?.id;
    // Get username from workstation info (stored when project was created)
    const username = currentWorkstation?.githubAccountUsername?.toLowerCase() || 'default';
    if (serverStatus === 'running' && workstationId && username) {
      console.log('🔥 [HotReload] Connecting file watcher...');

      fileWatcherService.connect(workstationId, username, (change) => {
        console.log(`🔥 [HotReload] File changed: ${change.file}, refreshing preview...`);
        logOutput(`[Hot Reload] ${change.file} changed`, 'preview', 0);

        // Auto-refresh WebView
        if (webViewRef.current) {
          webViewRef.current.reload();
        }
      });
    }

    return () => {
      // Don't disconnect on unmount - keep watching
      // fileWatcherService.disconnect();
    };
  }, [serverStatus, currentWorkstation?.id]);

  // Check server status periodically (only when server is running, not when 'checking')
  // Note: When status is 'checking', health checks are started manually in handleStartServer
  // with the correct URL passed directly to avoid stale state issues
  useEffect(() => {
    // Only start periodic health checks if server is already running
    // Skip if 'stopped' (not started) or 'checking' (manual checks handle this)
    if (serverStatus !== 'running') {
      console.log(`⏸️ Skipping periodic health checks - status: ${serverStatus}`);
      return;
    }

    // Verify we have a valid preview URL
    if (currentPreviewUrl.includes('localhost:3001')) {
      console.log('⏸️ Skipping health checks - no valid preview URL yet');
      return;
    }

    console.log(`🔄 Starting periodic health checks for: ${currentPreviewUrl}`);

    // Check every 5 seconds to keep connection alive
    checkInterval.current = setInterval(checkServerStatus, 5000);

    return () => {
      if (checkInterval.current) {
        clearInterval(checkInterval.current);
      }
    };
  }, [currentPreviewUrl, serverStatus]);

  // Set default project info on mount
  // Actual detection is done by AI when user clicks Play
  useEffect(() => {
    if (!projectInfo) {
      // Set placeholder info - real info comes from AI when starting
      setProjectInfo({
        type: 'detecting',
        defaultPort: 3000,
        startCommand: '',
        installCommand: '',
        description: 'Click Play to detect and start'
      });
    }
  }, [currentWorkstation]);

  // Update preview URL when project type is detected
  // IMPORTANT: Only update if server is not already running (to avoid overwriting the actual running port)
  // And ONLY for local projects (no coderToken)
  useEffect(() => {
    if (projectInfo && projectInfo.defaultPort && apiUrl && serverStatus === 'stopped' && !coderToken) {
      // Extract the host from apiUrl (e.g., "http://192.168.1.10:3000" -> "192.168.1.10")
      const urlMatch = apiUrl.match(/https?:\/\/([^:\/]+)/);
      if (urlMatch) {
        const host = urlMatch[1];
        const newPreviewUrl = `http://${host}:${projectInfo.defaultPort}`;
        console.log(`🔄 Updating preview URL to: ${newPreviewUrl} (port ${projectInfo.defaultPort})`);
        setCurrentPreviewUrl(newPreviewUrl);
      }
    }
  }, [projectInfo, apiUrl, serverStatus]);

  const checkServerStatus = async (urlOverride?: string, retryCount = 0) => {
    const urlToCheck = urlOverride || currentPreviewUrl;
    const maxRetries = 60; // Max 60 retries = 60 seconds of checking

    try {
      console.log(`🔍 Checking server status at: ${urlToCheck} (attempt ${retryCount + 1})`);

      // Try to fetch the URL using GET (more reliable than HEAD across different servers)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout

      const response = await fetch(urlToCheck, {
        method: 'GET',
        headers: {
          'Coder-Session-Token': coderToken || '',
          'Accept': 'text/html'
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Consider any status < 500 as "server is running" (2xx, 3xx, 4xx all mean server is up)
      // 4xx just means the specific path isn't found, but server is responding
      if (response.status < 500) {
        console.log(`✅ Server is running! Status: ${response.status}`);
        // Only log the first time (when transitioning from checking to running)
        if (serverStatus !== 'running') {
          logOutput(`Server is running at ${urlToCheck}`, 'preview', 0);
        }
        setServerStatus('running');
        // Update the preview URL state if we used an override
        if (urlOverride && urlOverride !== currentPreviewUrl) {
          setCurrentPreviewUrl(urlOverride);
        }
      } else {
        console.log(`⚠️ Server error. Status: ${response.status}`);
        // Retry if we're still checking
        if (serverStatus === 'checking' && retryCount < maxRetries) {
          setTimeout(() => checkServerStatus(urlToCheck, retryCount + 1), 1000);
        }
      }
    } catch (error) {
      console.log(`❌ Server check failed: ${error.message}`);
      // Retry if server isn't ready yet and we're still in checking mode
      if (serverStatus === 'checking' && retryCount < maxRetries) {
        setTimeout(() => checkServerStatus(urlToCheck, retryCount + 1), 1000);
      }
    }
  };

  const handleStartServer = async () => {
    if (!currentWorkstation?.id) {
      logError('No workstation selected', 'preview');
      return;
    }

    setIsStarting(true);
    setStartingMessage('Analisi del progetto...');

    logSystem(`Starting AI-powered preview for ${currentWorkstation?.name || 'project'}...`, 'preview');

    try {
      // Get GitHub token for private repos
      const userId = useTerminalStore.getState().userId || 'anonymous';
      // Get user email from auth store (not the Firebase UID!)
      const userEmail = useAuthStore.getState().user?.email || 'anonymous@drape.dev';
      let githubToken: string | null = null;

      // Use repositoryUrl OR githubUrl (fallback)
      const repoUrl = currentWorkstation.repositoryUrl || currentWorkstation.githubUrl;
      console.log('📦 Repository URL to use:', repoUrl || '(NONE)');

      if (repoUrl) {
        const tokenResult = await gitAccountService.getTokenForRepo(userId, repoUrl);
        githubToken = tokenResult?.token || null;
        console.log('🔐 Preview: GitHub token found:', !!githubToken);
      }

      // Call new AI-powered preview endpoint
      // This endpoint handles everything: detection, install, start, health check
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes timeout (includes install)

      // Clean username for Coder (from email, not UID!)
      const username = userEmail.split('@')[0].replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();

      // 🚀 HOLY GRAIL: Use Fly.io preview endpoint
      const previewEndpoint = USE_HOLY_GRAIL
        ? `${apiUrl}/fly/preview/start`
        : `${apiUrl}/preview/start`;

      console.log(`🚀 Calling ${USE_HOLY_GRAIL ? 'Holy Grail' : 'Legacy'} preview for:`, currentWorkstation.id);
      console.log(`👤 User context: ${userEmail} (${username})`);

      const response = await fetch(previewEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // Holy Grail uses projectId, Legacy uses workstationId
          projectId: USE_HOLY_GRAIL ? currentWorkstation.id : undefined,
          workstationId: USE_HOLY_GRAIL ? undefined : currentWorkstation.id,
          repositoryUrl: repoUrl,
          githubToken: githubToken,
          userEmail: userEmail,
          username: username
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status: ${response.status}`);
      }

      const result = await response.json();
      console.log('📋 AI Preview result:', JSON.stringify(result, null, 2));

      // Check if env vars are required
      if (result.requiresEnvVars) {
        console.log('⚠️ Environment variables required');
        if (result.projectType) {
          setProjectInfo({
            type: result.projectType,
            defaultPort: 3000,
            startCommand: '',
            installCommand: '',
            description: result.projectType
          });
        }
        setRequiredEnvVars(result.envVars || []);
        setEnvTargetFile(result.targetFile || '.env');
        setEnvVarValues({});
        logSystem(result.message || 'Configurazione variabili d\'ambiente richiesta', 'preview');
        setIsStarting(false);
        return;
      }

      // Update preview URL and token
      if (result.previewUrl) {
        console.log('🔗 Preview URL:', result.previewUrl);
        setCurrentPreviewUrl(result.previewUrl);
        if (result.coderToken) {
          setCoderToken(result.coderToken);
        }
        if (result.machineId) {
          console.log('🆔 Fly Machine ID:', result.machineId);
          setFlyMachineId(result.machineId);

          // Phase 2: Set Gateway Session Cookie
          // This tells the backend Gateway which VM to route our requests to
          try {
            await fetch(`${apiUrl}/fly/session`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ machineId: result.machineId }),
              credentials: 'include' // Important for CORS cookies
            });
            console.log('✅ Gateway session cookie set');
          } catch (e) {
            console.warn('⚠️ Failed to set gateway session:', e);
          }
        }
      }

      if (result.projectType) {
        setProjectInfo({
          type: result.projectType,
          defaultPort: 3000,
          startCommand: '',
          installCommand: '',
          description: result.projectType
        });
      }


      // Check if server startup failed
      if (result.success === false) {
        console.error('❌ Server startup failed:', result.error);

        // Update project info if available
        if (result.projectType) {
          setProjectInfo({
            type: result.projectType,
            defaultPort: 3000,
            startCommand: '',
            installCommand: '',
            description: result.projectType
          });
        }

        // Show error to user
        logError(result.error || 'Il server non è riuscito ad avviarsi.', 'preview');
        if (result.errorDetails) {
          logSystem(`Dettagli: ${result.errorDetails.substring(0, 200)}...`, 'preview');
        }

        setServerStatus('stopped');
        setIsStarting(false);
        return;
      }

      // Update project info from AI detection
      if (result.projectType) {
        setProjectInfo({
          type: result.projectType,
          defaultPort: result.port,
          startCommand: result.commands?.start || 'npm start',
          installCommand: result.commands?.install || 'npm install',
          description: result.projectType
        });

        // Check if it's a mobile-only project (Expo/React Native)
        const projectTypeLower = result.projectType.toLowerCase();
        if (projectTypeLower.includes('expo') || projectTypeLower.includes('react native')) {
          console.warn('⚠️ Mobile-only project detected:', result.projectType);
          setWebCompatibilityError('Questa app è un\'app mobile nativa (Expo/React Native). La preview web potrebbe non funzionare correttamente. Per una preview completa, usa un dispositivo fisico o un emulatore.');
        }
      }

      // Update preview URL and token
      if (result.previewUrl) {
        console.log('🔗 Preview URL:', result.previewUrl);
        setCurrentPreviewUrl(result.previewUrl);
        if (result.coderToken) {
          setCoderToken(result.coderToken);
        }
      }

      // Connect to server logs stream (global service keeps connection alive)
      if (currentWorkstation?.id && apiUrl) {
        serverLogService.connect(currentWorkstation.id, apiUrl);
      }

      // Check if server is ready
      if (result.serverReady) {
        console.log('✅ Server is running!');
        console.log(`   Project type: ${result.projectType}`);
        console.log(`   Time: ${result.timing?.totalMs}ms`);
        console.log(`   Cached: ${result.timing?.cached}`);

        logOutput(`Server started at ${result.previewUrl}`, 'preview', 0);
        logSystem(`Project: ${result.projectType} | Port: ${result.port}`, 'preview');

        // Log backend info if available
        if (result.hasBackend && result.backendUrl) {
          console.log(`🔧 Backend server: ${result.backendUrl}`);
          logSystem(`Backend API: ${result.backendUrl}`, 'preview');
        }

        setServerStatus('running');
      } else {
        // Server started but health check didn't pass yet
        console.log('⏳ Server starting, health check pending...');
        logSystem(`Server starting at ${result.previewUrl}...`, 'preview');

        // Log backend info if available
        if (result.hasBackend && result.backendUrl) {
          console.log(`🔧 Backend server: ${result.backendUrl}`);
          logSystem(`Backend API: ${result.backendUrl}`, 'preview');
        }

        setServerStatus('checking');
        // Start local health checks - pass the URL directly to avoid stale state
        setTimeout(() => checkServerStatus(result.previewUrl), 1000);
      }

    } catch (error: any) {
      console.error('Failed to start server:', error);
      logError(`Failed to start: ${error.message || 'Connection error'}`, 'preview');
      setServerStatus('stopped');
    } finally {
      setIsStarting(false);
    }
  };

  // Save environment variables and restart server
  const handleSaveEnvVars = async () => {
    if (!currentWorkstation?.id) return;

    setIsSavingEnv(true);
    logSystem('Salvataggio variabili d\'ambiente...', 'preview');

    try {
      const response = await fetch(`${apiUrl}/preview/env`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workstationId: currentWorkstation.id,
          envVars: envVarValues,
          targetFile: envTargetFile,
        }),
      });

      if (!response.ok) {
        throw new Error('Errore nel salvataggio');
      }

      const result = await response.json();
      console.log('✅ Env vars saved:', result);

      logOutput(`Variabili salvate in ${result.file}`, 'preview', 0);

      // Clear the form and restart
      setRequiredEnvVars(null);
      setEnvVarValues({});

      // Restart server
      logSystem('Riavvio del server...', 'preview');
      handleStartServer();

    } catch (error: any) {
      console.error('Error saving env vars:', error);
      logError(`Errore: ${error.message}`, 'preview');
    } finally {
      setIsSavingEnv(false);
    }
  };

  const handleClose = () => {
    if (checkInterval.current) {
      clearInterval(checkInterval.current);
    }

    // NOTE: Don't disconnect from server logs here - keep connection alive
    // The global serverLogService will continue streaming logs to the terminal
    // Only disconnect when server is actually stopped or project changes

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

      // Disconnect from server logs since server is being stopped
      serverLogService.disconnect();
    }

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const handleRefresh = () => {
    // Clear cache explicitly to ensure new assets (like images/css) are loaded
    webViewRef.current?.clearCache(true);

    // Force fresh content by updating URL with cache-busting timestamp
    const baseUrl = currentPreviewUrl.split('?')[0];
    const newUrl = `${baseUrl}?_t=${Date.now()}`;
    setCurrentPreviewUrl(newUrl);

    // Explicit reload
    webViewRef.current?.reload();

    checkServerStatus();
  };

  // FAB expand animation - width depends on sidebar state
  const expandFab = () => {
    isExpandedShared.value = true;
    setIsInputExpanded(true);
    // Calculate width based on current sidebar position
    // sidebarTranslateX: 0 = sidebar visible, -50 = sidebar hidden
    const expandedWidth = 320 + Math.abs(sidebarTranslateX.value);
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

  const clearSelectedElement = () => {
    setSelectedElement(null);
    // Clear the visual selection overlay in the WebView
    webViewRef.current?.injectJavaScript(`
      if (window.__clearInspectSelection) {
        window.__clearInspectSelection();
      }
      true;
    `);
  };

  const handleSendMessage = async () => {
    if (!message.trim() && !selectedElement) return;
    if (!currentWorkstation?.id) {
      console.error('No workstation selected');
      return;
    }

    // Clear previous response accumulator but keep messages history
    setAiResponse('');
    // setAiMessages([]); // Don't clear history to allow conversation
    setIsAiLoading(true);

    const userMessage = message.trim();
    // Add user message to history locally
    const newUserMsg = { type: 'user' as const, content: userMessage };
    setAiMessages(prev => [...prev, newUserMsg]);

    const historyToSend = [...aiMessages, newUserMsg];

    const elementData = selectedElement ? {
      tag: selectedElement.tag || 'unknown',
      className: selectedElement.className || '',
      id: selectedElement.id || '',
      text: selectedElement.text || '',
      innerHTML: selectedElement.innerHTML || ''
    } : null;

    console.log('🔍 Sending inspect request:', { userMessage, elementData });

    // Clear input immediately for better UX
    setMessage('');

    // Keep selected element active for follow-up questions!
    // setSelectedElement(null); 

    // Don't clear visual selection overlay so user knows context is still active
    /* 
    webViewRef.current?.injectJavaScript(`
      if (window.__clearInspectSelection) {
        window.__clearInspectSelection();
      }
      true;
    `);
    */

    try {
      // Use XMLHttpRequest for SSE streaming with polling (React Native compatible)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // 🚀 HOLY GRAIL: Use Fly.io inspect endpoint
        const inspectEndpoint = USE_HOLY_GRAIL
          ? `${apiUrl}/fly/inspect`
          : `${apiUrl}/preview/inspect`;

        xhr.open('POST', inspectEndpoint);
        xhr.setRequestHeader('Content-Type', 'application/json');

        // Multi-user context
        const state = useTerminalStore.getState();
        const userId = state.userId || 'anonymous-user';
        const username = userId.split('@')[0].replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();

        let lastIndex = 0;
        let fullResponse = '';
        let pollInterval: NodeJS.Timeout | null = null;

        // Add state change listener for debugging
        xhr.onreadystatechange = () => {
          console.log('🔄 XHR state:', xhr.readyState, 'status:', xhr.status, 'responseLength:', xhr.responseText?.length || 0);
        };

        const processResponse = () => {
          const newData = xhr.responseText.substring(lastIndex);
          if (newData.length === 0) return;

          lastIndex = xhr.responseText.length;
          console.log('📦 Polling received:', newData.length, 'bytes');

          // Parse SSE events
          const lines = newData.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              if (data === '[DONE]') {
                setActiveTools([]);
                continue;
              }
              try {
                const parsed = JSON.parse(data);
                console.log('🎯 SSE event received:', parsed.type, parsed);

                // Handle tool events
                if (parsed.type === 'tool_start') {
                  console.log('🔧 Tool started:', parsed.tool);
                  setActiveTools(prev => [...prev, parsed.tool]);
                  setAiMessages(prev => [...prev, {
                    type: 'tool_start',
                    content: parsed.tool,
                    tool: parsed.tool
                  }]);
                } else if (parsed.type === 'tool_input') {
                  console.log('📥 Tool input:', parsed.tool, parsed.input);
                  // Add tool to active tools
                  setActiveTools(prev => prev.includes(parsed.tool) ? prev : [...prev, parsed.tool]);

                  setAiMessages(prev => {
                    const updated = [...prev];
                    // Check if tool_start already exists for this tool
                    const existingToolIndex = updated.findIndex(
                      m => (m.type === 'tool_start' || m.type === 'tool_result') && m.tool === parsed.tool && !m.success
                    );

                    if (existingToolIndex >= 0) {
                      // Update existing tool message with input details
                      updated[existingToolIndex] = {
                        ...updated[existingToolIndex],
                        filePath: parsed.input?.filePath,
                        pattern: parsed.input?.pattern
                      };
                    } else {
                      // Create new tool_start message (Gemini doesn't emit tool_start)
                      updated.push({
                        type: 'tool_start',
                        content: parsed.tool,
                        tool: parsed.tool,
                        filePath: parsed.input?.filePath,
                        pattern: parsed.input?.pattern
                      });
                    }
                    return updated;
                  });

                } else if (parsed.type === 'tool_result') {
                  console.log('✅ Tool result:', parsed.tool, parsed.success);
                  setActiveTools(prev => prev.filter(t => t !== parsed.tool));
                  setAiMessages(prev => {
                    const updated = [...prev];
                    for (let i = updated.length - 1; i >= 0; i--) {
                      if ((updated[i].type === 'tool_start' || updated[i].type === 'tool_result') && updated[i].tool === parsed.tool) {
                        updated[i] = {
                          ...updated[i],
                          type: 'tool_result',
                          success: parsed.success
                        };
                        break;
                      }
                    }
                    return updated;
                  });
                } else if (parsed.text) {
                  setAiMessages(prev => {
                    const last = prev[prev.length - 1];
                    if (last && last.type === 'text') {
                      const updated = [...prev];
                      const newContent = (last.content || '') + parsed.text;
                      updated[updated.length - 1] = {
                        ...last,
                        content: newContent
                      };
                      fullResponse = newContent;
                      return updated;
                    } else {
                      fullResponse = parsed.text;
                      return [...prev, { type: 'text', content: parsed.text }];
                    }
                  });
                  setAiResponse(fullResponse);
                }
              } catch (e) {
                // Ignore parse errors for partial data
              }
            }
          }
        };

        // Poll for new data every 100ms (React Native doesn't support onprogress reliably)
        pollInterval = setInterval(processResponse, 100);

        xhr.onload = () => {
          if (pollInterval) clearInterval(pollInterval);
          processResponse(); // Process any remaining data
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Request failed: ${xhr.status}`));
          }
        };

        xhr.onerror = () => {
          if (pollInterval) clearInterval(pollInterval);
          reject(new Error('Network error'));
        };
        xhr.ontimeout = () => {
          if (pollInterval) clearInterval(pollInterval);
          reject(new Error('Request timeout'));
        };

        xhr.send(JSON.stringify({
          description: selectedElement ? `Element <${selectedElement.tag}> with class "${selectedElement.className}"` : 'General Request',
          userPrompt: userMessage,
          elementInfo: elementData,
          projectId: currentWorkstation.id,
          workstationId: currentWorkstation.id,
          userEmail: userId,
          username: username,
          element: elementData,
          message: userMessage,
          history: historyToSend,
          selectedModel: 'claude-sonnet-4'
        }));
      });


    } catch (error: any) {
      console.error('❌ Inspect request failed:', error);
      setAiResponse(`Errore: ${error.message}`);
    } finally {
      setIsAiLoading(false);
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

          // Helper to update overlay position
          const updateOverlay = (target) => {
            if (!target || target.classList.contains('__inspector-overlay') ||
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

            let tooltipText = '<' + tagName + '>';
            if (id) tooltipText = '<' + tagName + '#' + id + '>';
            else if (classes) tooltipText = '<' + tagName + '.' + classes.split(' ').join('.') + '>';

            tooltip.textContent = tooltipText;
            lastElement = target;
          };

          // Mouse move handler (for desktop/web)
          const handleMouseMove = (e) => {
            updateOverlay(e.target);
          };

          // Touch start handler - show overlay on touch
          const handleTouchStart = (e) => {
            if (e.touches.length === 1) {
              const touch = e.touches[0];
              const target = document.elementFromPoint(touch.clientX, touch.clientY);
              updateOverlay(target);
            }
          };

          // Touch move handler - update overlay as finger moves
          const handleTouchMove = (e) => {
            if (e.touches.length === 1) {
              const touch = e.touches[0];
              const target = document.elementFromPoint(touch.clientX, touch.clientY);
              updateOverlay(target);
            }
          };

          // Helper to select element
          const selectElement = () => {
            if (!lastElement) return;

            // Remove listeners immediately to freeze interaction
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('touchstart', handleTouchStart, true);
            document.removeEventListener('touchmove', handleTouchMove, true);

            // Show "waiting" state while animations settle
            tooltip.textContent = '⏳ ...';
            overlay.style.opacity = '0.5';

            // Wait for animations to complete (CSS transitions typically 150-300ms)
            // Then re-capture the element's final position
            setTimeout(() => {
              // Re-calculate position after animations
              const rect = lastElement.getBoundingClientRect();
              overlay.style.top = (rect.top + window.scrollY) + 'px';
              overlay.style.left = (rect.left + window.scrollX) + 'px';
              overlay.style.width = rect.width + 'px';
              overlay.style.height = rect.height + 'px';
              overlay.style.opacity = '1';

              const tagName = lastElement.tagName.toLowerCase();
              const className = lastElement.className || '';
              const id = lastElement.id || '';
              const text = lastElement.textContent?.substring(0, 50) || '';

              // Change overlay style to show it's selected (not just hovered)
              overlay.style.borderColor = '#00D084';
              overlay.style.background = 'rgba(0, 208, 132, 0.2)';
              overlay.style.animation = 'none';
              overlay.style.boxShadow = '0 0 0 3px rgba(0, 208, 132, 0.3)';

              // Update tooltip to show "Selected!"
              tooltip.style.background = 'linear-gradient(135deg, #00D084 0%, #00B972 100%)';
              tooltip.textContent = '✓ Selected';

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

              // Keep selection visible until user sends message or removes it
              // Store a function to clear the selection from React Native
              window.__clearInspectSelection = () => {
                overlay.style.transition = 'opacity 0.3s ease';
                overlay.style.opacity = '0';
                setTimeout(() => {
                  if (window.__inspectorCleanup) {
                    window.__inspectorCleanup();
                  }
                }, 300);
              };
            }, 350); // Wait 350ms for CSS animations to settle
          };

          // Click handler (mouse)
          const handleClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectElement();
            return false;
          };

          // Touch end handler - select element on touch end
          const handleTouchEnd = (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectElement();
            return false;
          };

          // Attach listeners for both mouse and touch
          document.addEventListener('mousemove', handleMouseMove, true);
          document.addEventListener('click', handleClick, true);
          document.addEventListener('touchstart', handleTouchStart, { capture: true, passive: false });
          document.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false });
          document.addEventListener('touchend', handleTouchEnd, { capture: true, passive: false });

          // Store cleanup function
          window.__inspectorCleanup = () => {
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('click', handleClick, true);
            document.removeEventListener('touchstart', handleTouchStart, true);
            document.removeEventListener('touchmove', handleTouchMove, true);
            document.removeEventListener('touchend', handleTouchEnd, true);
            overlay.remove();
            style.remove();
            window.__inspectorEnabled = false;
            delete window.__inspectorCleanup;
            delete window.__clearInspectSelection;
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
              {serverStatus === 'stopped' && requiredEnvVars ? (
                // Environment variables form
                <View style={styles.envVarsScreen}>
                  {/* Close button */}
                  <TouchableOpacity
                    onPress={handleClose}
                    style={[styles.startCloseButton, { top: insets.top + 8, right: 16 }]}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={20} color="rgba(255, 255, 255, 0.5)" />
                  </TouchableOpacity>

                  {/* Env vars form - scrollable list */}
                  <ScrollView
                    style={[styles.envVarsContainer, { marginTop: insets.top + 44 }]}
                    contentContainerStyle={styles.envVarsScrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View style={styles.envVarsHeader}>
                      <Text style={styles.envVarsTitle}>Variabili d'Ambiente</Text>
                      <Text style={styles.envVarsSubtitle}>
                        Richieste per l'avvio del progetto
                      </Text>
                    </View>

                    <View style={styles.envVarsList}>
                      {requiredEnvVars.map((envVar) => (
                        <View key={envVar.key} style={styles.envVarItem}>
                          <View style={styles.envVarLabelRow}>
                            <Text style={styles.envVarKey}>{envVar.key}</Text>
                            {envVar.required && (
                              <Text style={styles.envVarRequired}>*</Text>
                            )}
                          </View>
                          {envVar.description && (
                            <Text style={styles.envVarDescription}>{envVar.description}</Text>
                          )}
                          <TextInput
                            style={styles.envVarInput}
                            value={envVarValues[envVar.key] || ''}
                            onChangeText={(text) => setEnvVarValues(prev => ({
                              ...prev,
                              [envVar.key]: text
                            }))}
                            placeholder={envVar.defaultValue || 'Inserisci valore...'}
                            placeholderTextColor="rgba(255, 255, 255, 0.3)"
                            autoCapitalize="none"
                            autoCorrect={false}
                          />
                        </View>
                      ))}
                    </View>
                  </ScrollView>

                  {/* Fixed bottom buttons */}
                  <View style={[styles.envVarsActions, { paddingBottom: insets.bottom + 16 }]}>
                    <TouchableOpacity
                      style={[styles.envVarsSaveButton, isSavingEnv && styles.envVarsSaveButtonDisabled]}
                      onPress={handleSaveEnvVars}
                      disabled={isSavingEnv}
                      activeOpacity={0.7}
                    >
                      {isSavingEnv ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="play" size={16} color="#fff" />
                          <Text style={styles.envVarsSaveText}>Avvia</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.envVarsSkipButton}
                      onPress={() => setRequiredEnvVars(null)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.envVarsSkipText}>Annulla</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : serverStatus === 'stopped' ? (
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
                  {/* Show loading spinner until WebView is ready */}
                  {(!webViewReady || isLoading) && (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color={AppColors.primary} />
                      <Text style={styles.loadingText}>Caricamento anteprima...</Text>
                    </View>
                  )}
                  {webCompatibilityError && (
                    <View style={styles.errorOverlay}>
                      <View style={styles.errorCard}>
                        <Ionicons name="phone-portrait-outline" size={48} color={AppColors.primary} />
                        <Text style={styles.errorTitle}>App Mobile Nativa</Text>
                        <Text style={styles.errorMessage}>{webCompatibilityError}</Text>
                        <TouchableOpacity
                          style={styles.errorCloseButton}
                          onPress={handleClose}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.errorCloseText}>Chiudi</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                  <WebView
                    ref={webViewRef}
                    source={{
                      uri: currentPreviewUrl,
                      headers: {
                        'Coder-Session-Token': coderToken || '',
                        'session_token': coderToken || '',
                        // 🚀 HOLY GRAIL: Force routing to specific MicroVM
                        // The flyMachineId state and its update logic are assumed to be defined elsewhere in the component.
                        // This change only applies the header if flyMachineId is available.
                        // For example, in handleStartServer:
                        // if (result.machineId) {
                        //     console.log('🆔 Fly Machine ID:', result.machineId);
                        //     setFlyMachineId(result.machineId);
                        // }
                        // And the state declaration:
                        // const [flyMachineId, setFlyMachineId] = useState<string | null>(null);
                        ...(flyMachineId ? { 'Fly-Force-Instance-Id': flyMachineId } : {})
                      }
                    }}
                    style={[
                      styles.webView,
                      { opacity: webViewReady ? 1 : 0, position: webViewReady ? 'relative' : 'absolute' }
                    ]}

                    injectedJavaScriptBeforeContentLoaded={`
                      (function() {
                        const token = "${coderToken || ''}";
                        if (token) {
                          const cookieOptions = "; path=/; SameSite=Lax";
                          document.cookie = "session_token=" + token + cookieOptions;
                          document.cookie = "coder_session=" + token + cookieOptions;
                          document.cookie = "coder_session_token=" + token + cookieOptions;
                          console.log("🍪 Session cookies injected");

                          // If we are at the login page, it means the initial request lacked cookies.
                          // Setting cookies and reloading should fix it.
                          if (window.location.pathname.includes('/login') && !window.__drapeReloaded) {
                            window.__drapeReloaded = true;
                            if (window.ReactNativeWebView) {
                              window.ReactNativeWebView.postMessage(JSON.stringify({ 
                                type: 'AUTH_REDIRECT', 
                                message: 'Detected login page, injecting cookies and reloading...' 
                              }));
                            }
                            window.location.reload();
                          }
                        }
                      })();
                      true;
                    `}

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
                        // Check root element OR body children (for static sites/directory listing)
                        const bodyChildren = document.body ? document.body.children.length : 0;
                        const hasContent = (rootElement && rootElement.children.length > 0) || bodyChildren > 0;
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
                      if (nativeEvent.progress === 1) {
                        setIsLoading(false);
                      }
                    }}
                    onNavigationStateChange={(navState) => {
                      console.log('🧭 Navigation state:', navState.url, navState.loading);
                      setCanGoBack(navState.canGoBack);
                      setCanGoForward(navState.canGoForward);

                      // Ensure isLoading is synced with navigation
                      if (navState.loading) {
                        setIsLoading(true);
                      } else if (!navState.loading) {
                        setIsLoading(false);
                      }
                    }}
                    onMessage={(event) => {
                      try {
                        const data = JSON.parse(event.nativeEvent.data);

                        if (data.type === 'AUTH_REDIRECT') {
                          console.log('🔐 [Auth] ' + data.message);
                        }

                        if (data.type === 'PAGE_INFO') {
                          console.log('📄 Page info:', data);
                          console.log(`   Has content: ${data.hasContent}`);
                          console.log(`   Root children: ${data.rootChildren}`);
                          console.log(`   Background: ${data.backgroundColor}`);
                          console.log(`   Ready state: ${data.readyState}`);
                          console.log(`   Has bundle: ${data.hasBundle}`);
                          console.log(`   Scripts:`, data.scripts);

                          // Mark WebView as ready if we have real content (scripts or children)
                          if (data.scripts?.length > 0 || data.rootChildren > 0 || data.hasContent) {
                            console.log('✅ WebView content verified, showing preview');
                            setWebViewReady(true);
                          }
                        }


                        if (data.type === 'JS_ERROR') {
                          // Ignore generic "Script error" CORS errors - they don't provide useful info
                          if (data.message === 'Script error.' && !data.filename) {
                            console.log('ℹ️ Ignoring generic Script error (CORS)');
                            return;
                          }
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
                            // Handle SVG elements where className is SVGAnimatedString object
                            const classNameStr = typeof data.element.className === 'string'
                              ? data.element.className
                              : (data.element.className?.baseVal || '');
                            const classes = classNameStr.split(' ').filter(c => c && !c.startsWith('__inspector')).slice(0, 2);
                            if (classes.length > 0) {
                              elementSelector = `<${data.element.tag}.${classes.join('.')}>`;
                            }
                          }

                          // Store selected element with full info for AI analysis
                          const elementText = data.element.text?.trim() ? data.element.text.substring(0, 40) + (data.element.text.length > 40 ? '...' : '') : '';
                          // Normalize className for storage (handle SVGAnimatedString)
                          const normalizedClassName = typeof data.element.className === 'string'
                            ? data.element.className
                            : (data.element.className?.baseVal || '');
                          setSelectedElement({
                            selector: elementSelector,
                            text: elementText,
                            tag: data.element.tag,
                            className: normalizedClassName,
                            id: data.element.id,
                            innerHTML: data.element.innerHTML
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

                      // Auto-retry on 502 (Bad Gateway) - server might still be starting
                      if (nativeEvent.statusCode === 502 && webViewRef.current) {
                        console.log('🔄 502 detected, auto-retrying in 2s...');
                        setTimeout(() => {
                          if (webViewRef.current) {
                            webViewRef.current.reload();
                          }
                        }, 2000);
                      }
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
                    sharedCookiesEnabled={true}
                  />
                </>
              )}
            </View>
          </KeyboardAvoidingView>

          {/* AI Response Panel - Shows when there's a response */}
          {(aiMessages.length > 0 || isAiLoading) && (
            <View style={[styles.aiResponsePanel, { bottom: keyboardHeight > 0 ? keyboardHeight + 70 : insets.bottom + 70 }]}>
              <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.aiResponseHeader}>
                <View style={styles.aiResponseHeaderLeft}>
                  <View style={styles.headerIconContainer}>
                    <Ionicons name="sparkles" size={14} color="#fff" />
                  </View>
                  <Text style={styles.aiResponseTitle}>
                    {activeTools.length > 0 ? `Esecuzione: ${activeTools[activeTools.length - 1]}` : 'Analisi AI'}
                  </Text>
                  {activeTools.length > 0 && (
                    <ActivityIndicator size="small" color={AppColors.primary} style={{ marginLeft: 8 }} />
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => { setAiResponse(''); setAiMessages([]); }}
                  style={styles.aiResponseClose}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={16} color="rgba(255, 255, 255, 0.4)" />
                </TouchableOpacity>
              </View>
              <ScrollView
                ref={aiScrollViewRef}
                style={styles.aiResponseScroll}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => {
                  // Auto-scroll to bottom when content changes
                  aiScrollViewRef.current?.scrollToEnd({ animated: true });
                }}
              >
                {isAiLoading && aiMessages.length === 0 ? (
                  <View style={styles.aiMessageRow}>
                    <View style={styles.aiThreadContainer}>
                      <Animated.View style={[styles.aiThreadDot, { backgroundColor: '#6E6E80' }]} />
                    </View>
                    <View style={styles.aiMessageContent}>
                      <Text style={styles.aiThinkingText}>Thinking...</Text>
                    </View>
                  </View>
                ) : (
                  aiMessages.map((msg, index) => {
                    if (msg.type === 'user') {
                      return (
                        <View key={index} style={[styles.aiMessageRow, { justifyContent: 'flex-end', paddingRight: 4, marginBottom: 14 }]}>
                          <LinearGradient
                            colors={['#007AFF', '#0055FF']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.userMessageBubble}
                          >
                            <Text style={styles.userMessageText}>{msg.content}</Text>
                          </LinearGradient>
                        </View>
                      );
                    }

                    if (msg.type === 'tool_start' || msg.type === 'tool_result') {
                      // Tool badge rendering (like ChatPage)
                      const toolConfig: Record<string, { icon: string; label: string; color: string }> = {
                        'read_file': { icon: 'document-text-outline', label: 'READ', color: '#58A6FF' },
                        'edit_file': { icon: 'create-outline', label: 'EDIT', color: '#3FB950' },
                        'glob_files': { icon: 'search-outline', label: 'GLOB', color: '#A371F7' },
                        'search_in_files': { icon: 'code-slash-outline', label: 'SEARCH', color: '#FFA657' },
                      };

                      const config = toolConfig[msg.tool || ''] || { icon: 'cog-outline', label: 'TOOL', color: '#8B949E' };
                      const isComplete = msg.type === 'tool_result';
                      const isSuccess = msg.success !== false;

                      // Get display name (filename only from path, or pattern)
                      const displayName = msg.filePath
                        ? msg.filePath.split('/').pop() || msg.filePath
                        : msg.pattern || '';

                      return (
                        <View key={index} style={styles.aiMessageRow}>
                          <View style={styles.aiThreadContainer}>
                            <View style={[
                              styles.aiThreadDot,
                              { backgroundColor: isComplete ? (isSuccess ? '#3FB950' : '#F85149') : config.color }
                            ]} />
                          </View>
                          <View style={styles.aiToolRow}>
                            <View style={[styles.aiToolBadge, { backgroundColor: `${config.color}15`, borderColor: `${config.color}30` }]}>
                              <Ionicons name={config.icon as any} size={12} color={config.color} />
                              <Text style={[styles.aiToolBadgeText, { color: config.color }]}>{config.label}</Text>
                            </View>
                            {displayName && (
                              <Text style={styles.aiToolFileName} numberOfLines={1}>{displayName}</Text>
                            )}
                            {!isComplete ? (
                              <ActivityIndicator size="small" color={config.color} style={{ marginLeft: 8 }} />
                            ) : (
                              <Ionicons
                                name={isSuccess ? 'checkmark-circle' : 'close-circle'}
                                size={16}
                                color={isSuccess ? '#3FB950' : '#F85149'}
                                style={{ marginLeft: 8 }}
                              />
                            )}
                          </View>
                        </View>
                      );
                    } else {
                      // Text message rendering
                      return (
                        <View key={index} style={styles.aiMessageRow}>
                          <View style={styles.aiThreadContainer}>
                            <View style={[styles.aiThreadDot, { backgroundColor: '#6E6E80' }]} />
                          </View>
                          <View style={styles.aiMessageContent}>
                            <Text style={styles.aiResponseText}>{msg.content}</Text>
                          </View>
                        </View>
                      );
                    }
                  })
                )}
              </ScrollView>
            </View>
          )}


          {/* Animated FAB / Input Box - Only show when server is running */}
          {serverStatus === 'running' && (
            <Reanimated.View style={[styles.fabInputWrapper, { bottom: keyboardHeight > 0 ? keyboardHeight + 6 : insets.bottom + 8, left: 12 }]}>
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
                      onPress={clearSelectedElement}
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

                      {/* Dismiss Keyboard Button - only show when keyboard is open */}
                      {keyboardHeight > 0 && (
                        <TouchableOpacity
                          onPress={() => Keyboard.dismiss()}
                          style={styles.previewInputButton}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name="chevron-down"
                            size={18}
                            color="rgba(255, 255, 255, 0.5)"
                          />
                        </TouchableOpacity>
                      )}

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
    zIndex: 200, // Above keyboard background filler
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
  // Environment variables form styles
  envVarsScreen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  envVarsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  envVarsScrollContent: {
    paddingBottom: 20,
  },
  envVarsHeader: {
    alignItems: 'center',
    marginBottom: 20,
    gap: 4,
  },
  envVarsTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    marginTop: 8,
  },
  envVarsSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
  },
  envVarsList: {
    gap: 12,
  },
  envVarItem: {
    gap: 4,
  },
  envVarLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  envVarKey: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'monospace',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  envVarRequired: {
    fontSize: 11,
    color: AppColors.primary,
    fontWeight: '600',
  },
  envVarDescription: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 2,
  },
  envVarInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  envVarsActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
    alignItems: 'center',
  },
  envVarsSaveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  envVarsSaveButtonDisabled: {
    opacity: 0.6,
  },
  envVarsSaveText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  envVarsSkipButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  envVarsSkipText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  // Error overlay styles
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  errorCard: {
    backgroundColor: 'rgba(30, 30, 46, 0.95)',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    maxWidth: 300,
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.2)',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  errorCloseButton: {
    backgroundColor: AppColors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 10,
  },
  errorCloseText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  // AI Response Panel styles
  aiResponsePanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    maxHeight: 300,
    backgroundColor: 'rgba(15, 15, 25, 0.7)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  aiResponseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  aiResponseHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiResponseTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.primary,
  },
  aiResponseClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  aiResponseScroll: {
    maxHeight: 240,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  aiResponseText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 20,
  },
  aiLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  aiLoadingText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  // New ChatPage-like styles for AI messages
  aiMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  aiThreadContainer: {
    width: 20,
    alignItems: 'center',
    paddingTop: 6,
  },
  aiThreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  aiMessageContent: {
    flex: 1,
  },
  aiThinkingText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    fontStyle: 'italic',
  },
  aiToolRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiToolBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  aiToolBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  aiToolFileName: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    marginLeft: 8,
    fontFamily: 'monospace',
    maxWidth: 150,
  },
  headerIconContainer: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMessageBubble: {
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  userMessageText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
});
