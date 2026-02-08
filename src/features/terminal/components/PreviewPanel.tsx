import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, Easing, Platform, ScrollView, KeyboardAvoidingView } from 'react-native';
import Reanimated, { useAnimatedStyle, useAnimatedReaction, runOnJS, useSharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import { ProjectInfo } from '../../../core/preview/projectDetector';
import { useWorkstationStore } from '../../../core/terminal/workstationStore';
import { useUIStore } from '../../../core/terminal/uiStore';
import { useAuthStore } from '../../../core/auth/authStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkConfig } from '../../../providers/NetworkConfigProvider';
import { useSidebarOffset } from '../context/SidebarContext';
import { logOutput, logError, logSystem } from '../../../core/terminal/terminalLogger';
import { gitAccountService } from '../../../core/git/gitAccountService';
import { serverLogService } from '../../../core/services/serverLogService';
import { fileWatcherService } from '../../../core/services/agentService';
import { AskUserQuestionModal } from '../../../shared/components/modals/AskUserQuestionModal';
import { getAuthToken, getAuthHeaders } from '../../../core/api/getAuthToken';

// Sub-components
import { PreviewToolbar } from './PreviewToolbar';
import { PreviewWebView } from './PreviewWebView';
import { PreviewAIChat } from './PreviewAIChat';
import { PreviewPublishSheet } from './PreviewPublishSheet';
import { PreviewStartScreen, PreviewSessionExpiredScreen, PreviewErrorScreen } from './PreviewServerStatus';
import { PreviewEnvVarsForm } from './PreviewEnvVarsForm';

// Hooks
import { usePreviewPublish } from '../hooks/usePreviewPublish';
import { usePreviewChat } from '../hooks/usePreviewChat';
import { usePreviewStartup } from '../hooks/usePreviewStartup';

const USE_HOLY_GRAIL = true;

interface Props {
  onClose: () => void;
  previewUrl: string;
  projectName?: string;
  projectPath?: string;
}

export const PreviewPanel = React.memo(({ onClose, previewUrl, projectName, projectPath }: Props) => {
  const { t } = useTranslation(['terminal', 'common']);
  const currentWorkstation = useWorkstationStore((state) => state.currentWorkstation);
  const globalServerStatus = useUIStore((state) => state.previewServerStatus);
  const globalServerUrl = useUIStore((state) => state.previewServerUrl);
  const setPreviewServerStatus = useUIStore((state) => state.setPreviewServerStatus);
  const setPreviewServerUrl = useUIStore((state) => state.setPreviewServerUrl);
  const globalFlyMachineId = useUIStore((state) => state.flyMachineId);
  const setGlobalFlyMachineId = useUIStore((state) => state.setFlyMachineId);
  const projectMachineIds = useUIStore((state) => state.projectMachineIds);
  const projectPreviewUrls = useUIStore((state) => state.projectPreviewUrls);
  const projectId = currentWorkstation?.id;
  const { apiUrl } = useNetworkConfig();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { sidebarTranslateX } = useSidebarOffset();

  // Animated container position
  const containerAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    return { left: 44 + sidebarTranslateX.value };
  });

  const isExpandedShared = useSharedValue(false);
  const fabWidthAnim = useRef(new Animated.Value(44)).current;

  const animateFabWidth = (targetWidth: number) => {
    Animated.spring(fabWidthAnim, {
      toValue: targetWidth, useNativeDriver: false, damping: 20, stiffness: 180,
    }).start();
  };

  useAnimatedReaction(
    () => sidebarTranslateX.value,
    (currentValue, previousValue) => {
      if (isExpandedShared.value && previousValue !== null && currentValue !== previousValue) {
        runOnJS(animateFabWidth)(320 + Math.abs(currentValue));
      }
    },
    []
  );

  // ---- Core server state ----
  const [isLoading, setIsLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [serverStatus, setServerStatusLocal] = useState<'checking' | 'running' | 'stopped'>(globalServerStatus);
  const serverStatusRef = useRef<'checking' | 'running' | 'stopped'>(globalServerStatus);

  const setServerStatus = (status: 'checking' | 'running' | 'stopped') => {
    setServerStatusLocal(status);
    setPreviewServerStatus(status);
    serverStatusRef.current = status;
  };

  const getInitialPreviewUrl = () => {
    if (globalServerUrl && !globalServerUrl.includes('localhost:3000')) return globalServerUrl;
    return previewUrl || '';
  };
  const [currentPreviewUrl, setCurrentPreviewUrlLocal] = useState(getInitialPreviewUrl());
  const setCurrentPreviewUrl = (url: string) => {
    setCurrentPreviewUrlLocal(url);
    setPreviewServerUrl(url, currentWorkstation?.id);
  };

  const [webViewReady, setWebViewReady] = useState(false);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [hasWebUI, setHasWebUI] = useState(true);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const terminalScrollRef = useRef<ScrollView>(null);
  const logsXhrRef = useRef<XMLHttpRequest | null>(null);
  const webViewRef = useRef<WebView>(null);
  const checkInterval = useRef<NodeJS.Timeout | null>(null);
  const prevWorkstationId = useRef<string | null>(null);
  const releaseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [coderToken, setCoderToken] = useState<string | null>(null);
  const flyMachineIdRef = useRef<string | null>(globalFlyMachineId);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState('');

  // Environment variables
  const [requiredEnvVars, setRequiredEnvVars] = useState<Array<{ key: string; defaultValue: string; description: string; required: boolean }> | null>(null);
  const [envVarValues, setEnvVarValues] = useState<Record<string, string>>({});
  const [envTargetFile, setEnvTargetFile] = useState<string>('.env');
  const [isSavingEnv, setIsSavingEnv] = useState(false);

  // ---- Custom hooks ----
  const startup = usePreviewStartup({
    projectId,
    serverStatus,
    webViewReady,
    currentWorkstationName: currentWorkstation?.name,
  });

  const publish = usePreviewPublish({ projectId, apiUrl, serverStatus });

  const chat = usePreviewChat({
    currentWorkstationId: currentWorkstation?.id,
    currentWorkstationName: currentWorkstation?.name,
    webViewRef,
  });

  // ---- Server lifecycle ----

  const checkServerStatus = async (urlOverride?: string, retryCount = 0) => {
    const urlToCheck = urlOverride || currentPreviewUrl;
    const maxRetries = 300;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(urlToCheck, {
        method: 'GET', cache: 'no-store', credentials: 'include',
        headers: {
          'Coder-Session-Token': coderToken || '',
          'Accept': 'text/html',
          'X-Drape-Check': 'true',
          ...(flyMachineIdRef.current ? { 'Fly-Force-Instance-Id': flyMachineIdRef.current } : {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const agentStatus = response.headers.get('X-Drape-Agent-Status');
      if ((response.status >= 200 && response.status < 400) || response.status === 500) {
        if (agentStatus === 'waiting') {
          startup.setStartingMessage(t('terminal:preview.installingDeps'));
          if (serverStatusRef.current === 'checking' && retryCount < maxRetries) {
            setTimeout(() => checkServerStatus(urlToCheck, retryCount + 1), 2000);
          }
          return;
        }
        if (serverStatusRef.current !== 'running') {
          logOutput(`Server is running at ${urlToCheck}`, 'preview', 0);
        }
        setServerStatus('running');
        startup.clearLogs();
        startup.setIsStarting(false);
        setTimeout(() => setWebViewReady(true), 500);
      } else if (response.status === 403 || response.status === 503) {
        startup.setStartingMessage(response.status === 503 ? t('terminal:preview.startingDevServer') : t('terminal:preview.configuringServer'));
        try {
          const healthUrl = urlToCheck.endsWith('/') ? `${urlToCheck}health` : `${urlToCheck}/health`;
          await fetch(healthUrl, {
            headers: { 'Fly-Force-Instance-Id': flyMachineIdRef.current || '' },
            credentials: 'include', signal: controller.signal,
          });
        } catch {}
        if (serverStatusRef.current === 'checking' && retryCount < maxRetries) {
          setTimeout(() => checkServerStatus(urlToCheck, retryCount + 1), 2000);
        }
      } else {
        startup.setStartingMessage(t('terminal:preview.waitingForServer'));
        if (serverStatusRef.current === 'checking' && retryCount < maxRetries) {
          setTimeout(() => checkServerStatus(urlToCheck, retryCount + 1), 2000);
        }
      }
    } catch (error: any) {
      startup.setStartingMessage(error.name === 'AbortError' ? t('terminal:preview.connecting') : t('terminal:preview.retryingConnection'));
      if (serverStatusRef.current === 'checking' && retryCount < maxRetries) {
        setTimeout(() => checkServerStatus(urlToCheck, retryCount + 1), 3000);
      }
    }
  };

  const handleStartServer = async () => {
    if (!currentWorkstation?.id) {
      logError('No workstation selected', 'preview');
      return;
    }

    // Quick health check if already have a machineId
    if (globalFlyMachineId && currentPreviewUrl) {
      setServerStatus('checking');
      startup.setIsStarting(true);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(currentPreviewUrl, {
          method: 'GET', cache: 'no-store', credentials: 'include',
          headers: { 'Fly-Force-Instance-Id': globalFlyMachineId },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (response.status >= 200 && response.status < 500) {
          setServerStatus('running');
          startup.setIsStarting(false);
          setWebViewReady(true);
          return;
        }
      } catch {}
    }

    setSessionExpired(false);
    setSessionExpiredMessage('');
    startup.setIsStarting(true);
    setServerStatus('checking');
    startup.clearLogs();

    startup.setStartupSteps([
      { id: 'analyzing', label: t('terminal:preview.steps.analyzing'), status: 'pending' },
      { id: 'cloning', label: t('terminal:preview.steps.cloning'), status: 'pending' },
      { id: 'detecting', label: t('terminal:preview.steps.detecting'), status: 'pending' },
      { id: 'booting', label: t('terminal:preview.steps.booting'), status: 'pending' },
      { id: 'ready', label: t('terminal:preview.steps.ready'), status: 'pending' },
    ]);
    startup.setCurrentStepId('analyzing');
    startup.setStartingMessage(t('terminal:preview.analyzingProject'));
    startup.setTargetProgress(5);
    startup.setIsNextJsProject(false);

    logSystem(`Starting AI-powered preview for ${currentWorkstation?.name || 'project'}...`, 'preview');

    try {
      const userId = useWorkstationStore.getState().userId || 'anonymous';
      const userEmail = useAuthStore.getState().user?.email || 'anonymous@drape.dev';
      let githubToken: string | null = null;
      const repoUrl = currentWorkstation.repositoryUrl || currentWorkstation.githubUrl;
      if (repoUrl) {
        const tokenResult = await gitAccountService.getTokenForRepo(userId, repoUrl);
        githubToken = tokenResult?.token || null;
      }
      const username = userEmail.split('@')[0].replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      const previewEndpoint = USE_HOLY_GRAIL ? `${apiUrl}/fly/preview/start` : `${apiUrl}/preview/start`;

      const authToken = await getAuthToken();

      return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', previewEndpoint);
        xhr.setRequestHeader('Content-Type', 'application/json');
        if (authToken) {
          xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
        }

        let lastIndex = 0;
        let pollInterval: any = null;
        let dataBuffer = '';
        let readyReceived = false;
        let errorReceived = false;

        const processResponse = () => {
          const newData = xhr.responseText.substring(lastIndex);
          if (!newData) return;
          lastIndex = xhr.responseText.length;
          dataBuffer += newData;

          let lineEndIndex;
          while ((lineEndIndex = dataBuffer.indexOf('\n')) !== -1) {
            const line = dataBuffer.substring(0, lineEndIndex).trim();
            dataBuffer = dataBuffer.substring(lineEndIndex + 1);

            if (line.startsWith('data: ')) {
              try {
                const dataStr = line.substring(6);
                if (dataStr === '[DONE]') continue;
                const parsed = JSON.parse(dataStr);

                if (parsed.type === 'warning') {
                  try {
                    const warningData = JSON.parse(parsed.step);
                    if (warningData.type === 'nextjs-version') {
                      startup.setIsNextJsProject(true);
                      startup.setTargetProgress(20);
                      logOutput(`⚠️ ${warningData.message}`, 'preview', 0);
                    }
                  } catch {}
                } else if (parsed.type === 'step') {
                  startup.recentLogsRef.current.push(`[STEP] ${parsed.step}: ${parsed.message}`);
                  if (startup.recentLogsRef.current.length > 50) startup.recentLogsRef.current.shift();

                  startup.setCurrentStepId(parsed.step);
                  startup.setStartingMessage(parsed.message);

                  const stepProgressMap: Record<string, number> = {
                    'analyzing': 5, 'cloning': 10, 'detecting': 15, 'warning': 20,
                    'booting': 25, 'install': 40, 'installing': 40, 'starting': 70, 'ready': 100,
                  };
                  startup.setTargetProgress(stepProgressMap[parsed.step] || startup.targetProgress);

                  if (parsed.projectType?.toLowerCase().includes('next') ||
                    parsed.message?.toLowerCase().includes('next.js') ||
                    parsed.message?.toLowerCase().includes('turbopack')) {
                    startup.setIsNextJsProject(true);
                  }

                  startup.setStartupSteps(startup.startupSteps.map(step => {
                    if (step.id === parsed.step) return { ...step, status: 'active' as const };
                    const stepOrder = ['analyzing', 'cloning', 'detecting', 'booting', 'installing', 'starting', 'ready'];
                    const currentIdx = stepOrder.indexOf(parsed.step);
                    const stepIdx = stepOrder.indexOf(step.id);
                    if (stepIdx < currentIdx) return { ...step, status: 'complete' as const };
                    return step;
                  }));

                  if (parsed.step === 'ready') {
                    readyReceived = true;
                    const result = parsed;
                    const completeSetup = () => {
                      setServerStatus('running');
                      startup.clearLogs();
                      startup.setIsStarting(false);
                      resolve();
                    };

                    if (result.previewUrl) {
                      if (result.coderToken) setCoderToken(result.coderToken);
                      const projectHasWebUI = result.hasWebUI !== false;
                      setHasWebUI(projectHasWebUI);
                      if (!projectHasWebUI) setWebViewReady(true);

                      if (result.machineId) {
                        setGlobalFlyMachineId(result.machineId, currentWorkstation?.id);
                        flyMachineIdRef.current = result.machineId;
                        getAuthHeaders().then(authHeaders => fetch(`${apiUrl}/fly/session`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', ...authHeaders },
                          body: JSON.stringify({ machineId: result.machineId }),
                          credentials: 'include',
                        })).then(() => {
                          setTimeout(() => {
                            setCurrentPreviewUrl(result.previewUrl);
                            completeSetup();
                          }, 1000);
                        }).catch(() => {
                          setCurrentPreviewUrl(result.previewUrl);
                          completeSetup();
                        });
                      } else {
                        setCurrentPreviewUrl(result.previewUrl);
                        completeSetup();
                      }
                    } else {
                      completeSetup();
                    }
                  }
                } else if (parsed.type === 'error') {
                  errorReceived = true;
                  startup.recentLogsRef.current.push(`[ERROR] ${parsed.message}`);
                  startup.setStartupSteps(startup.startupSteps.map(s => s.status === 'active' ? { ...s, status: 'error' as const } : s));
                  logError(parsed.message, 'preview');
                  setServerStatus('stopped');
                  startup.setIsStarting(false);
                  startup.setPreviewError({ message: parsed.message, timestamp: new Date() });
                  reject(new Error(parsed.message));
                }
              } catch {}
            }
          }
        };

        xhr.onprogress = () => processResponse();
        pollInterval = setInterval(processResponse, 100);

        xhr.onload = async () => {
          if (pollInterval) clearInterval(pollInterval);
          processResponse();
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error(`Server error: ${xhr.status}`));
            return;
          }
          if (!readyReceived && !errorReceived && xhr.status === 200) {
            try {
              const fallbackAuthHeaders = await getAuthHeaders();
              const sessionRes = await fetch(`${apiUrl}/fly/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...fallbackAuthHeaders },
                body: JSON.stringify({ projectId: currentWorkstation?.id }),
                credentials: 'include',
              });
              const sessionData = await sessionRes.json();
              if (sessionData.machineId) {
                setGlobalFlyMachineId(sessionData.machineId, currentWorkstation?.id);
                flyMachineIdRef.current = sessionData.machineId;
                setCurrentPreviewUrl(`${apiUrl}/preview/${currentWorkstation?.id}`);
                setServerStatus('running');
                startup.setIsStarting(false);
                resolve();
              } else {
                reject(new Error('Preview completed but ready event was lost'));
              }
            } catch {
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
          githubToken, userEmail, username,
        }));
      });
    } catch (error: any) {
      logError(error.message || t('terminal:preview.errorDuringStartup'), 'preview');
      setServerStatus('stopped');
      startup.setIsStarting(false);
      startup.setPreviewError({ message: error.message || t('terminal:preview.errorStartingPreview'), timestamp: new Date() });
    }
  };

  const handleStartWithTransition = () => {
    startup.setIsStartTransitioning(true);
    Animated.timing(startup.startTransitionAnim, {
      toValue: 1, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true,
    }).start(() => handleStartServer());
  };

  const handleRetryPreview = () => {
    startup.setPreviewError(null);
    startup.setReportSent(false);
    startup.setStartupSteps([
      { id: 'analyzing', label: t('terminal:preview.steps.analyzing'), status: 'pending' },
      { id: 'cloning', label: t('terminal:preview.steps.cloning'), status: 'pending' },
      { id: 'detecting', label: t('terminal:preview.steps.detecting'), status: 'pending' },
      { id: 'booting', label: t('terminal:preview.steps.booting'), status: 'pending' },
      { id: 'ready', label: t('terminal:preview.steps.ready'), status: 'pending' },
    ]);
    startup.setSmoothProgress(0);
    handleStartServer();
  };

  const sendErrorReport = async () => {
    if (!startup.previewError) return;
    startup.setIsSendingReport(true);
    try {
      const authHeaders = await getAuthHeaders();
      await fetch(`${apiUrl}/fly/error-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          projectId: currentWorkstation?.id,
          userId: useAuthStore.getState().user?.email,
          errorMessage: startup.previewError.message,
          deviceInfo: { platform: Platform.OS, version: Platform.Version },
          logs: startup.recentLogsRef.current,
          timestamp: startup.previewError.timestamp.toISOString(),
        }),
      });
      startup.setReportSent(true);
    } catch {} finally {
      startup.setIsSendingReport(false);
    }
  };

  const handleClose = () => {
    if (checkInterval.current) clearInterval(checkInterval.current);
    if ((serverStatus === 'running' || serverStatus === 'checking') && currentWorkstation?.id) {
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = setTimeout(async () => {
        try {
          const releaseAuthHeaders = await getAuthHeaders();
          const response = await fetch(`${apiUrl}/fly/release`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...releaseAuthHeaders },
            body: JSON.stringify({ projectId: currentWorkstation.id }),
          });
          if (response.ok) {
            setPreviewServerStatus('stopped');
            setPreviewServerUrl(null);
            serverLogService.disconnect();
          }
        } catch {}
      }, 5 * 60 * 1000);
    }
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => onClose());
  };

  const handleRefresh = () => {
    webViewRef.current?.clearCache(true);
    const baseUrl = currentPreviewUrl.split('?')[0];
    setCurrentPreviewUrl(`${baseUrl}?_t=${Date.now()}`);
    webViewRef.current?.reload();
    checkServerStatus();
  };

  const handleSaveEnvVars = async () => {
    if (!currentWorkstation?.id) return;
    setIsSavingEnv(true);
    logSystem(t('terminal:preview.savingEnvVars'), 'preview');
    try {
      const envAuthHeaders = await getAuthHeaders();
      const response = await fetch(`${apiUrl}/preview/env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...envAuthHeaders },
        body: JSON.stringify({ workstationId: currentWorkstation.id, envVars: envVarValues, targetFile: envTargetFile }),
      });
      if (!response.ok) throw new Error(t('terminal:preview.saveError'));
      const result = await response.json();
      logOutput(t('terminal:preview.varsSavedIn', { file: result.file }), 'preview', 0);
      setRequiredEnvVars(null);
      setEnvVarValues({});
      logSystem(t('terminal:preview.restartingServer'), 'preview');
      handleStartServer();
    } catch (error: any) {
      logError(t('terminal:preview.errorWithMessage', { message: error.message }), 'preview');
    } finally {
      setIsSavingEnv(false);
    }
  };

  // ---- Effects ----

  // Hot reload: connect to file watcher
  useEffect(() => {
    const workstationId = currentWorkstation?.id;
    const username = currentWorkstation?.githubAccountUsername?.toLowerCase() || 'default';
    if (serverStatus === 'running' && workstationId && username) {
      fileWatcherService.connect(workstationId, username, (change) => {
        logOutput(`[Hot Reload] ${change.file} changed`, 'preview', 0);
        webViewRef.current?.reload();
      });
    }
  }, [serverStatus, currentWorkstation?.id]);

  // Periodic health checks when running
  useEffect(() => {
    if (serverStatus !== 'running') return;
    if (currentPreviewUrl.includes('localhost:3001')) return;
    checkInterval.current = setInterval(checkServerStatus, 5000);
    return () => { if (checkInterval.current) clearInterval(checkInterval.current); };
  }, [currentPreviewUrl, serverStatus]);

  // Set default project info
  useEffect(() => {
    if (!projectInfo) {
      setProjectInfo({ type: 'detecting', defaultPort: 3000, startCommand: '', installCommand: '', description: 'Click Play to detect and start' });
    }
  }, [currentWorkstation]);

  // Fallback: force WebView ready after timeout
  useEffect(() => {
    let isMounted = true;

    if (serverStatus === 'running' && !webViewReady) {
      const timer = setTimeout(() => {
        if (isMounted) {
          setWebViewReady(true);
        }
      }, 10000);
      return () => {
        isMounted = false;
        clearTimeout(timer);
      };
    }

    return () => { isMounted = false; };
  }, [serverStatus, webViewReady]);

  // Auto-recovery: request machineId if missing
  useEffect(() => {
    let isMounted = true;

    const shouldRecover = (serverStatus === 'running' || serverStatus === 'stopped') && !globalFlyMachineId && currentWorkstation?.id;
    if (shouldRecover) {
      getAuthHeaders().then(recoverAuthHeaders => fetch(`${apiUrl}/fly/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...recoverAuthHeaders },
        body: JSON.stringify({ projectId: currentWorkstation.id }),
        credentials: 'include',
      })).then(res => res.json()).then(data => {
        if (isMounted && data.machineId) {
          setGlobalFlyMachineId(data.machineId, currentWorkstation.id);
        }
      }).catch((err) => {
        if (isMounted) {
          console.warn('[Preview] Failed to recover machine ID:', err?.message || err);
        }
      });
    }

    return () => { isMounted = false; };
  }, [serverStatus, globalFlyMachineId, currentWorkstation?.id, apiUrl]);

  // Live logs SSE streaming
  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isMounted = true;

    const connectToLogs = async () => {
      if (!isMounted) return;
      if ((serverStatus !== 'running' && !startup.isStarting && serverStatus !== 'checking') || !currentWorkstation?.id) return;
      if (logsXhrRef.current) { logsXhrRef.current.abort(); logsXhrRef.current = null; }

      const logsUrl = `${apiUrl}/fly/logs/${currentWorkstation.id}`;
      const xhr = new XMLHttpRequest();
      logsXhrRef.current = xhr;
      let lastIndex = 0;
      let dataBuffer = '';

      const logsAuthToken = await getAuthToken();
      xhr.open('GET', logsUrl);
      xhr.setRequestHeader('Accept', 'text/event-stream');
      if (logsAuthToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${logsAuthToken}`);
      }

      xhr.onprogress = () => {
        const newData = xhr.responseText.substring(lastIndex);
        if (!newData) return;
        lastIndex = xhr.responseText.length;
        dataBuffer += newData;

        let lineEndIndex;
        while ((lineEndIndex = dataBuffer.indexOf('\n')) !== -1) {
          const line = dataBuffer.substring(0, lineEndIndex).trim();
          dataBuffer = dataBuffer.substring(lineEndIndex + 1);
          if (line.startsWith('data: ')) {
            try {
              const dataStr = line.substring(6);
              if (dataStr === '[DONE]') continue;
              const data = JSON.parse(dataStr);
              if (data.type === 'connected' || data.type === 'error') continue;
              if (data.type === 'session_expired') {
                setSessionExpired(true);
                setSessionExpiredMessage(data.message || t('terminal:preview.sessionExpired'));
                setServerStatus('stopped');
                startup.setIsStarting(false);
                if (checkInterval.current) { clearInterval(checkInterval.current); checkInterval.current = null; }
                continue;
              }
              if (data.text) {
                if (serverStatus !== 'running') startup.setDisplayedMessage(data.text);
                setTerminalOutput(prev => {
                  const newOutput = [...prev, data.text];
                  return newOutput.length > 500 ? newOutput.slice(-500) : newOutput;
                });
                setTimeout(() => terminalScrollRef.current?.scrollToEnd({ animated: true }), 50);
              }
            } catch {}
          }
        }
      };

      xhr.onerror = () => { if (isMounted) reconnectTimeout = setTimeout(connectToLogs, 3000); };
      xhr.onload = () => {
        // Retry on any non-200 status (404 = no session yet, 503 = unavailable)
        if (xhr.status !== 200 && isMounted) reconnectTimeout = setTimeout(connectToLogs, 2000);
      };
      xhr.send();
    };

    connectToLogs();
    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (logsXhrRef.current) { logsXhrRef.current.abort(); logsXhrRef.current = null; }
    };
  }, [serverStatus, startup.isStarting, currentWorkstation?.id, apiUrl]);

  // Reset/restore state when project changes
  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    const currentId = currentWorkstation?.id;
    if (prevWorkstationId.current && prevWorkstationId.current !== currentId) {
      const restoredMachineId = currentId ? projectMachineIds[currentId] : null;
      const restoredUrl = currentId ? projectPreviewUrls[currentId] : null;

      if (restoredMachineId) {
        setServerStatus('checking');
        setGlobalFlyMachineId(restoredMachineId, currentId);
        serverLogService.connect(currentId, apiUrl);
        getAuthHeaders().then(switchAuthHeaders => fetch(`${apiUrl}/fly/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...switchAuthHeaders },
          body: JSON.stringify({ machineId: restoredMachineId, projectId: currentId }),
          credentials: 'include',
        })).then(() => {
          if (!isMounted) return;
          timeoutId = setTimeout(() => {
            if (isMounted) {
              if (restoredUrl) setCurrentPreviewUrl(restoredUrl);
              checkServerStatus(restoredUrl || undefined);
            }
          }, 1000);
        }).catch(() => {
          if (!isMounted) return;
          if (restoredUrl) setCurrentPreviewUrl(restoredUrl);
          checkServerStatus(restoredUrl || undefined);
        });
      } else {
        setServerStatus('stopped');
        setPreviewServerUrl(null);
        setGlobalFlyMachineId(null);
        setProjectInfo(null);
        setCoderToken(null);
        startup.setIsStarting(false);
        setWebViewReady(false);
        serverLogService.disconnect();
      }
      if (checkInterval.current) { clearInterval(checkInterval.current); checkInterval.current = null; }
    }
    prevWorkstationId.current = currentId || null;

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [currentWorkstation?.id]);

  // Opening animation + session cookie restore
  useEffect(() => {
    let isMounted = true;

    Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    if (globalFlyMachineId && apiUrl) {
      flyMachineIdRef.current = globalFlyMachineId;
      getAuthHeaders().then(initAuthHeaders => fetch(`${apiUrl}/fly/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...initAuthHeaders },
        body: JSON.stringify({ machineId: globalFlyMachineId }),
        credentials: 'include',
      })).catch((err) => {
        if (isMounted) {
          console.warn('[Preview] Failed to restore session cookie:', err?.message || err);
        }
      });
    }

    return () => { isMounted = false; };
  }, []);

  // Update URL when prop changes
  useEffect(() => {
    if (previewUrl && previewUrl !== currentPreviewUrl && !globalServerUrl) {
      setCurrentPreviewUrl(previewUrl);
    }
  }, [previewUrl]);

  // ---- Render ----
  return (
    <>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

      <Reanimated.View style={[styles.container, containerAnimatedStyle]}>
        <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
          <LinearGradient colors={['#0a0a0a', '#000000']} style={StyleSheet.absoluteFill} />

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={insets.top}>
            {serverStatus === 'running' && webViewReady && (
              <PreviewToolbar
                currentPreviewUrl={currentPreviewUrl}
                onClose={handleClose}
                onRefresh={handleRefresh}
                onPublish={publish.openPublishModal}
                existingPublish={publish.existingPublish}
                topInset={insets.top}
              />
            )}

            <View style={styles.webViewContainer}>
              {serverStatus === 'stopped' && requiredEnvVars ? (
                <PreviewEnvVarsForm
                  requiredEnvVars={requiredEnvVars}
                  envVarValues={envVarValues}
                  onChangeEnvVar={(key, value) => setEnvVarValues(prev => ({ ...prev, [key]: value }))}
                  isSaving={isSavingEnv}
                  onSave={handleSaveEnvVars}
                  onCancel={() => setRequiredEnvVars(null)}
                  topInset={insets.top}
                  bottomInset={insets.bottom}
                />
              ) : sessionExpired ? (
                <PreviewSessionExpiredScreen
                  sessionExpiredMessage={sessionExpiredMessage}
                  onStartServer={handleStartServer}
                  t={t}
                />
              ) : serverStatus === 'stopped' && startup.previewError ? (
                <PreviewErrorScreen
                  previewError={startup.previewError}
                  onClose={handleClose}
                  onRetryPreview={handleRetryPreview}
                  onSendErrorReport={sendErrorReport}
                  isSendingReport={startup.isSendingReport}
                  reportSent={startup.reportSent}
                  topInset={insets.top}
                  t={t}
                />
              ) : serverStatus === 'stopped' ? (
                <PreviewStartScreen
                  currentWorkstation={currentWorkstation}
                  isStartTransitioning={startup.isStartTransitioning}
                  startTransitionAnim={startup.startTransitionAnim}
                  onStartWithTransition={handleStartWithTransition}
                  t={t}
                />
              ) : (
                <PreviewWebView
                  webViewRef={webViewRef}
                  currentPreviewUrl={currentPreviewUrl}
                  coderToken={coderToken}
                  globalFlyMachineId={globalFlyMachineId}
                  flyMachineIdRef={flyMachineIdRef}
                  hasWebUI={hasWebUI}
                  webViewReady={webViewReady}
                  serverStatus={serverStatus}
                  isLoading={isLoading}
                  terminalOutput={terminalOutput}
                  terminalScrollRef={terminalScrollRef}
                  maskOpacityAnim={startup.maskOpacityAnim}
                  previewError={startup.previewError}
                  previewLogs={startup.previewLogs}
                  displayedMessage={startup.displayedMessage}
                  startingMessage={startup.startingMessage}
                  smoothProgress={startup.smoothProgress}
                  elapsedSeconds={startup.elapsedSeconds}
                  pulseAnim={startup.pulseAnim}
                  setIsLoading={setIsLoading}
                  setCanGoBack={setCanGoBack}
                  setCanGoForward={setCanGoForward}
                  setWebViewReady={setWebViewReady}
                  setCurrentPreviewUrl={setCurrentPreviewUrl}
                  setSelectedElement={chat.setSelectedElement}
                  setPreviewError={startup.setPreviewError}
                  setServerStatus={setServerStatus}
                  setIsStarting={startup.setIsStarting}
                  handleRefresh={handleRefresh}
                  onClose={handleClose}
                  onRetryPreview={handleRetryPreview}
                  onSendErrorReport={sendErrorReport}
                  isSendingReport={startup.isSendingReport}
                  reportSent={startup.reportSent}
                  topInset={insets.top}
                  t={t}
                />
              )}
            </View>
          </KeyboardAvoidingView>

          {serverStatus === 'running' && webViewReady && (
            <PreviewAIChat
              isInputExpanded={chat.isInputExpanded}
              isMessagesCollapsed={chat.isMessagesCollapsed}
              showPastChats={chat.showPastChats}
              message={chat.message}
              aiMessages={chat.aiMessages}
              activeTools={chat.activeTools}
              isAiLoading={chat.isAiLoading}
              agentStreaming={chat.agentStreaming}
              keyboardHeight={chat.keyboardHeight}
              selectedElement={chat.selectedElement}
              isInspectMode={chat.isInspectMode}
              currentTodos={chat.currentTodos}
              previewChatId={chat.previewChatId}
              chatHistory={chat.chatHistory}
              currentWorkstationId={currentWorkstation?.id}
              inputRef={chat.inputRef}
              aiScrollViewRef={chat.aiScrollViewRef}
              fabContentOpacity={chat.fabContentOpacity}
              bottomInset={insets.bottom}
              onExpandFab={chat.expandFab}
              onCollapseFab={chat.collapseFab}
              setMessage={chat.setMessage}
              setIsMessagesCollapsed={chat.setIsMessagesCollapsed}
              setShowPastChats={chat.setShowPastChats}
              onSendMessage={chat.handleSendMessage}
              onStopAgent={() => { chat.stopAgent(); chat.setIsAiLoading(false); }}
              onToggleInspectMode={chat.toggleInspectMode}
              onClearSelectedElement={chat.clearSelectedElement}
              onSelectParentElement={chat.selectParentElement}
              onLoadPastChat={chat.loadPastChat}
              onStartNewChat={chat.startNewChat}
            />
          )}
        </Animated.View>
      </Reanimated.View>

      <PreviewPublishSheet
        visible={publish.showPublishModal}
        publishSlug={publish.publishSlug}
        onChangeSlug={publish.setPublishSlug}
        isPublishing={publish.isPublishing}
        publishStatus={publish.publishStatus}
        publishedUrl={publish.publishedUrl}
        publishError={publish.publishError}
        existingPublish={publish.existingPublish}
        onPublish={publish.handlePublish}
        onUnpublish={publish.handleUnpublish}
        onClose={publish.closePublishModal}
      />

      <AskUserQuestionModal
        visible={!!chat.pendingQuestion}
        questions={chat.pendingQuestion || []}
        onAnswer={chat.handleQuestionAnswer}
        onCancel={() => {}}
      />
    </>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 999,
  },
  container: {
    position: 'absolute',
    right: 0, top: 0, bottom: 0,
    zIndex: 1000,
    overflow: 'hidden',
  },
  webViewContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#0a0a0a',
  },
});
