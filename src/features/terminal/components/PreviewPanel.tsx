import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator, Linking, TextInput, KeyboardAvoidingView, Platform, ScrollView, Keyboard } from 'react-native';
import Reanimated, { useAnimatedStyle, useAnimatedReaction, runOnJS, useSharedValue, FadeIn, FadeOut, ZoomIn, ZoomOut, SlideInUp, SlideOutUp } from 'react-native-reanimated';
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
import { useAgentStream } from '../../../hooks/api/useAgentStream';

// 🚀 HOLY GRAIL MODE - Uses Fly.io MicroVMs instead of Coder
const USE_HOLY_GRAIL = true;

interface Props {
  onClose: () => void;
  previewUrl: string;
  projectName?: string;
  projectPath?: string; // Path to the project directory
}

export const PreviewPanel = React.memo(({ onClose, previewUrl, projectName, projectPath }: Props) => {
  // Usa selettori specifici per evitare re-render su ogni log del backend
  const currentWorkstation = useTerminalStore((state) => state.currentWorkstation);
  const globalServerStatus = useTerminalStore((state) => state.previewServerStatus);
  const globalServerUrl = useTerminalStore((state) => state.previewServerUrl);
  const setPreviewServerStatus = useTerminalStore((state) => state.setPreviewServerStatus);
  const setPreviewServerUrl = useTerminalStore((state) => state.setPreviewServerUrl);
  const globalFlyMachineId = useTerminalStore((state) => state.flyMachineId);
  const setGlobalFlyMachineId = useTerminalStore((state) => state.setFlyMachineId);
  const projectMachineIds = useTerminalStore((state) => state.projectMachineIds);
  const projectPreviewUrls = useTerminalStore((state) => state.projectPreviewUrls);
  const selectedModel = useTerminalStore((state) => state.selectedModel);
  const { apiUrl } = useNetworkConfig();

  // Agent stream for full tool execution (like ChatPage)
  const {
    start: startAgent,
    stop: stopAgent,
    isRunning: agentStreaming,
    events: agentEvents,
    reset: resetAgent
  } = useAgentStream('fast');
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
  const serverStatusRef = useRef<'checking' | 'running' | 'stopped'>(globalServerStatus);

  // Wrapper to update both local and global state
  const setServerStatus = (status: 'checking' | 'running' | 'stopped') => {
    setServerStatusLocal(status);
    setPreviewServerStatus(status);
    serverStatusRef.current = status;
  };

  const [isStarting, setIsStarting] = useState(false);
  const [startingMessage, setStartingMessage] = useState('');
  const [webViewReady, setWebViewReady] = useState(false); // Track if WebView loaded successfully
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [hasWebUI, setHasWebUI] = useState(true); // Whether to show WebView (false = show terminal output)
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]); // Terminal output for CLI projects
  const terminalScrollRef = useRef<ScrollView>(null); // Auto-scroll terminal output
  const logsXhrRef = useRef<XMLHttpRequest | null>(null); // SSE connection for logs (using XHR for RN compatibility)
  // Environment variables state
  const [requiredEnvVars, setRequiredEnvVars] = useState<Array<{ key: string; defaultValue: string; description: string; required: boolean }> | null>(null);
  const [envVarValues, setEnvVarValues] = useState<Record<string, string>>({});
  const [envTargetFile, setEnvTargetFile] = useState<string>('.env');
  const [isSavingEnv, setIsSavingEnv] = useState(false);
  // Initialize from global store if available, otherwise use prop
  // For Holy Grail: previewUrl comes from SSE (Fly.io agent URL), NOT from apiUrl (backend)
  const getInitialPreviewUrl = () => {
    // For Holy Grail: never use localhost:3000 as a fallback on devices
    if (globalServerUrl && !globalServerUrl.includes('localhost:3000')) return globalServerUrl;
    // Otherwise use default 
    return previewUrl || '';
  };
  const [currentPreviewUrl, setCurrentPreviewUrlLocal] = useState(getInitialPreviewUrl());

  // Wrapper to update both local and global URL
  const setCurrentPreviewUrl = (url: string) => {
    setCurrentPreviewUrlLocal(url);
    setPreviewServerUrl(url, currentWorkstation?.id);
  };
  const webViewRef = useRef<WebView>(null);
  const inputRef = useRef<TextInput>(null);
  const checkInterval = useRef<NodeJS.Timeout | null>(null);
  const prevWorkstationId = useRef<string | null>(null);
  const releaseTimerRef = useRef<NodeJS.Timeout | null>(null); // Timer for auto-release after 5 min
  const [message, setMessage] = useState('');
  const [isInspectMode, setIsInspectMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{ selector: string; text: string; tag?: string; className?: string; id?: string; innerHTML?: string } | null>(null);
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [isChatMinimized, setIsChatMinimized] = useState(false);
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
  // Chat ID for saving preview conversations to chat history
  const [previewChatId, setPreviewChatId] = useState<string | null>(null);
  const [coderToken, setCoderToken] = useState<string | null>(null);
  // Use global store for machine ID to persist across navigation
  const flyMachineIdRef = useRef<string | null>(globalFlyMachineId);
  const aiScrollViewRef = useRef<ScrollView>(null);
  const fabWidthAnim = useRef(new Animated.Value(44)).current; // Start as small pill
  const fabOpacityAnim = useRef(new Animated.Value(1)).current;
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [startupSteps, setStartupSteps] = useState<Array<{ id: string; label: string; status: 'pending' | 'active' | 'complete' | 'error' }>>([
    { id: 'analyzing', label: 'Analisi progetto', status: 'pending' },
    { id: 'cloning', label: 'Preparazione file', status: 'pending' },
    { id: 'detecting', label: 'Configurazione', status: 'pending' },
    { id: 'booting', label: 'Accensione server', status: 'pending' },
    { id: 'installing', label: 'Installazione dipendenze', status: 'pending' },
    { id: 'starting', label: 'Avvio dev server', status: 'pending' },
    { id: 'ready', label: 'Ci siamo quasi', status: 'pending' },
  ]);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const maskOpacityAnim = useRef(new Animated.Value(1)).current;
  const [smoothProgress, setSmoothProgress] = useState(0);
  const [targetProgress, setTargetProgress] = useState(0); // Step-based target progress
  const [displayedMessage, setDisplayedMessage] = useState('');
  const [isNextJsProject, setIsNextJsProject] = useState(false); // Track if Next.js for time estimates

  // Error handling state
  const [previewError, setPreviewError] = useState<{ message: string; timestamp: Date } | null>(null);
  const [isSendingReport, setIsSendingReport] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const recentLogsRef = useRef<string[]>([]); // Store recent logs for error reporting

  // Session expiration state (when VM is released due to idle timeout)
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState('');

  // Rich Loading Messages
  const LOADING_MESSAGES: Record<string, string[]> = {
    analyzing: [
      "Analisi del workspace...",
      "Lettura configurazione...",
      "Verifica requisiti..."
    ],
    cloning: [
      "Recupero file sorgente...",
      "Sincronizzazione repository...",
      "Ottimizzazione risorse...",
      "Verifica integrità..."
    ],
    detecting: [
      "Identificazione framework...",
      "Configurazione ambiente...",
      "Preparazione runtime..."
    ],
    booting: [
      "Allocazione risorse cloud...",
      "Avvio container isolato...",
      "Inizializzazione servizi...",
      "Collegamento network...",
      "Attesa risposta server..."
    ],
    ready: [
      "Finalizzazione...",
      "Apertura connessione sicura...",
      "Ci siamo!"
    ]
  };

  // Process agent events and update aiMessages (like ChatPage)
  useEffect(() => {
    if (agentEvents.length === 0) return;

    // Get latest event
    const latestEvent = agentEvents[agentEvents.length - 1];

    if (latestEvent.type === 'tool_start' && latestEvent.tool) {
      setActiveTools(prev => [...prev, latestEvent.tool!]);
      setAiMessages(prev => [...prev, {
        type: 'tool_start',
        content: latestEvent.tool!,
        tool: latestEvent.tool
      }]);
    }
    else if (latestEvent.type === 'tool_input' && latestEvent.tool) {
      setActiveTools(prev => prev.includes(latestEvent.tool!) ? prev : [...prev, latestEvent.tool!]);
      setAiMessages(prev => {
        const updated = [...prev];
        const existingToolIndex = updated.findIndex(
          m => (m.type === 'tool_start' || m.type === 'tool_result') && m.tool === latestEvent.tool && !m.success
        );
        if (existingToolIndex >= 0) {
          updated[existingToolIndex] = {
            ...updated[existingToolIndex],
            filePath: (latestEvent as any).input?.filePath,
            pattern: (latestEvent as any).input?.pattern
          };
        } else {
          updated.push({
            type: 'tool_start',
            content: latestEvent.tool!,
            tool: latestEvent.tool,
            filePath: (latestEvent as any).input?.filePath,
            pattern: (latestEvent as any).input?.pattern
          });
        }
        return updated;
      });
    }
    else if (latestEvent.type === 'tool_complete' && latestEvent.tool) {
      setActiveTools(prev => prev.filter(t => t !== latestEvent.tool));
      setAiMessages(prev => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if ((updated[i].type === 'tool_start' || updated[i].type === 'tool_result') && updated[i].tool === latestEvent.tool) {
            updated[i] = {
              ...updated[i],
              type: 'tool_result',
              success: !latestEvent.error
            };
            break;
          }
        }
        return updated;
      });
    }
    else if (latestEvent.type === 'text_delta') {
      const delta = (latestEvent as any).delta;
      if (delta) {
        setAiMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.type === 'text') {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...last,
              content: (last.content || '') + delta
            };
            return updated;
          } else {
            return [...prev, { type: 'text', content: delta }];
          }
        });
      }
    }
    else if (latestEvent.type === 'message' || latestEvent.type === 'response') {
      const msg = (latestEvent as any).content || (latestEvent as any).message || (latestEvent as any).text || (latestEvent as any).output;
      if (msg) {
        setAiMessages(prev => {
          const last = prev[prev.length - 1];
          // Don't add duplicate if we already have this content from streaming
          if (last && last.type === 'text' && last.content === msg) {
            return prev;
          }
          return [...prev, { type: 'text', content: msg }];
        });
      }
    }
    else if (latestEvent.type === 'complete' || latestEvent.type === 'done') {
      setIsAiLoading(false);
      setActiveTools([]);
    }
    else if (latestEvent.type === 'error' || latestEvent.type === 'fatal_error') {
      setIsAiLoading(false);
      setActiveTools([]);
      const errorMsg = latestEvent.error || latestEvent.message || 'Error';
      setAiMessages(prev => [...prev, { type: 'text', content: `❌ ${errorMsg}` }]);
    }
  }, [agentEvents]);

  // Save chat messages when agent completes
  useEffect(() => {
    if (!agentStreaming && agentEvents.length > 0 && previewChatId && aiMessages.length > 0) {
      // Convert aiMessages to TerminalItem format for storage
      const messagesToSave = aiMessages.map((msg, index) => ({
        id: `preview-msg-${index}`,
        content: msg.content || '',
        type: msg.type === 'user' ? 'user_message' : 'output',
        timestamp: new Date(),
        toolInfo: msg.tool ? {
          tool: msg.tool,
          input: { filePath: msg.filePath, pattern: msg.pattern },
          status: msg.success !== undefined ? (msg.success ? 'completed' : 'error') : 'running'
        } : undefined
      }));

      console.log('💾 [PreviewPanel] Saving chat messages:', { chatId: previewChatId, messageCount: messagesToSave.length });

      useTerminalStore.getState().updateChat(previewChatId, {
        messages: messagesToSave,
        lastUsed: new Date(),
      });
    }
  }, [agentStreaming, agentEvents.length, previewChatId, aiMessages]);

  // Extensions for "fanne di più" - cycling messages within steps
  useEffect(() => {
    if (!currentStepId || serverStatus === 'stopped') return;

    const messages = LOADING_MESSAGES[currentStepId] || [startingMessage || "Elaborazione..."];
    let msgIndex = 0;

    setDisplayedMessage(messages[0]);

    const interval = setInterval(() => {
      // Don't wrap around immediately for the last step if possible, or just cycle slower
      msgIndex = (msgIndex + 1) % messages.length;
      setDisplayedMessage(messages[msgIndex]);
    }, 4000); // Slower: every 4s

    return () => clearInterval(interval);
  }, [currentStepId, serverStatus]);

  // Smooth progress animation - progressive 1-100, guided by real backend steps
  // Each step has a range, progress animates within that range over time
  useEffect(() => {
    let interval: NodeJS.Timeout;

    // Step ranges - progress can animate within each step's range
    // For Next.js, "starting" step (compilation) takes longest, so it has biggest range
    const stepRanges: Record<string, { min: number; max: number }> = {
      'analyzing': { min: 1, max: 12 },
      'cloning': { min: 12, max: 20 },
      'detecting': { min: 20, max: 28 },
      'warning': { min: 28, max: 32 },
      'booting': { min: 32, max: 45 },
      'install': { min: 45, max: 55 },
      'installing': { min: 45, max: 55 },
      'starting': { min: 55, max: 92 }, // Big range for compilation time
      'ready': { min: 92, max: 100 }
    };

    if (serverStatus === 'stopped') {
      setSmoothProgress(0);
      setTargetProgress(0);
    } else {
      interval = setInterval(() => {
        setSmoothProgress(prev => {
          // If webview is ready, zoom to 100%
          if (webViewReady) {
            return Math.min(prev + 3, 100);
          }

          // Get current step's range
          const range = currentStepId ? stepRanges[currentStepId] : { min: 0, max: 10 };
          if (!range) return prev;

          // If below step's min, move quickly to get there
          if (prev < range.min) {
            return Math.min(prev + 0.5, range.min);
          }

          // Within step's range - animate slowly toward max
          // For Next.js "starting" step, this will take 3-5 minutes to go from 55% to 92%
          if (prev < range.max) {
            // Slower animation for longer steps (like "starting")
            const stepSize = range.max - range.min;
            const baseSpeed = isNextJsProject && currentStepId === 'starting'
              ? 0.008  // Very slow for Next.js compilation (~5 min to complete range)
              : stepSize > 20
                ? 0.02   // Slow for big ranges
                : 0.08;  // Normal for small ranges

            // Slow down as approaching max (asymptotic)
            const distToMax = range.max - prev;
            const speed = Math.max(0.005, baseSpeed * (distToMax / stepSize));

            return Math.min(prev + speed, range.max - 0.5);
          }

          // At max of current step - tiny movement to show activity
          return prev + 0.002;
        });
      }, 50);
    }

    return () => clearInterval(interval);
  }, [serverStatus, webViewReady, targetProgress, currentStepId, isNextJsProject]);

  // Pulse animation for active step
  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    const shouldPulse = serverStatus === 'checking' || (serverStatus === 'running' && !webViewReady);

    if (shouldPulse) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.85,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      // Return to full opacity when not actively pulsing/waiting
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }
    return () => animation?.stop();
  }, [serverStatus, webViewReady]);

  // Handle mask fade-out when webViewReady becomes true
  useEffect(() => {
    if (webViewReady) {
      Animated.timing(maskOpacityAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start();
    } else {
      maskOpacityAnim.setValue(1);
    }
  }, [webViewReady]);

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

  // Reset OR RESTORE preview state when project changes
  useEffect(() => {
    const currentId = currentWorkstation?.id;

    // If workstation changed, handle state transition
    if (prevWorkstationId.current && prevWorkstationId.current !== currentId) {
      console.log(`🔄 Project changed: ${prevWorkstationId.current} → ${currentId}`);

      // 🔑 NEW: Check if the NEW project has an existing machineId in the store
      const restoredMachineId = currentId ? projectMachineIds[currentId] : null;
      const restoredUrl = currentId ? projectPreviewUrls[currentId] : null;

      if (restoredMachineId) {
        console.log(`✨ [MultiProject] Restoring session for ${currentId} (machine: ${restoredMachineId}, url: ${restoredUrl})`);

        // Sync routing cookie immediately 
        fetch(`${apiUrl}/fly/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ machineId: restoredMachineId, projectId: currentId }),
          credentials: 'include'
        }).catch(err => console.warn('Failed to sync restored session cookie:', err));

        // Restore URL and status
        if (restoredUrl) {
          setCurrentPreviewUrl(restoredUrl);
        }

        setServerStatus('checking');
        setGlobalFlyMachineId(restoredMachineId, currentId);

        // Reconnect to logs for this project
        serverLogService.connect(currentId);

        // TRIGGER HEALTH CHECK to verify if VM/Server is still alive
        // Give cookie a small moment to sync
        setTimeout(() => {
          checkServerStatus(restoredUrl || undefined);
        }, 500);
      } else {
        // Full reset for projects with no active session
        console.log(`   No active session for ${currentId}, showing Start Preview`);
        setServerStatus('stopped');
        setPreviewServerUrl(null);
        setGlobalFlyMachineId(null);
        setProjectInfo(null);
        setCoderToken(null);
        setIsStarting(false);
        setWebCompatibilityError(null);
        setWebViewReady(false);
        serverLogService.disconnect();
      }

      // Clear any running health checks from previous project
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

    // RESTORE SESSION COOKIE ONLY: If we have a running machine ID, ensure the cookie is set
    // but DON'T change the serverStatus automatically. Let the user click "Start Preview".
    if (globalFlyMachineId && apiUrl) {
      console.log('🔄 Syncing session cookie for:', globalFlyMachineId);
      flyMachineIdRef.current = globalFlyMachineId;

      fetch(`${apiUrl}/fly/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId: globalFlyMachineId }),
        credentials: 'include'
      }).then(() => console.log('✅ Session cookie synced'))
        .catch(e => console.warn('⚠️ Failed to sync session:', e));
    }
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

  // DISABLED for Holy Grail architecture - preview URL comes from SSE stream
  // The Fly.io agent URL (https://drape-workspaces.fly.dev) proxies to the dev server
  // DO NOT set preview URL based on local IP + port - that's for local-only mode
  /*
  useEffect(() => {
    if (projectInfo && projectInfo.defaultPort && apiUrl && serverStatus === 'stopped' && !coderToken) {
      const urlMatch = apiUrl.match(/https?:\/\/([^:\/]+)/);
      if (urlMatch) {
        const host = urlMatch[1];
        const newPreviewUrl = `http://${host}:${projectInfo.defaultPort}`;
        console.log(`🔄 Updating preview URL to: ${newPreviewUrl} (port ${projectInfo.defaultPort})`);
        setCurrentPreviewUrl(newPreviewUrl);
      }
    }
  }, [projectInfo, apiUrl, serverStatus]);
  */

  // Fallback: Force WebView ready after timeout if messages don't arrive
  useEffect(() => {
    if (serverStatus === 'running' && !webViewReady) {
      const timer = setTimeout(() => {
        console.log('⚠️ [WebView] Forcing ready due to 10s timeout - messages may not have arrived');
        setWebViewReady(true);
      }, 10000); // 10 seconds - shorter timeout for better UX
      return () => clearTimeout(timer);
    }
  }, [serverStatus, webViewReady]);

  // ============ AUTO-RECOVERY: Request machineId if missing ============
  // 🔑 FIX 3: If server is running but machineId is lost, request a new session
  useEffect(() => {
    // 🔑 FIX: Also trigger if serverStatus is stopped but we have no machineId (might have been lost on backend)
    const shouldRecover = (serverStatus === 'running' || serverStatus === 'stopped') && !globalFlyMachineId && currentWorkstation?.id;

    if (shouldRecover) {
      console.log(`⚠️ [AutoRecovery] ${serverStatus === 'running' ? 'Server running' : 'Preview panel open'} but machineId missing, requesting session details...`);

      fetch(`${apiUrl}/fly/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentWorkstation.id }),
        credentials: 'include'
      })
        .then(res => res.json())
        .then(data => {
          if (data.machineId) {
            console.log(`✅ [AutoRecovery] Recovered machineId: ${data.machineId}`);
            setGlobalFlyMachineId(data.machineId, currentWorkstation.id);
          }
        })
        .catch(err => {
          console.error('❌ [AutoRecovery] Failed to recover machineId:', err.message);
        });
    }
  }, [serverStatus, globalFlyMachineId, currentWorkstation?.id, apiUrl, setGlobalFlyMachineId]);

  // ============ LIVE LOGS STREAMING ============
  // Connect to SSE stream for terminal output using XMLHttpRequest (React Native compatible)
  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isMounted = true;

    const connectToLogs = () => {
      if (!isMounted) return;
      // Only subscribe to logs when server is running OR starting and we have a project
      if ((serverStatus !== 'running' && !isStarting && serverStatus !== 'checking') || !currentWorkstation?.id) {
        return;
      }

      // Clean up any existing connection
      if (logsXhrRef.current) {
        logsXhrRef.current.abort();
        logsXhrRef.current = null;
      }

      console.log('📺 Connecting to live logs stream...');

      const logsUrl = `${apiUrl}/fly/logs/${currentWorkstation.id}`;
      const xhr = new XMLHttpRequest();
      logsXhrRef.current = xhr;

      let lastIndex = 0;
      let dataBuffer = '';

      xhr.open('GET', logsUrl);
      xhr.setRequestHeader('Accept', 'text/event-stream');

      xhr.onprogress = () => {
        // Process new data since last check
        const newData = xhr.responseText.substring(lastIndex);
        if (!newData) return;
        lastIndex = xhr.responseText.length;

        dataBuffer += newData;

        // Process complete lines
        let lineEndIndex;
        while ((lineEndIndex = dataBuffer.indexOf('\n')) !== -1) {
          const line = dataBuffer.substring(0, lineEndIndex).trim();
          dataBuffer = dataBuffer.substring(lineEndIndex + 1);

          if (line.startsWith('data: ')) {
            try {
              const dataStr = line.substring(6);
              if (dataStr === '[DONE]') continue;

              const data = JSON.parse(dataStr);

              // Skip connection/system messages
              if (data.type === 'connected' || data.type === 'error') {
                console.log('📺 Logs:', data);
                continue;
              }

              // Handle session expired event - VM was released due to idle timeout
              if (data.type === 'session_expired') {
                console.log('⏰ Session expired:', data);
                setSessionExpired(true);
                setSessionExpiredMessage(data.message || 'Sessione terminata per inattività');
                setServerStatus('stopped');
                setIsStarting(false);
                // Stop polling interval
                if (checkInterval.current) {
                  clearInterval(checkInterval.current);
                  checkInterval.current = null;
                }
                continue;
              }

              // Add log line to terminal output
              if (data.text) {
                // Also update the status message in the loading screen in real-time
                if (serverStatus !== 'running') {
                  setDisplayedMessage(data.text);
                }

                setTerminalOutput(prev => {
                  const newOutput = [...prev, data.text];
                  // Keep only last 500 lines
                  if (newOutput.length > 500) {
                    return newOutput.slice(-500);
                  }
                  return newOutput;
                });

                // Auto-scroll to bottom
                setTimeout(() => {
                  terminalScrollRef.current?.scrollToEnd({ animated: true });
                }, 50);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      };

      xhr.onerror = () => {
        console.log('📺 Logs stream error, will reconnect...');
        if (isMounted) {
          reconnectTimeout = setTimeout(connectToLogs, 3000);
        }
      };

      xhr.onload = () => {
        // If we got a 503 (VM starting), retry
        if (xhr.status === 503 && isMounted) {
          console.log('📺 VM starting (503), retrying logs in 3s...');
          reconnectTimeout = setTimeout(connectToLogs, 3000);
        }
      };

      xhr.send();
    };

    connectToLogs();

    // Cleanup on unmount or dependency change
    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (logsXhrRef.current) {
        logsXhrRef.current.abort();
        logsXhrRef.current = null;
      }
    };
  }, [serverStatus, isStarting, currentWorkstation?.id, apiUrl]);

  const checkServerStatus = async (urlOverride?: string, retryCount = 0) => {
    const urlToCheck = urlOverride || currentPreviewUrl;
    const maxRetries = 300; // Max 300 retries = 5 minutes of checking (needed for slow npm installs)

    try {
      console.log(`🔍 Checking server status at: ${urlToCheck} (attempt ${retryCount + 1})`);

      // Try to fetch the URL using GET (more reliable than HEAD across different servers)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout (increased from 10s)

      const response = await fetch(urlToCheck, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
        headers: {
          'Coder-Session-Token': coderToken || '',
          'Accept': 'text/html',
          'X-Drape-Check': 'true', // Help agent distinguish checks
          ...(flyMachineIdRef.current ? { 'Fly-Force-Instance-Id': flyMachineIdRef.current } : {}),
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const agentStatus = response.headers.get('X-Drape-Agent-Status');

      // Status Check Logic
      // Note: 500 means the app has an error but the server IS running 
      // (e.g., Next.js with corrupted favicon or build error)
      if ((response.status >= 200 && response.status < 400) || response.status === 500) {
        if (agentStatus === 'waiting') {
          // Still installing dependencies - update UI to show this phase
          console.log('📡 Agent is in waiting mode (installing dependencies)...');
          setStartingMessage('Installazione dipendenze...');
          if (serverStatusRef.current === 'checking' && retryCount < maxRetries) {
            setTimeout(() => checkServerStatus(urlToCheck, retryCount + 1), 2000);
          }
          return;
        }

        console.log(`✅ Server is running! Status: ${response.status}`);
        if (serverStatusRef.current !== 'running') {
          logOutput(`Server is running at ${urlToCheck}`, 'preview', 0);
          if (response.status === 500) {
            logOutput(`⚠️ Warning: Server has app errors (500)`, 'preview', 0);
          }
        }
        setServerStatus('running');
        // Server is ready - hide the loading overlay and let WebView show content
        setIsStarting(false);
        // Set webViewReady after short delay to trigger smooth transition
        setTimeout(() => setWebViewReady(true), 500);
      } else if (response.status === 403 || response.status === 503) {
        // 403 often means Vite Host Check blocked, 503 means booting/npm install
        // Update UI to show what's happening
        setStartingMessage(response.status === 503 ? 'Avvio server di sviluppo...' : 'Configurazione server...');

        // Try to reach the agent's health endpoint to confirm VM is alive
        try {
          const healthUrl = urlToCheck.endsWith('/') ? `${urlToCheck}health` : `${urlToCheck}/health`;
          const healthRes = await fetch(healthUrl, {
            headers: { 'Fly-Force-Instance-Id': flyMachineIdRef.current || '' },
            credentials: 'include',
            signal: controller.signal
          });
          const healthData = await healthRes.json();
          if (healthData.status === 'ok') {
            console.log('📡 Agent is alive and responsive.');
          }
        } catch (e: any) {
          console.log(`📡 Agent health check failed: ${e.message}`);
        }

        console.log(`⚠️ Server not ready (status ${response.status}). Retrying...`);
        if (serverStatusRef.current === 'checking' && retryCount < maxRetries) {
          setTimeout(() => checkServerStatus(urlToCheck, retryCount + 1), 2000);
        }
      } else {
        console.log(`⚠️ Server returned status: ${response.status}. Retrying...`);
        setStartingMessage('Attesa risposta server...');
        if (serverStatusRef.current === 'checking' && retryCount < maxRetries) {
          setTimeout(() => checkServerStatus(urlToCheck, retryCount + 1), 2000);
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log(`❌ Server check timed out after 30s (Attempt ${retryCount + 1})`);
        setStartingMessage('Connessione in corso...');
      } else {
        console.log(`❌ Server check failed: ${error.message} (Attempt ${retryCount + 1})`);
        setStartingMessage('Riprovando connessione...');
      }

      // Retry if server isn't ready yet and we're still in checking mode
      if (serverStatusRef.current === 'checking' && retryCount < maxRetries) {
        setTimeout(() => checkServerStatus(urlToCheck, retryCount + 1), 3000); // Longer wait after error
      }
    }
  };

  // Send error report to backend for debugging
  const sendErrorReport = async () => {
    if (!previewError) return;

    setIsSendingReport(true);
    try {
      const deviceInfo = {
        platform: Platform.OS,
        version: Platform.Version,
      };

      await fetch(`${apiUrl}/fly/error-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentWorkstation?.id,
          userId: useAuthStore.getState().user?.email,
          errorMessage: previewError.message,
          deviceInfo,
          logs: recentLogsRef.current,
          timestamp: previewError.timestamp.toISOString(),
        }),
      });

      setReportSent(true);
      console.log('✅ Error report sent successfully');
    } catch (e) {
      console.error('Failed to send error report:', e);
    } finally {
      setIsSendingReport(false);
    }
  };

  // Retry preview after error
  const handleRetryPreview = () => {
    setPreviewError(null);
    setReportSent(false);
    // Reset steps to initial state
    setStartupSteps([
      { id: 'analyzing', label: 'Analisi progetto', status: 'pending' },
      { id: 'cloning', label: 'Preparazione file', status: 'pending' },
      { id: 'detecting', label: 'Configurazione', status: 'pending' },
      { id: 'booting', label: 'Accensione server', status: 'pending' },
      { id: 'ready', label: 'Ci siamo quasi', status: 'pending' },
    ]);
    setSmoothProgress(0);
    // Start server again
    handleStartServer();
  };

  const handleStartServer = async () => {
    if (!currentWorkstation?.id) {
      logError('No workstation selected', 'preview');
      return;
    }

    // 🔑 CHECK: If we already have a machineId, check if server is running first
    if (globalFlyMachineId && currentPreviewUrl) {
      console.log(`🔍 [StartServer] machineId exists (${globalFlyMachineId}), checking if server is already running...`);
      setServerStatus('checking');
      setIsStarting(true);

      // Do a quick health check
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(currentPreviewUrl, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
          headers: {
            'Fly-Force-Instance-Id': globalFlyMachineId,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // If server is responding (200-499), it's running!
        if (response.status >= 200 && response.status < 500) {
          console.log(`✅ [StartServer] Server already running! Status: ${response.status}, skipping restart`);
          setServerStatus('running');
          setIsStarting(false);
          setWebViewReady(true);
          return; // DON'T restart the server!
        }

        console.log(`⚠️ [StartServer] Server returned ${response.status}, will restart`);
      } catch (error: any) {
        console.log(`⚠️ [StartServer] Health check failed: ${error.message}, will restart`);
      }
    }

    // Reset session expired state when starting a new preview
    setSessionExpired(false);
    setSessionExpiredMessage('');

    setIsStarting(true);
    setServerStatus('checking'); // Enter checking screen

    // Reset and initialize steps
    setStartupSteps([
      { id: 'analyzing', label: 'Analisi progetto', status: 'pending' },
      { id: 'cloning', label: 'Preparazione file', status: 'pending' },
      { id: 'detecting', label: 'Configurazione', status: 'pending' },
      { id: 'booting', label: 'Accensione server', status: 'pending' },
      { id: 'ready', label: 'Ci siamo quasi', status: 'pending' },
    ]);
    setCurrentStepId('analyzing');
    setStartingMessage('Analisi del progetto...');
    setTargetProgress(5); // Start at 5% for analyzing step
    setIsNextJsProject(false); // Reset - will be detected from backend response

    logSystem(`Starting AI-powered preview for ${currentWorkstation?.name || 'project'}...`, 'preview');

    try {
      const userId = useTerminalStore.getState().userId || 'anonymous';
      const userEmail = useAuthStore.getState().user?.email || 'anonymous@drape.dev';
      let githubToken: string | null = null;
      const repoUrl = currentWorkstation.repositoryUrl || currentWorkstation.githubUrl;

      if (repoUrl) {
        const tokenResult = await gitAccountService.getTokenForRepo(userId, repoUrl);
        githubToken = tokenResult?.token || null;
      }

      const username = userEmail.split('@')[0].replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      const previewEndpoint = USE_HOLY_GRAIL
        ? `${apiUrl}/fly/preview/start`
        : `${apiUrl}/preview/start`;

      return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', previewEndpoint);
        xhr.setRequestHeader('Content-Type', 'application/json');

        let lastIndex = 0;
        let pollInterval: any = null;
        let dataBuffer = '';
        let readyReceived = false; // Track if 'ready' event was received

        const processResponse = () => {
          const newData = xhr.responseText.substring(lastIndex);
          if (!newData) return;
          lastIndex = xhr.responseText.length;

          dataBuffer += newData;

          // Process all complete lines in the buffer
          let lineEndIndex;
          while ((lineEndIndex = dataBuffer.indexOf('\n')) !== -1) {
            const line = dataBuffer.substring(0, lineEndIndex).trim();
            dataBuffer = dataBuffer.substring(lineEndIndex + 1);

            if (line.startsWith('data: ')) {
              try {
                const dataStr = line.substring(6);
                if (dataStr === '[DONE]') {
                  console.log('✅ SSE Stream complete ([DONE])');
                  continue;
                }

                const parsed = JSON.parse(dataStr);
                console.log('📬 Preview SSE:', parsed.type, parsed.step || '', parsed.machineId ? `(machineId: ${parsed.machineId})` : '');

                if (parsed.type === 'warning') {
                  // Handle warnings (e.g., Next.js version issues)
                  try {
                    const warningData = JSON.parse(parsed.step);
                    console.warn('⚠️ Preview Warning:', warningData);
                    // Store warning for display
                    if (warningData.type === 'nextjs-version') {
                      setIsNextJsProject(true); // Definitely Next.js
                      setTargetProgress(20); // Update progress for warning step
                      logOutput(`⚠️ ${warningData.message}`, 'preview', 0);
                      logOutput(`   Recommended: ${warningData.recommendation}`, 'preview', 0);
                    }
                  } catch (e) {
                    console.warn('Failed to parse warning:', e);
                  }
                } else if (parsed.type === 'step') {
                  // Capture step progress for error reporting
                  recentLogsRef.current.push(`[STEP] ${parsed.step}: ${parsed.message}`);
                  if (recentLogsRef.current.length > 50) recentLogsRef.current.shift();

                  setCurrentStepId(parsed.step);
                  setStartingMessage(parsed.message);

                  // REAL progress based on backend steps
                  // Steps: analyzing(5%) -> detecting(15%) -> booting(25%) -> install(40%) -> starting(70%) -> ready(100%)
                  const stepProgressMap: Record<string, number> = {
                    'analyzing': 5,
                    'cloning': 10,
                    'detecting': 15,
                    'warning': 20, // Next.js version warning
                    'booting': 25,
                    'install': 40,
                    'installing': 40,
                    'starting': 70, // This is where most time is spent for Next.js (compilation)
                    'ready': 100
                  };
                  const newTarget = stepProgressMap[parsed.step] || targetProgress;
                  setTargetProgress(newTarget);

                  // Detect Next.js project for time estimates
                  if (parsed.projectType?.toLowerCase().includes('next') ||
                      parsed.message?.toLowerCase().includes('next.js') ||
                      parsed.message?.toLowerCase().includes('turbopack')) {
                    setIsNextJsProject(true);
                  }

                  setStartupSteps(prev => prev.map(step => {
                    if (step.id === parsed.step) return { ...step, status: 'active' };
                    // Mark previous steps as complete
                    const stepOrder = ['analyzing', 'cloning', 'detecting', 'booting', 'installing', 'starting', 'ready'];
                    const currentIdx = stepOrder.indexOf(parsed.step);
                    const stepIdx = stepOrder.indexOf(step.id);
                    if (stepIdx < currentIdx) return { ...step, status: 'complete' };
                    return step;
                  }));

                  if (parsed.step === 'ready') {
                    readyReceived = true; // Mark that we received the ready event
                    console.log('🎉 Server is ready, navigating...');
                    const result = parsed;
                    console.log('📋 AI Preview result:', JSON.stringify(result, null, 2));

                    // Show UI immediately - don't wait for cookie sync
                    setServerStatus('running');
                    setIsStarting(false);

                    // Handle final success state
                    const completeSetup = () => {
                      // Just resolve - UI is already shown
                      resolve();
                    };

                    if (result.previewUrl) {
                      setCurrentPreviewUrl(result.previewUrl);
                      if (result.coderToken) setCoderToken(result.coderToken);
                      // Set hasWebUI flag (default true if not specified)
                      const projectHasWebUI = result.hasWebUI !== false;
                      setHasWebUI(projectHasWebUI);
                      // For CLI projects without web UI, mark as ready immediately
                      if (!projectHasWebUI) {
                        setWebViewReady(true);
                      }

                      if (result.machineId) {
                        setGlobalFlyMachineId(result.machineId, currentWorkstation?.id);
                        flyMachineIdRef.current = result.machineId;

                        // Set session and WAIT for it before showing preview
                        fetch(`${apiUrl}/fly/session`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ machineId: result.machineId }),
                          credentials: 'include'
                        })
                          .then(() => {
                            console.log('🍪 Session cookie established');
                            // Wait 2.5s for native cookie sync (critical for first load)
                            setTimeout(completeSetup, 2500);
                          })
                          .catch(e => {
                            console.warn('⚠️ Session fail:', e);
                            completeSetup(); // Try anyway
                          });
                      } else {
                        completeSetup();
                      }
                    } else {
                      completeSetup();
                    }
                  }
                } else if (parsed.type === 'error') {
                  console.error('❌ SSE Error:', parsed.message);
                  // Capture logs for error reporting
                  recentLogsRef.current.push(`[ERROR] ${parsed.message}`);
                  setStartupSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s));
                  logError(parsed.message, 'preview');
                  setServerStatus('stopped');
                  setIsStarting(false);
                  // Set error state for UI
                  setPreviewError({ message: parsed.message, timestamp: new Date() });
                  reject(new Error(parsed.message));
                }
              } catch (e: any) {
                // Log parse errors - they might explain why 'ready' is not received
                console.warn('⚠️ SSE JSON parse error:', e?.message, 'Data:', dataStr?.substring(0, 200));
              }
            } else if (line.startsWith(':')) {
              // Heartbeat ping
              console.log('💓 SSE Heartbeat');
            }
          }
        };

        xhr.onprogress = () => {
          processResponse();
        };

        pollInterval = setInterval(processResponse, 100);

        xhr.onload = async () => {
          console.log(`📡 XHR onload status: ${xhr.status}, readyReceived: ${readyReceived}`);
          if (pollInterval) clearInterval(pollInterval);
          processResponse();

          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error(`Server error: ${xhr.status}`));
            return;
          }

          // 🔑 RECOVERY: If XHR completed but we never got 'ready' event, try to recover
          if (!readyReceived && xhr.status === 200) {
            console.log('⚠️ XHR completed but ready event not received, attempting recovery...');
            console.log('📋 Final response length:', xhr.responseText?.length);
            console.log('📋 Last 500 chars:', xhr.responseText?.slice(-500));

            // Try to fetch session to see if VM is actually ready
            try {
              const sessionRes = await fetch(`${apiUrl}/fly/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: currentWorkstation?.id }),
                credentials: 'include'
              });
              const sessionData = await sessionRes.json();

              if (sessionData.machineId) {
                console.log('✅ Recovery: VM is running, manually completing setup');
                setGlobalFlyMachineId(sessionData.machineId, currentWorkstation?.id);
                flyMachineIdRef.current = sessionData.machineId;
                setCurrentPreviewUrl(`${apiUrl}`);
                setServerStatus('running');
                setIsStarting(false);
                resolve();
              } else {
                console.error('❌ Recovery failed: No machineId in session');
                reject(new Error('Preview completed but ready event was lost'));
              }
            } catch (recoveryErr: any) {
              console.error('❌ Recovery fetch failed:', recoveryErr);
              reject(new Error('Preview completed but ready event was lost'));
            }
          }
        };

        xhr.onerror = () => {
          if (pollInterval) clearInterval(pollInterval);
          reject(new Error('Network error'));
        };

        xhr.send(JSON.stringify({
          projectId: USE_HOLY_GRAIL ? currentWorkstation.id : undefined,
          workstationId: USE_HOLY_GRAIL ? undefined : currentWorkstation.id,
          repositoryUrl: repoUrl,
          githubToken: githubToken,
          userEmail: userEmail,
          username: username
        }));
      });

    } catch (error: any) {
      console.error('❌ Preview failed:', error);
      logError(error.message || 'Errore durante l\'avvio', 'preview');
      setServerStatus('stopped');
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

    // ⏱️ NEW LOGIC: Start 5min timer for VM release (instead of immediate stop)
    if ((serverStatus === 'running' || serverStatus === 'checking') && currentWorkstation?.id) {
      console.log(`⏱️ [PreviewPanel] Starting 5min release timer for project ${currentWorkstation.id}`);

      // Clear any existing timer
      if (releaseTimerRef.current) {
        clearTimeout(releaseTimerRef.current);
      }

      // Start 5-minute countdown
      releaseTimerRef.current = setTimeout(async () => {
        console.log(`⏰ [PreviewPanel] 5min expired, releasing VM for project ${currentWorkstation.id}`);

        try {
          const response = await fetch(`${apiUrl}/fly/release`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: currentWorkstation.id }),
          });

          if (response.ok) {
            console.log(`✅ [PreviewPanel] VM released for project ${currentWorkstation.id}`);
            setPreviewServerStatus('stopped');
            setPreviewServerUrl(null);
            serverLogService.disconnect();
          } else {
            console.warn(`⚠️ [PreviewPanel] Failed to release VM: ${response.status}`);
          }
        } catch (error: any) {
          console.error(`❌ [PreviewPanel] Release error:`, error.message);
        }
      }, 5 * 60 * 1000); // 5 minutes

      console.log(`✅ [PreviewPanel] Timer started - VM will be released in 5 minutes if not reopened`);
    }

    // ❌ OLD LOGIC: Commented out - was stopping server immediately
    /*

    // NOTE: Don't disconnect from server logs here - keep connection alive
    // The global serverLogService will continue streaming logs to the terminal
    // Only disconnect when server is actually stopped or project changes

    // Stop the server if running
    if (serverStatus === 'running' || serverStatus === 'checking') {
      const portMatch = currentPreviewUrl.match(/:(\d+)/);
      if (portMatch && currentWorkstation?.id) {
        const port = parseInt(portMatch[1]);
        console.log(`⏱️ [DEPRECATED] Old stop logic - now using 5min timer`);

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
    */

    // Close preview UI
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
    setIsAiLoading(true);

    const userMessage = message.trim();

    // Build prompt with element context if selected
    let prompt = userMessage;
    if (selectedElement) {
      prompt = `[Elemento selezionato: <${selectedElement.tag}> class="${selectedElement.className}" id="${selectedElement.id}" text="${selectedElement.text?.slice(0, 100)}"]\n\n${userMessage}`;
    }

    // Add user message to history locally
    const newUserMsg = { type: 'user' as const, content: userMessage };
    setAiMessages(prev => [...prev, newUserMsg]);

    // Create or update chat in history (like ChatPage)
    const isFirstMessage = aiMessages.filter(m => m.type === 'user').length === 0;
    let chatId = previewChatId;

    if (isFirstMessage || !chatId) {
      // Create new chat for this preview session
      chatId = `preview-${Date.now()}`;
      setPreviewChatId(chatId);

      // Generate title from first message
      let title = `🎨 ${userMessage.slice(0, 35)}`;
      if (userMessage.length > 35) title += '...';

      const newChat = {
        id: chatId,
        title: title,
        description: `Preview: ${currentWorkstation.name || 'Progetto'}`,
        createdAt: new Date(),
        lastUsed: new Date(),
        messages: [],
        aiModel: selectedModel,
        repositoryId: currentWorkstation.id,
        repositoryName: currentWorkstation.name,
      };

      console.log('✨ [PreviewPanel] Creating new chat:', { chatId, title });
      useTerminalStore.getState().addChat(newChat);
    } else {
      // Update lastUsed
      useTerminalStore.getState().updateChatLastUsed(chatId);
    }

    // Build conversation history for agent (like ChatPage)
    const conversationHistory = aiMessages
      .filter(m => m.type === 'user' || m.type === 'text')
      .map(m => ({
        role: m.type === 'user' ? 'user' : 'assistant',
        content: m.content || ''
      }));

    // Clear input immediately
    setMessage('');

    // Reset agent and start new session
    resetAgent();

    console.log('🚀 [PreviewPanel] Starting agent with:', { prompt: prompt.slice(0, 50), projectId: currentWorkstation.id, model: selectedModel });

    // Start the agent stream (same as ChatPage)
    startAgent(prompt, currentWorkstation.id, selectedModel, conversationHistory);
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
            {/* Header - Only show when server is running and WebView is ready */}
            {serverStatus === 'running' && webViewReady && (
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
              ) : sessionExpired ? (
                // Session expired - show message with restart option
                <Reanimated.View style={styles.startScreen} entering={FadeIn.duration(300)}>
                  <LinearGradient
                    colors={['#050505', '#0a0a0b', '#0f0f12']}
                    style={StyleSheet.absoluteFill}
                  >
                    <View style={styles.ambientBlob1} />
                    <View style={styles.ambientBlob2} />
                  </LinearGradient>

                  <View style={styles.iphoneMockup}>
                    <View style={styles.statusBarArea}>
                      <Text style={styles.fakeTime}>9:41</Text>
                      <View style={styles.dynamicIsland} />
                      <View style={styles.fakeStatusIcons}>
                        <Ionicons name="wifi" size={10} color="#fff" />
                        <Ionicons name="battery-full" size={10} color="#fff" />
                      </View>
                    </View>

                    <View style={styles.iphoneScreenCentered}>
                      {/* Session Expired Icon */}
                      <View style={[styles.cosmicOrbContainer, { opacity: 0.6 }]}>
                        <View style={[styles.cosmicGlowRing1, { backgroundColor: 'rgba(255, 171, 0, 0.15)' }]} />
                        <View style={[styles.cosmicGlowRing2, { backgroundColor: 'rgba(255, 171, 0, 0.08)' }]} />
                        <LinearGradient
                          colors={['#FFAB00', '#FF6D00']}
                          style={styles.cosmicOrb}
                        >
                          <Ionicons name="time-outline" size={32} color="#FFFFFF" />
                        </LinearGradient>
                      </View>

                      <View style={styles.cosmicTextContainer}>
                        <Text style={[styles.cosmicTitle, { fontSize: 16 }]}>
                          SESSIONE SCADUTA
                        </Text>
                        <View style={[styles.cosmicTitleUnderline, { backgroundColor: '#FFAB00' }]} />
                        <Text style={styles.cosmicSubtitle}>
                          {sessionExpiredMessage || 'Sessione terminata per inattività'}
                        </Text>
                      </View>

                      {/* Restart Button */}
                      <TouchableOpacity
                        style={[styles.cosmicOrbContainer, { marginTop: 24 }]}
                        onPress={handleStartServer}
                        activeOpacity={0.9}
                      >
                        <View style={styles.cosmicGlowRing1} />
                        <View style={styles.cosmicGlowRing2} />
                        <LinearGradient
                          colors={[AppColors.primary, '#6C5CE7']}
                          style={[styles.cosmicOrb, { width: 56, height: 56, borderRadius: 28 }]}
                        >
                          <Ionicons name="refresh" size={24} color="#FFFFFF" />
                        </LinearGradient>
                      </TouchableOpacity>

                      <Text style={[styles.cosmicSubtitle, { marginTop: 8 }]}>
                        Tocca per riavviare
                      </Text>
                    </View>

                    <View style={styles.iphoneSideButton} />
                    <View style={styles.iphoneVolumeUp} />
                    <View style={styles.iphoneVolumeDown} />
                  </View>
                </Reanimated.View>
              ) : serverStatus === 'stopped' ? (
                // Server not running - Device mockup style with ChatPage background
                <Reanimated.View style={styles.startScreen} exiting={FadeOut.duration(300)}>
                  {/* Premium gradient background with ambient effects */}
                  <LinearGradient
                    colors={['#050505', '#0a0a0b', '#0f0f12']}
                    style={StyleSheet.absoluteFill}
                  >
                    <View style={styles.ambientBlob1} />
                    <View style={styles.ambientBlob2} />
                  </LinearGradient>

                  {/* iPhone 15 Pro style mockup */}
                  <View style={styles.iphoneMockup}>
                    {/* Status bar area */}
                    <View style={styles.statusBarArea}>
                      <Text style={styles.fakeTime}>9:41</Text>
                      <View style={styles.dynamicIsland} />
                      <View style={styles.fakeStatusIcons}>
                        <Ionicons name="wifi" size={10} color="#fff" />
                        <Ionicons name="battery-full" size={10} color="#fff" />
                      </View>
                    </View>

                    {/* Screen content - Cosmic Energy Design */}
                    <View style={styles.iphoneScreenCentered}>

                      {/* Integrated Cosmic Orb Button */}
                      <TouchableOpacity
                        style={styles.cosmicOrbContainer}
                        onPress={handleStartServer}
                        activeOpacity={0.9}
                      >
                        {/* Layered Glow Rings */}
                        <View style={styles.cosmicGlowRing1} />
                        <View style={styles.cosmicGlowRing2} />

                        <LinearGradient
                          colors={[AppColors.primary, '#6C5CE7']}
                          style={styles.cosmicOrb}
                        >
                          <Ionicons name="play" size={32} color="#FFFFFF" style={{ marginLeft: 4 }} />
                        </LinearGradient>
                      </TouchableOpacity>

                      {/* High-Impact Typography */}
                      <View style={styles.cosmicTextContainer}>
                        <Text style={styles.cosmicTitle}>
                          ANTEPRIMA
                        </Text>
                        <View style={styles.cosmicTitleUnderline} />
                        <Text style={styles.cosmicSubtitle}>
                          Tocca l'orb per iniziare
                        </Text>
                      </View>
                    </View>

                    {/* Side buttons */}
                    <View style={styles.iphoneSideButton} />
                    <View style={styles.iphoneVolumeUp} />
                    <View style={styles.iphoneVolumeDown} />
                  </View>

                  <View style={styles.loadingFooter}>
                    {/* Premium CTA Banner - High End Redesign */}
                    <TouchableOpacity
                      style={styles.premiumBanner}
                      activeOpacity={0.9}
                      onPress={() => {
                        console.log('💎 Upgrade to Professional');
                      }}
                    >
                      <LinearGradient
                        colors={['rgba(139, 124, 246, 0.15)', 'rgba(108, 92, 231, 0.05)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={styles.premiumBorderGradient} />

                      <View style={styles.premiumBannerContent}>
                        <LinearGradient
                          colors={[AppColors.primary, '#9F7AEA']}
                          style={styles.premiumIconContainer}
                        >
                          <Ionicons name="flash" size={14} color="#fff" />
                        </LinearGradient>

                        <View style={{ flex: 1, gap: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.premiumBannerTitle}>Professional</Text>
                            <View style={styles.proBadge}>
                              <Text style={styles.proBadgeText}>PRO</Text>
                            </View>
                          </View>
                          <Text style={styles.premiumBannerSubtitle}>Anteprime 4x più veloci ed istantanee</Text>
                        </View>

                        <View style={styles.premiumArrow}>
                          <Ionicons name="chevron-forward" size={14} color="rgba(255, 255, 255, 0.3)" />
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Technical credit text removed for a cleaner look */}
                  </View>
                </Reanimated.View>
              ) : (
                <Reanimated.View style={{ flex: 1, backgroundColor: '#0a0a0c' }} entering={FadeIn.duration(400).delay(200)}>
                  {/* LIVE APP LAYER (Below) */}
                  <View style={StyleSheet.absoluteFill}>

                    {hasWebUI ? (
                      currentPreviewUrl && (currentPreviewUrl.startsWith('http://') || currentPreviewUrl.startsWith('https://')) ? (
                      <WebView
                        key={coderToken || 'init'}
                        ref={webViewRef}
                        source={{
                          uri: currentPreviewUrl,
                          headers: {
                            'Coder-Session-Token': coderToken || '',
                            'session_token': coderToken || '',
                            ...(globalFlyMachineId ? { 'Fly-Force-Instance-Id': globalFlyMachineId } : {}),
                            'Cookie': `drape_vm_id=${globalFlyMachineId || ''}; session_token=${coderToken || ''}; coder_session_token=${coderToken || ''}`,
                            ...(flyMachineIdRef.current ? {
                              'X-Drape-VM-Id': flyMachineIdRef.current,
                              'Fly-Force-Instance-Id': flyMachineIdRef.current
                            } : {})
                          }
                        }}
                        sharedCookiesEnabled={true}
                        thirdPartyCookiesEnabled={true}
                        // 🔑 FIX: Always show WebView (no opacity:0 hiding)
                        // The LOADING SPIRIT MASK overlay handles the loading state
                        // This prevents black screen when webViewReady is false
                        style={styles.webView}

                        injectedJavaScriptBeforeContentLoaded={`
                          (function() {
                            var token = "${coderToken || ''}";
                            var vmId = "${globalFlyMachineId || ''}";
                            
                            // Set cookies
                            if (token) {
                              document.cookie = "coder_session_token=" + token + "; path=/; SameSite=Lax";
                              document.cookie = "session_token=" + token + "; path=/; SameSite=Lax";
                            }
                            if (vmId) {
                              document.cookie = "drape_vm_id=" + vmId + "; path=/; SameSite=Lax";
                            }
                            
                            // Dark background
                            if (document.head) {
                              var style = document.createElement('style');
                              style.innerHTML = 'html, body { background-color: #0a0a0a !important; }';
                              document.head.appendChild(style);
                            }
                            
                            // Check for React/Next.js mount
                            var checkCount = 0;
                            var checkInterval = setInterval(function() {
                              checkCount++;
                              if (document.body) {
                                // Support multiple root element IDs
                                var root = document.getElementById('root') ||
                                           document.getElementById('__next') ||
                                           document.querySelector('[data-reactroot]') ||
                                           document.querySelector('[id^="app"]');
                                var rootChildren = root ? root.children.length : 0;
                                var text = document.body.innerText || '';

                                // Check for blockers
                                if (text.indexOf("Blocked request") !== -1 || text.indexOf("404 (Gateway)") !== -1) {
                                  clearInterval(checkInterval);
                                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'TRIGGER_REFRESH' }));
                                  return;
                                }

                                // React/Next.js mounted - or any content in body
                                if ((root && rootChildren > 0) || document.body.children.length > 2) {
                                  clearInterval(checkInterval);
                                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WEBVIEW_READY' }));
                                }

                                // Shorter timeout - 10 seconds (20 checks * 500ms)
                                if (checkCount >= 20) {
                                  clearInterval(checkInterval);
                                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WEBVIEW_READY' }));
                                }
                              }
                            }, 500);
                          })();
                          true;
                        `}

                        onLoadStart={(syntheticEvent) => {
                          const { nativeEvent } = syntheticEvent;
                          console.log('🔵 WebView load start:', nativeEvent.url);
                          if (serverStatus !== 'running') {
                            setWebViewReady(false);
                          }
                          setIsLoading(true);
                        }}
                        onLoadEnd={(syntheticEvent) => {
                          const { nativeEvent } = syntheticEvent;
                          console.log('✅ WebView load end:', nativeEvent.url);
                          webViewRef.current?.injectJavaScript(`
                           (function() {
                             window.addEventListener('error', function(e) {
                               window.ReactNativeWebView?.postMessage(JSON.stringify({
                                 type: 'JS_ERROR',
                                 message: e.message
                               }));
                             });

                             // Support multiple root element IDs
                             const root = document.getElementById('root') ||
                                          document.getElementById('__next') ||
                                          document.querySelector('[data-reactroot]') ||
                                          document.querySelector('[id^="app"]');
                             const rootChildren = root ? root.children.length : 0;

                             let attempts = 0;
                             const maxAttempts = 20; // Reduced from 40 to 20 (10 seconds max)

                             function checkContent() {
                               attempts++;
                               try {
                                 const root = document.getElementById('root') ||
                                              document.getElementById('__next') ||
                                              document.querySelector('[data-reactroot]') ||
                                              document.querySelector('[id^="app"]');
                                 // Check root children OR any substantial body content
                                 const rootChildren = root ? root.children.length : 0;
                                 const hasContent = (rootChildren > 0) || (document.body.children.length > 2);

                                 if (hasContent) {
                                   window.ReactNativeWebView?.postMessage(JSON.stringify({
                                     type: 'PAGE_INFO',
                                     hasContent: hasContent,
                                     rootChildren: rootChildren,
                                     forceReady: false
                                   }));
                                   return true;
                                 }

                                 // Force ready after max attempts
                                 if (attempts >= maxAttempts) {
                                   window.ReactNativeWebView?.postMessage(JSON.stringify({
                                     type: 'PAGE_INFO',
                                     hasContent: true,
                                     rootChildren: 0,
                                     forceReady: true
                                   }));
                                   return true;
                                 }
                               } catch(e) {}
                               return false;
                             }

                             if (!checkContent()) {
                               const interval = setInterval(function() {
                                 if (checkContent()) clearInterval(interval);
                               }, 500);
                             }


                           })();
                           true;
                         `);
                          setIsLoading(false);
                        }}

                        onLoadProgress={({ nativeEvent }) => {
                          if (nativeEvent.progress === 1) setIsLoading(false);
                        }}
                        onNavigationStateChange={(navState) => {
                          setCanGoBack(navState.canGoBack);
                          setCanGoForward(navState.canGoForward);
                          setIsLoading(navState.loading);
                        }}
                        onMessage={(event) => {
                          try {
                            const data = JSON.parse(event.nativeEvent.data);

                            if (data.type === 'WEBVIEW_READY') {
                              setWebViewReady(true);
                            }
                            if (data.type === 'TRIGGER_REFRESH') {
                              handleRefresh();
                            }
                            if (data.type === 'PAGE_INFO') {
                              if (data.rootChildren > 0 || data.forceReady) {
                                if (!webViewReady) setTimeout(() => setWebViewReady(true), 1000);
                              }
                            }
                            if (data.type === 'ELEMENT_SELECTED') {
                              let elementSelector = `<${data.element.tag}>`;
                              if (data.element.id) elementSelector = `<${data.element.tag}#${data.element.id}>`;
                              else if (data.element.className) {
                                const classNameStr = typeof data.element.className === 'string' ? data.element.className : (data.element.className?.baseVal || '');
                                const classes = classNameStr.split(' ').filter(c => c && !c.startsWith('__inspector')).slice(0, 2);
                                if (classes.length > 0) elementSelector = `<${data.element.tag}.${classes.join('.')}>`;
                              }
                              setSelectedElement({ selector: elementSelector, text: (data.element.text?.trim()?.substring(0, 40) || '') + (data.element.text?.length > 40 ? '...' : ''), tag: data.element.tag, className: typeof data.element.className === 'string' ? data.element.className : (data.element.className?.baseVal || ''), id: data.element.id, innerHTML: data.element.innerHTML });
                              inputRef.current?.focus();
                              setIsInspectMode(false);
                            }
                          } catch (error) { }
                        }}
                        javaScriptEnabled={true}
                        domStorageEnabled={true}
                        startInLoadingState={false}
                        scalesPageToFit={true}
                        bounces={false}
                        mixedContentMode="always"
                        allowsInlineMediaPlayback={true}
                        mediaPlaybackRequiresUserAction={false}
                        originWhitelist={['*']}
                        renderToHardwareTextureAndroid={true}
                        shouldRasterizeIOS={true}
                        cacheEnabled={true}
                      />
                    ) : (
                      <View style={{ flex: 1, backgroundColor: '#0a0a0c' }} />
                    )
                    ) : (
                      /* Terminal Output View for CLI projects */
                      <ScrollView
                        ref={terminalScrollRef}
                        style={styles.terminalOutputContainer}
                        contentContainerStyle={styles.terminalOutputContent}
                      >
                        <View style={styles.terminalHeader}>
                          <View style={styles.terminalDot} />
                          <View style={[styles.terminalDot, { backgroundColor: '#f5c542' }]} />
                          <View style={[styles.terminalDot, { backgroundColor: '#5ac05a' }]} />
                          <Text style={styles.terminalTitle}>Terminal Output</Text>
                        </View>
                        {terminalOutput.length === 0 ? (
                          <View style={styles.terminalEmpty}>
                            <Ionicons name="terminal" size={48} color="rgba(255,255,255,0.2)" />
                            <Text style={styles.terminalEmptyText}>
                              Questo progetto non ha una web UI.{'\n'}
                              L'output del terminale apparirà qui.
                            </Text>
                          </View>
                        ) : (
                          terminalOutput.map((line, index) => {
                            // Detect line type from prefix (system messages start with emoji)
                            const isSystem = line.startsWith('🚀') || line.startsWith('🔄') || line.startsWith('⏹️') || line.startsWith('❌');
                            const isError = line.toLowerCase().includes('error') || line.toLowerCase().includes('failed') || line.toLowerCase().includes('warn');
                            const lineColor = isSystem ? '#6366f1' : isError ? '#f87171' : '#e0e0e0';
                            return (
                              <Text key={index} style={[styles.terminalLine, { color: lineColor }]}>
                                {line}
                              </Text>
                            );
                          })
                        )}
                      </ScrollView>
                    )}
                  </View>

                  {/* LOADING SPIRIT MASK (Above) */}
                  <Animated.View
                    style={[
                      StyleSheet.absoluteFill,
                      { opacity: maskOpacityAnim, backgroundColor: '#0a0a0c' },
                      webViewReady && { pointerEvents: 'none' }
                    ]}
                  >
                    <View style={styles.startScreen}>
                      <LinearGradient
                        colors={['#050505', '#0a0a0b', '#0f0f12']}
                        style={StyleSheet.absoluteFill}
                      >
                        {/* Animated Ambient Blobs */}
                        <View style={styles.ambientBlob1} />
                        <View style={styles.ambientBlob2} />
                      </LinearGradient>

                      {/* Close button top right */}
                      <TouchableOpacity
                        onPress={handleClose}
                        style={[styles.startCloseButton, { top: insets.top + 8, right: 16 }]}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="close" size={22} color="rgba(255, 255, 255, 0.4)" />
                      </TouchableOpacity>

                      {/* iPhone 15 Pro style mockup */}
                      <View style={styles.iphoneMockup}>
                        {/* Status bar area */}
                        <View style={styles.statusBarArea}>
                          <Text style={styles.fakeTime}>9:41</Text>
                          <View style={styles.dynamicIsland} />
                          <View style={styles.fakeStatusIcons}>
                            <Ionicons name="wifi" size={10} color="#fff" />
                            <Ionicons name="battery-full" size={10} color="#fff" />
                          </View>
                        </View>

                        {/* Screen content - The Pulse Design OR Error UI */}
                        <View style={styles.iphoneScreenCentered}>
                          {previewError ? (
                            /* ERROR UI */
                            <View style={styles.errorContainer}>
                              <View style={styles.errorIconContainer}>
                                <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
                              </View>
                              <Text style={styles.errorTitle}>Si è verificato un errore</Text>
                              <Text style={styles.errorMessage} numberOfLines={3}>
                                {previewError.message}
                              </Text>

                              <View style={styles.errorButtonsContainer}>
                                <TouchableOpacity
                                  style={styles.retryButton}
                                  onPress={handleRetryPreview}
                                  activeOpacity={0.7}
                                >
                                  <Ionicons name="refresh" size={18} color="#fff" />
                                  <Text style={styles.retryButtonText}>Riprova</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={[styles.sendLogsButton, reportSent && styles.sendLogsButtonSent]}
                                  onPress={sendErrorReport}
                                  disabled={isSendingReport || reportSent}
                                  activeOpacity={0.7}
                                >
                                  {isSendingReport ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                  ) : reportSent ? (
                                    <>
                                      <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                                      <Text style={[styles.sendLogsButtonText, { color: '#4CAF50' }]}>Inviato!</Text>
                                    </>
                                  ) : (
                                    <>
                                      <Ionicons name="send" size={18} color="rgba(255,255,255,0.7)" />
                                      <Text style={styles.sendLogsButtonText}>Invia log</Text>
                                    </>
                                  )}
                                </TouchableOpacity>
                              </View>

                              {reportSent && (
                                <Text style={styles.reportSentMessage}>
                                  Grazie! Il nostro team analizzerà il problema.
                                </Text>
                              )}
                            </View>
                          ) : (
                            /* LOADING UI */
                            <>
                              {/* 1. The Breathing Spirit (Orb) */}
                              <View style={styles.spiritContainer}>
                                <Animated.View style={[
                                  styles.spiritOrb,
                                  {
                                    transform: [{ scale: pulseAnim }],
                                    opacity: pulseAnim.interpolate({
                                      inputRange: [0.6, 1],
                                      outputRange: [0.3, 0.8]
                                    })
                                  }
                                ]} />
                                <Animated.View style={[
                                  styles.spiritCore,
                                  {
                                    transform: [{
                                      scale: pulseAnim.interpolate({
                                        inputRange: [0.6, 1],
                                        outputRange: [1, 1.2]
                                      })
                                    }]
                                  }
                                ]} />
                                <View style={styles.spiritGlow} />
                              </View>

                              {/* 2. Minimalist Status Info */}
                              <View style={styles.pulseStatusContainer}>
                                <Text style={styles.pulseStatusLabel}>
                                  {startupSteps.find(s => s.status === 'active')?.label || 'Preparazione'}
                                </Text>
                                <Text style={styles.pulseStatusMessage} numberOfLines={2}>
                                  {displayedMessage || 'Inizializzazione ambiente...'}
                                </Text>
                                <Text style={{
                                  color: isNextJsProject ? 'rgba(255,200,100,0.7)' : 'rgba(255,255,255,0.4)',
                                  fontSize: 12,
                                  fontFamily: 'SF-Pro-Text-Regular',
                                  marginTop: 8,
                                  textAlign: 'center'
                                }}>
                                  {smoothProgress > 88
                                    ? "Ultimi istanti..."
                                    : isNextJsProject
                                      ? (currentStepId === 'starting'
                                        ? "Compilazione Next.js in corso... (2-5 min)"
                                        : "Next.js: primo avvio richiede 3-5 minuti")
                                      : `Circa ${Math.ceil(60 * (1 - smoothProgress / 100))} secondi`}
                                </Text>
                              </View>

                              {/* 3. Integrated Mini Progress at the bottom of screen */}
                              <View style={styles.miniProgressContainer}>
                                <View style={styles.miniProgressBarBase}>
                                  <View style={[
                                    styles.miniProgressBarActive,
                                    {
                                      width: `${smoothProgress}%`,
                                      backgroundColor: AppColors.primary
                                    }
                                  ]} />
                                  <View style={styles.miniProgressBarGlow} />
                                </View>
                                <Text style={styles.miniProgressText}>
                                  {Math.round(smoothProgress)}%
                                </Text>
                              </View>
                            </>
                          )}
                        </View>

                        {/* Side buttons */}
                        <View style={styles.iphoneSideButton} />
                        <View style={styles.iphoneVolumeUp} />
                        <View style={styles.iphoneVolumeDown} />
                      </View>

                    </View>
                  </Animated.View>
                </Reanimated.View>
              )}
            </View>
          </KeyboardAvoidingView>

          {/* AI Response Panel - Shows when there's a response */}
          {(aiMessages.length > 0 || isAiLoading) && (
            <View style={[
              styles.aiResponsePanel,
              { bottom: keyboardHeight > 0 ? keyboardHeight + (selectedElement ? 120 : 70) : insets.bottom + (selectedElement ? 120 : 70) },
              isChatMinimized && { height: 44, overflow: 'hidden', paddingBottom: 0 }
            ]}>
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

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {/* Minimize Token */}
                  <TouchableOpacity
                    onPress={() => setIsChatMinimized(!isChatMinimized)}
                    style={[styles.aiResponseClose, { backgroundColor: 'rgba(255,255,255,0.05)' }]}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={isChatMinimized ? "chevron-up" : "chevron-down"}
                      size={16}
                      color="rgba(255, 255, 255, 0.6)"
                    />
                  </TouchableOpacity>

                  {/* Close Token */}
                  <TouchableOpacity
                    onPress={() => {
                      setAiResponse('');
                      setAiMessages([]);
                      setIsChatMinimized(false);
                    }}
                    style={styles.aiResponseClose}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close" size={16} color="rgba(255, 255, 255, 0.4)" />
                  </TouchableOpacity>
                </View>
              </View>

              {!isChatMinimized && (
                <ScrollView
                  ref={aiScrollViewRef}
                  style={styles.aiResponseScroll}
                  showsVerticalScrollIndicator={false}
                  onContentSizeChange={() => {
                    // Auto-scroll to bottom when content changes
                    aiScrollViewRef.current?.scrollToEnd({ animated: true });
                  }}
                >
                  {/* Render all messages */}
                  {aiMessages.map((msg, index) => {
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
                  })}
                  {/* Show "Thinking..." only when loading AND no AI responses yet */}
                  {isAiLoading && !aiMessages.some(m => m.type !== 'user') && (
                    <View style={styles.aiMessageRow}>
                      <View style={styles.aiThreadContainer}>
                        <Animated.View style={[styles.aiThreadDot, { backgroundColor: '#6E6E80' }]} />
                      </View>
                      <View style={styles.aiMessageContent}>
                        <Text style={styles.aiThinkingText}>Thinking...</Text>
                      </View>
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          )}


          {/* Animated FAB / Input Box - Only show when server is running and WebView is ready */}
          {serverStatus === 'running' && webViewReady && (
            <Reanimated.View style={[styles.fabInputWrapper, { bottom: keyboardHeight > 0 ? keyboardHeight + 6 : insets.bottom + 8, left: 12 }]}>
              {/* Selected Element Chip - only when expanded */}


              {/* Animated FAB that expands into input */}
              <Animated.View
                style={[
                  styles.fabAnimated,
                  { width: fabWidthAnim }
                ]}
              >
                <BlurView intensity={60} tint="dark" style={[styles.fabBlur, isInputExpanded && { alignItems: 'stretch', paddingHorizontal: 0 }]}>
                  {isInputExpanded ? (
                    <View style={{ flex: 1, flexDirection: 'column' }}>

                      {/* Context Bar - Selected Element (Inside Input) */}
                      {selectedElement && (
                        <>
                          <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 16,
                            paddingTop: 12,
                            paddingBottom: 8,
                          }}>
                            <Ionicons name="code-slash" size={12} color={AppColors.primary} style={{ marginRight: 6 }} />
                            <Text style={{ flex: 1, color: 'rgba(255,255,255,0.9)', fontSize: 13, fontFamily: 'Inter-Medium' }} numberOfLines={1}>
                              {selectedElement.selector}
                            </Text>
                            <TouchableOpacity onPress={clearSelectedElement} style={{ padding: 4 }}>
                              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
                            </TouchableOpacity>
                          </View>
                          {/* Divider */}
                          <View style={{ height: 0.5, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 16 }} />
                        </>
                      )}

                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingRight: 4, paddingTop: 2 }}>
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

                        {/* Send/Stop Button */}
                        <TouchableOpacity
                          onPress={agentStreaming || isAiLoading ? () => { stopAgent(); setIsAiLoading(false); } : handleSendMessage}
                          disabled={!agentStreaming && !isAiLoading && !message.trim()}
                          style={styles.previewSendButton}
                          activeOpacity={0.7}
                        >
                          <View style={[
                            styles.previewSendButtonInner,
                            (agentStreaming || isAiLoading) ? styles.previewSendButtonStop : (message.trim() && styles.previewSendButtonActive)
                          ]}>
                            <Ionicons
                              name={agentStreaming || isAiLoading ? "stop" : "arrow-up"}
                              size={16}
                              color={(agentStreaming || isAiLoading) ? '#fff' : (message.trim() ? '#fff' : 'rgba(255, 255, 255, 0.3)')}
                            />
                          </View>
                        </TouchableOpacity>
                      </View>
                    </View>
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
        </Animated.View >
      </Reanimated.View >
    </>
  );
});

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
    backgroundColor: '#0a0a0a', // Solid dark background to hide initial white paint
  },
  // Terminal output styles for CLI projects
  terminalOutputContainer: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  terminalOutputContent: {
    padding: 16,
    paddingBottom: 100,
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
  },
  terminalDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ff5f56',
    marginRight: 8,
  },
  terminalTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginRight: 44, // Compensate for dots
  },
  terminalEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  terminalEmptyText: {
    marginTop: 16,
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    lineHeight: 22,
  },
  terminalLine: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#e0e0e0',
    lineHeight: 18,
    marginBottom: 2,
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
    width: 280,
    height: 570,
    backgroundColor: '#1c1c1e',
    borderRadius: 54,
    borderWidth: 6,
    borderColor: '#3a3a3c',
    overflow: 'hidden',
    position: 'relative',
    // Titanium frame effect
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 32,
    elevation: 20,
  },
  statusBarArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: '#0a0a0c',
    marginHorizontal: 4,
    marginTop: 4,
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
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
    backgroundColor: '#0a0a0c',
    marginHorizontal: 4,
    marginBottom: 4,
    borderBottomLeftRadius: 50,
    borderBottomRightRadius: 50,
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
  previewSendButtonStop: {
    backgroundColor: '#FF6B6B',
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
    minHeight: 44,
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
  // Error UI styles (inside iPhone mockup)
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  errorIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  errorButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  sendLogsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  sendLogsButtonSent: {
    borderColor: 'rgba(76, 175, 80, 0.4)',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  sendLogsButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  reportSentMessage: {
    marginTop: 16,
    fontSize: 12,
    color: 'rgba(76, 175, 80, 0.8)',
    textAlign: 'center',
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
  // New Premium "Pulse" Redesign Styles
  ambientBlob1: {
    position: 'absolute',
    top: '10%',
    left: '-20%',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: AppColors.primary,
    opacity: 0.04,
    filter: 'blur(80px)',
  },
  ambientBlob2: {
    position: 'absolute',
    bottom: '5%',
    right: '-10%',
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: '#6C5CE7',
    opacity: 0.03,
    filter: 'blur(100px)',
  },
  iphoneScreenCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#0a0a0c',
  },
  spiritContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 160,
    marginBottom: 50,
  },
  spiritOrb: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: AppColors.primary,
    position: 'absolute',
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 10,
  },
  spiritCore: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 15,
    elevation: 15,
  },
  spiritGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  pulseStatusContainer: {
    alignItems: 'center',
    gap: 16,
  },
  pulseStatusLabel: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.8,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  pulseStatusMessage: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
    fontFamily: 'Inter-Medium',
  },
  miniProgressContainer: {
    position: 'absolute',
    bottom: 50,
    left: 40,
    right: 40,
    alignItems: 'center',
  },
  miniProgressBarBase: {
    width: '100%',
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 1,
    overflow: 'visible',
    marginBottom: 10,
  },
  miniProgressBarActive: {
    height: '100%',
    borderRadius: 1,
  },
  miniProgressBarGlow: {
    position: 'absolute',
    right: 0,
    top: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: AppColors.primary,
    shadowColor: AppColors.primary,
    shadowOpacity: 1,
    shadowRadius: 10,
    opacity: 0.8,
  },
  miniProgressText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.3)',
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: 'Inter-Bold',
  },
  loadingFooter: {
    position: 'absolute',
    bottom: 40,
    width: '100%',
    alignItems: 'center',
  },
  loadingFooterText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.2)',
    fontFamily: 'Inter-Regular',
  },
  // Cosmic Energy Styles
  cosmicOrbContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 200,
    marginBottom: 40,
  },
  cosmicOrb: {
    width: 130,
    height: 130,
    borderRadius: 65,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 20,
    zIndex: 5,
  },
  cosmicGlowRing1: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.2)',
  },
  cosmicGlowRing2: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(139, 124, 246, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.05)',
  },
  cosmicTextContainer: {
    alignItems: 'center',
    gap: 8,
  },
  cosmicTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
    fontFamily: 'Inter-Black',
    textAlign: 'center',
    width: '100%',
  },
  cosmicTitleUnderline: {
    width: 40,
    height: 3,
    backgroundColor: AppColors.primary,
    borderRadius: 2,
    marginBottom: 8,
  },
  cosmicSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: 'Inter-Medium',
  },
  // Previous styles (keeping for reference if needed elsewhere)
  startupStepsCard: {
    display: 'none', // Removed in Pulse design
  },
  // Premium CTA High-End Redesign
  premiumBanner: {
    width: '90%',
    maxWidth: 320,
    height: 64,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 15,
  },
  premiumBorderGradient: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5,
    borderColor: 'rgba(139, 124, 246, 0.2)',
    borderRadius: 20,
    opacity: 0.5,
  },
  premiumBannerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 14,
  },
  premiumIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },
  premiumBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    fontFamily: 'Inter-Black',
    letterSpacing: -0.2,
  },
  proBadge: {
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.3)',
  },
  proBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: AppColors.primary,
    fontFamily: 'Inter-Black',
  },
  premiumBannerSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
    fontFamily: 'Inter-Medium',
    letterSpacing: -0.1,
  },
  premiumArrow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
