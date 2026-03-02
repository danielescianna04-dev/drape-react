import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { useAgentStore } from '../../../core/agent/agentStore';

// Sub-components
import { PreviewToolbar, ViewportMode } from './PreviewToolbar';
import { PreviewWebView } from './PreviewWebView';
import { PreviewAIChat } from './PreviewAIChat';
import { PreviewPublishSheet } from './PreviewPublishSheet';
import { PreviewStartScreen, PreviewSessionExpiredScreen, PreviewErrorScreen, PreviewLoadingScreen } from './PreviewServerStatus';
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
  isVisible?: boolean;
}

const pendingReleaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const PreviewPanel = React.memo(({ onClose, previewUrl, projectName, projectPath, isVisible = true }: Props) => {
  const { t } = useTranslation(['terminal', 'common']);
  const currentWorkstation = useWorkstationStore((state) => state.currentWorkstation);
  const globalServerUrl = useUIStore((state) => state.previewServerUrl);
  const setPreviewServerStatus = useUIStore((state) => state.setPreviewServerStatus);
  const setPreviewServerUrl = useUIStore((state) => state.setPreviewServerUrl);
  const globalFlyMachineId = useUIStore((state) => state.flyMachineId);
  const setGlobalFlyMachineId = useUIStore((state) => state.setFlyMachineId);
  const setPreviewAccessToken = useUIStore((state) => state.setPreviewAccessToken);
  const clearProjectPreviewSession = useUIStore((state) => state.clearProjectPreviewSession);
  const projectMachineIds = useUIStore((state) => state.projectMachineIds);
  const projectPreviewUrls = useUIStore((state) => state.projectPreviewUrls);
  const projectPreviewTokens = useUIStore((state) => state.projectPreviewTokens);
  const projectId = currentWorkstation?.id;
  const { apiUrl, wsUrl } = useNetworkConfig();
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

  // Never trust persisted 'running' — always verify with checkServerStatus first.
  // If project has a machine ID, start as 'checking' (will verify). Otherwise 'stopped'.
  const globalStatusBelongsToProject = projectId && projectMachineIds[projectId];
  const initialServerStatus = globalStatusBelongsToProject ? 'checking' as const : 'stopped' as const;
  const [serverStatus, setServerStatusLocal] = useState<'checking' | 'running' | 'stopped'>(initialServerStatus);
  const serverStatusRef = useRef<'checking' | 'running' | 'stopped'>(initialServerStatus);

  const setServerStatus = (status: 'checking' | 'running' | 'stopped') => {
    setServerStatusLocal(status);
    setPreviewServerStatus(status);
    serverStatusRef.current = status;
    // Immediately kill health-check interval when going to 'stopped'
    // so an in-flight or about-to-fire interval can't override the error screen.
    if (status === 'stopped' && checkInterval.current) {
      clearInterval(checkInterval.current);
      checkInterval.current = null;
    }
  };

  const clearPendingRelease = (targetProjectId?: string | null) => {
    if (!targetProjectId) return;
    const timer = pendingReleaseTimers.get(targetProjectId);
    if (timer) {
      clearTimeout(timer);
      pendingReleaseTimers.delete(targetProjectId);
    }
  };

  const getInitialPreviewUrl = () => {
    // 1. Prefer project-specific URL from the per-project map
    const projectSpecificUrl = projectId ? projectPreviewUrls[projectId] : null;

    // 2. Check if globalServerUrl belongs to THIS project (contains /preview/{projectId})
    const globalBelongsToProject = globalServerUrl && projectId && globalServerUrl.includes(`/preview/${projectId}`);

    // 3. Pick the best source: project-specific > global (if same project) > previewUrl prop
    let url = projectSpecificUrl
      || (globalBelongsToProject ? globalServerUrl : null)
      || previewUrl
      || '';

    if (!url.includes('localhost:3000') && url) {
      try {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/^(\/preview\/[^/]+)/);
        if (match) {
          // Strip any user-edited path suffix — always open at base preview URL
          // Trailing slash prevents 301 redirect (iOS WKWebView drops custom headers on redirects)
          url = `${parsed.origin}${match[1]}/`;
        } else if (projectId) {
          // Stored URL is corrupted (no /preview/ path) — reconstruct
          url = `${parsed.origin}/preview/${projectId}/`;
        }
      } catch {}
    }
    return url;
  };
  const withPreviewToken = (url: string, tokenOverride?: string | null): string => {
    if (!url) return url;
    const token = tokenOverride ?? previewAccessTokenRef.current;
    if (!token) return url;
    try {
      const parsed = new URL(url);
      if (!parsed.pathname.startsWith('/preview/')) return url;
      // Ensure trailing slash on /preview/{projectId} to prevent 301 redirect
      // (iOS WKWebView drops custom headers on server-side redirects)
      if (parsed.pathname.match(/^\/preview\/[^/]+$/)) {
        parsed.pathname += '/';
      }
      parsed.searchParams.set('pt', token);
      return parsed.toString();
    } catch {
      return url;
    }
  };
  const [currentPreviewUrl, setCurrentPreviewUrlLocal] = useState(getInitialPreviewUrl());
  const setCurrentPreviewUrl = (url: string) => {
    const secured = withPreviewToken(url);
    setCurrentPreviewUrlLocal(secured);
    setPreviewServerUrl(secured, currentWorkstation?.id);
  };
  const updatePreviewAccessToken = (token: string | null, targetProjectId?: string) => {
    const pid = targetProjectId || currentWorkstation?.id;
    setPreviewAccessTokenLocal(token);
    previewAccessTokenRef.current = token;
    setPreviewAccessToken(token, pid);
    if (currentPreviewUrl) {
      const secured = withPreviewToken(currentPreviewUrl, token);
      setCurrentPreviewUrlLocal(secured);
      setPreviewServerUrl(secured, pid);
    }
  };

  const [webViewReady, setWebViewReady] = useState(false);
  const [viewportMode, setViewportMode] = useState<ViewportMode>('mobile');
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [hasWebUI, setHasWebUIState] = useState(true);
  const hasWebUIRef = useRef(true);
  const setHasWebUI = (val: boolean) => { hasWebUIRef.current = val; setHasWebUIState(val); };
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [terminalAuthToken, setTerminalAuthToken] = useState<string | null>(null);
  const terminalScrollRef = useRef<ScrollView>(null);
  const logsXhrRef = useRef<XMLHttpRequest | null>(null);
  const webViewRef = useRef<WebView>(null);
  const checkInterval = useRef<NodeJS.Timeout | null>(null);
  const prevWorkstationId = useRef<string | null>(null);
  const logsSinceCursorRef = useRef<number>(0);
  const [coderToken, setCoderToken] = useState<string | null>(null);
  const flyMachineIdRef = useRef<string | null>(globalFlyMachineId);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState('');

  // Reload banner: defer reload until agent finishes all file changes
  const [showReloadBanner, setShowReloadBanner] = useState(false);
  const pendingChangesRef = useRef(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const agentIsRunning = useAgentStore((s) => s.isRunning);
  const agentFilesCreated = useAgentStore((s) => s.filesCreated);
  const agentFilesModified = useAgentStore((s) => s.filesModified);
  const agentIsRunningRef = useRef(false);
  const [previewAccessToken, setPreviewAccessTokenLocal] = useState<string | null>(
    projectId ? (projectPreviewTokens[projectId] || null) : null
  );
  const previewAccessTokenRef = useRef<string | null>(projectId ? (projectPreviewTokens[projectId] || null) : null);
  const previewTokenFromUrl = useMemo(() => {
    if (!currentPreviewUrl) return null;
    try {
      return new URL(currentPreviewUrl).searchParams.get('pt');
    } catch {
      return null;
    }
  }, [currentPreviewUrl]);
  const effectivePreviewAccessToken = previewAccessToken || previewTokenFromUrl;

  // Environment variables
  const [requiredEnvVars, setRequiredEnvVars] = useState<Array<{ key: string; defaultValue: string; description: string; required: boolean }> | null>(null);
  const [envVarValues, setEnvVarValues] = useState<Record<string, string>>({});
  const [isSavingEnv, setIsSavingEnv] = useState(false);

  const isMissingPreviewTokenError = (message?: string | null): boolean => {
    const normalized = (message || '').toLowerCase();
    return normalized.includes('preview access token required')
      || normalized.includes('preview token required')
      || normalized.includes('missing preview token');
  };

  const inferHasWebUI = (projectType?: string): boolean => {
    const normalized = String(projectType || '').toLowerCase();
    if (!normalized) return true;
    // Only explicit console templates are no-web. If backend doesn't provide
    // hasWebUI, prefer web to avoid false negatives on server projects.
    const noWebUiTypes = new Set(['python-console', 'javascript-console', 'c-lang', 'cpp', 'java']);
    return !noWebUiTypes.has(normalized);
  };

  const resetToStartScreen = () => {
    if (currentWorkstation?.id) {
      clearProjectPreviewSession(currentWorkstation.id);
    }
    setSessionExpired(false);
    setSessionExpiredMessage('');
    startup.setPreviewError(null);
    startup.setIsStarting(false);
    setServerStatus('stopped');
    setWebViewReady(false);
    setIsLoading(true);
  };

  useEffect(() => {
    const token = projectId ? (projectPreviewTokens[projectId] || null) : null;
    setPreviewAccessTokenLocal(token);
    previewAccessTokenRef.current = token;
  }, [projectId, projectPreviewTokens]);

  // ---- Custom hooks ----
  const startup = usePreviewStartup({
    projectId,
    previewAccessToken: effectivePreviewAccessToken,
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

  const normalizeStartupStep = (rawStep?: string): string => {
    const step = (rawStep || '').toLowerCase();
    const map: Record<string, string> = {
      container: 'booting',
      clone: 'cloning',
      detect: 'detecting',
      install: 'installing',
      server: 'starting',
      starting: 'starting',
      ready: 'ready',
      analyzing: 'analyzing',
      cloning: 'cloning',
      detecting: 'detecting',
      booting: 'booting',
      installing: 'installing',
    };
    return map[step] || step || 'analyzing';
  };

  const extractMissingEnvVars = (input: string): string[] => {
    if (!input) return [];
    const vars = new Set<string>();
    const bulletMatches = input.matchAll(/[•\-]\s*([A-Z][A-Z0-9_]{2,})/g);
    for (const m of bulletMatches) vars.add(m[1]);
    const t3Style = input.matchAll(/^\s*([A-Z][A-Z0-9_]{2,})\s*:\s*\[\s*'Required'\s*\]/gm);
    for (const m of t3Style) vars.add(m[1]);
    const inline = input.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g);
    for (const m of inline) {
      if (!['HTTP', 'HTML', 'JSON', 'ERROR'].includes(m[1])) vars.add(m[1]);
    }
    return [...vars].slice(0, 20);
  };

  const applyMissingEnvVarsFromMessage = (message: string) => {
    const missing = extractMissingEnvVars(message);
    if (missing.length === 0) return false;
    setRequiredEnvVars(
      missing.map((key) => ({ key, defaultValue: '', description: '', required: true }))
    );
    setEnvVarValues((prev) => {
      const next = { ...prev };
      for (const key of missing) {
        if (next[key] === undefined) next[key] = '';
      }
      return next;
    });
    return true;
  };

  const extractStartupErrorFromBody = (bodyText: string): string | null => {
    if (!bodyText) return null;
    const lower = bodyText.toLowerCase();
    if (lower.includes('invalid environment variables') || lower.includes('environment variable') || lower.includes('not set')) {
      const vars = extractMissingEnvVars(bodyText);
      if (vars.length > 0) {
        return `Il progetto richiede variabili d'ambiente non configurate:\n\n${vars.map(v => `• ${v}`).join('\n')}`;
      }
      return `Il progetto richiede variabili d'ambiente non configurate.`;
    }
    if (lower.includes('cannot find module') || lower.includes('module_not_found')) {
      return `Modulo non trovato. Controlla le dipendenze del progetto.`;
    }
    if (lower.includes('failed to compile') || lower.includes('syntaxerror')) {
      return `Errore di compilazione durante l'avvio preview.`;
    }
    return null;
  };

  const checkServerStatus = async (urlOverride?: string, retryCount = 0) => {
    // Console projects have no web server — skip health check entirely
    if (!hasWebUIRef.current) return;
    const urlToCheck = urlOverride || currentPreviewUrl;
    if (!urlToCheck) return;
    const maxRetries = 300;
    console.log(`[Preview:CHECK] checkServerStatus #${retryCount}`, { url: urlToCheck, serverStatus: serverStatusRef.current });

    const scheduleRetry = (delayMs = 2000) => {
      if (serverStatusRef.current === 'checking' && retryCount < maxRetries) {
        setTimeout(() => checkServerStatus(urlToCheck, retryCount + 1), delayMs);
      }
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(urlToCheck, {
        method: 'GET', cache: 'no-store', credentials: 'include',
        redirect: 'manual' as RequestRedirect,
        headers: {
          'Coder-Session-Token': coderToken || '',
          'Accept': 'text/html',
          'X-Drape-Check': 'true',
          ...(previewAccessTokenRef.current ? { 'X-Drape-Preview-Token': previewAccessTokenRef.current } : {}),
          ...(flyMachineIdRef.current ? { 'Fly-Force-Instance-Id': flyMachineIdRef.current } : {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // With redirect:'manual', 3xx means the server is redirecting (not serving preview content)
      if (response.status >= 300 && response.status < 400) {
        console.warn('[Preview:CHECK] Server returned redirect (not serving preview):', response.status);
        scheduleRetry(2000);
        return;
      }

      const agentStatus = response.headers.get('X-Drape-Agent-Status');
      const contentType = response.headers.get('Content-Type') || '';

      if (agentStatus === 'waiting') {
        startup.setStartingMessage(t('terminal:preview.installingDeps'));
        scheduleRetry(2000);
        return;
      }

      let bodyText = '';
      const shouldReadBody = contentType.includes('application/json')
        || contentType.includes('text/plain')
        || response.status >= 500;
      if (shouldReadBody) {
        try {
          bodyText = await response.text();
        } catch { /* ignore */ }
      }

      // Proxy-side errors are returned as JSON payloads.
      if (bodyText && bodyText.trim().startsWith('{')) {
        try {
          const jsonBody = JSON.parse(bodyText);
          if (jsonBody.error) {
            const proxyError = `${jsonBody.error}${jsonBody.message ? `: ${jsonBody.message}` : ''}`;
            if (isMissingPreviewTokenError(proxyError)) {
              resetToStartScreen();
              return;
            }
            if (proxyError.toLowerCase().includes('no active session')) {
              setSessionExpired(true);
              setSessionExpiredMessage(t('terminal:preview.sessionExpired'));
              if (currentWorkstation?.id) clearProjectPreviewSession(currentWorkstation.id);
            }
            startup.setStartingMessage(t('terminal:preview.startingDevServer'));
            if (serverStatusRef.current === 'running') {
              startup.setPreviewError({ message: proxyError, timestamp: new Date() });
              setServerStatus('stopped');
              startup.setIsStarting(false);
            } else {
              scheduleRetry(2000);
            }
            return;
          }
        } catch { /* ignore malformed JSON */ }
      }

      if (response.status >= 200 && response.status < 300) {
        // If status changed to 'stopped' while this fetch was in-flight
        // (e.g. WebView detected a BUILD_ERROR), don't override back to 'running'.
        if (serverStatusRef.current === 'stopped') {
          return;
        }
        console.log('[Preview:CHECK] Server OK! Setting running');
        const wasRunning = serverStatusRef.current === 'running';
        if (!wasRunning) {
          logOutput(`Server is running at ${urlToCheck}`, 'preview', 0);
        }
        setServerStatus('running');
        startup.clearLogs();
        startup.setIsStarting(false);
        // Only reset readiness on transition to running.
        // During periodic health checks while already running, keep current UI state.
        if (!wasRunning) {
          // Keep loading mask visible for web projects until the WebView reports
          // first meaningful content via WEBVIEW_READY/PAGE_INFO.
          if (!hasWebUI) {
            setWebViewReady(true);
          } else {
            setWebViewReady(false);
            setIsLoading(true);
          }
        }
        return;
      }

      if (response.status === 500) {
        // During normal running, don't force-stop on transient route-level 500.
        if (serverStatusRef.current === 'running') {
          return;
        }

        const startupError = extractStartupErrorFromBody(bodyText);
        if (startupError) {
          applyMissingEnvVarsFromMessage(startupError);
          startup.setPreviewError({ message: startupError, timestamp: new Date() });
          setServerStatus('stopped');
          startup.setIsStarting(false);
          return;
        }

        startup.setStartingMessage(t('terminal:preview.waitingForServer'));
        scheduleRetry(2000);
        return;
      }

      if (response.status === 403 || response.status === 404 || response.status === 503) {
        startup.setStartingMessage(
          response.status === 503
            ? t('terminal:preview.startingDevServer')
            : t('terminal:preview.configuringServer')
        );
        scheduleRetry(2000);
        return;
      }

      if (response.status === 401) {
        resetToStartScreen();
        return;
      }

      startup.setStartingMessage(t('terminal:preview.waitingForServer'));
      scheduleRetry(2000);
    } catch (error: any) {
      startup.setStartingMessage(error.name === 'AbortError' ? t('terminal:preview.connecting') : t('terminal:preview.retryingConnection'));
      scheduleRetry(3000);
    }
  };

  const handleStartServer = async () => {
    if (!currentWorkstation?.id) {
      logError('No workstation selected', 'preview');
      return;
    }
    clearPendingRelease(currentWorkstation.id);
    // Always reset readiness before a new start to avoid showing stale/black frame.
    setWebViewReady(false);
    setIsLoading(true);
    // Clear old terminal output, error detection, and persisted error state
    setTerminalOutput([]);
    logsSinceCursorRef.current = 0;
    errorDetectedRef.current = false;
    startup.setPreviewError(null);
    // Grace period: skip old cached logs burst from container (arrives in first ~2-3s)
    errorDetectionEnabledAtRef.current = Date.now() + 1200;
    ignoreLogsUntilRef.current = Date.now() + 1200;

    // Quick health check: if we already have a machineId and preview URL,
    // check if the server is already responding. Skip the full SSE flow if so.
    console.log('[Preview:START] handleStartServer called', {
      globalFlyMachineId, currentPreviewUrl, serverStatus: serverStatusRef.current,
      projectId: currentWorkstation?.id,
    });
    if (globalFlyMachineId && currentPreviewUrl) {
      console.log('[Preview:START] Quick health check starting...', { url: currentPreviewUrl, machineId: globalFlyMachineId });
      setServerStatus('checking');
      startup.setIsStarting(true);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(currentPreviewUrl, {
          method: 'GET', cache: 'no-store', credentials: 'include',
          redirect: 'manual' as RequestRedirect,
          headers: {
            'Fly-Force-Instance-Id': globalFlyMachineId,
            ...(previewAccessTokenRef.current ? { 'X-Drape-Preview-Token': previewAccessTokenRef.current } : {}),
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        console.log('[Preview:START] Quick health check response:', response.status, 'type:', response.type);
        // With redirect:'manual', 3xx responses come back as-is (not followed)
        if (response.status >= 300 && response.status < 400) {
          console.log('[Preview:START] Quick health check got redirect — server not serving preview content');
          // Fall through to SSE flow
        } else if (response.status >= 200 && response.status < 300) {
          console.log('[Preview:START] Quick health check PASSED — setting running');
          setServerStatus('running');
          startup.setIsStarting(false);
          if (!hasWebUI) {
            setWebViewReady(true);
          }
          return;
        }
        console.log('[Preview:START] Quick health check failed, falling through to SSE');
      } catch (e: any) {
        console.log('[Preview:START] Quick health check error:', e.message);
      }
    } else {
      console.log('[Preview:START] Skipping quick health check (no machineId or URL)', { globalFlyMachineId, currentPreviewUrl });
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
      { id: 'installing', label: t('terminal:preview.steps.installing'), status: 'pending' },
      { id: 'starting', label: t('terminal:preview.steps.starting'), status: 'pending' },
      { id: 'ready', label: t('terminal:preview.steps.ready'), status: 'pending' },
    ]);
    startup.setCurrentStepId('analyzing');
    startup.setStartingMessage(t('terminal:preview.analyzingProject'));
    startup.setTargetProgress(5);
    startup.setIsNextJsProject(false);

    logSystem(`Starting AI-powered preview for ${currentWorkstation?.name || 'project'}...`, 'preview');
    console.log('[Preview:SSE] Starting SSE flow...');

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
      if (authToken) setTerminalAuthToken(authToken);

      await new Promise<void>((resolve, reject) => {
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
                console.log('[Preview:SSE] Event received:', parsed.type, parsed.step, parsed.message?.substring(0, 80));

                if (parsed.type === 'warning') {
                  try {
                    const warningData = JSON.parse(parsed.step);
                    if (warningData.type === 'nextjs-version') {
                      startup.setIsNextJsProject(true);
                      startup.setTargetProgress(20);
                      logOutput(`⚠️ ${warningData.message}`, 'preview', 0);
                    }
                  } catch {}
                } else if (parsed.type === 'log') {
                  const rawText = typeof parsed.text === 'string'
                    ? parsed.text
                    : (typeof parsed.message === 'string' ? parsed.message : '');
                  if (!rawText) continue;
                  const lines = rawText
                    .replace(/\r/g, '\n')
                    .replace(/\u0000/g, '')
                    .split('\n')
                    .map((line: string) => line.trimEnd())
                    .filter((line: string) => line.trim().length > 0);
                  if (lines.length === 0) continue;

                  startup.recentLogsRef.current.push(...lines.map((line: string) => `[LOG] ${line}`));
                  if (startup.recentLogsRef.current.length > 200) {
                    startup.recentLogsRef.current = startup.recentLogsRef.current.slice(-200);
                  }

                  setTerminalOutput(prev => {
                    const newOutput = [...prev, ...lines];
                    return newOutput.length > 500 ? newOutput.slice(-500) : newOutput;
                  });
                  if (serverStatusRef.current !== 'running') {
                    startup.setDisplayedMessage(lines[lines.length - 1]);
                  }
                  setTimeout(() => terminalScrollRef.current?.scrollToEnd({ animated: true }), 40);
                } else if (parsed.type === 'step') {
                  startup.recentLogsRef.current.push(`[STEP] ${parsed.step}: ${parsed.message}`);
                  if (startup.recentLogsRef.current.length > 50) startup.recentLogsRef.current.shift();

                  const normalizedStep = normalizeStartupStep(parsed.step);
                  startup.setCurrentStepId(normalizedStep);
                  startup.setStartingMessage(parsed.message);
                  startup.setDisplayedMessage(parsed.message);

                  const stepProgressMap: Record<string, number> = {
                    'analyzing': 5,
                    'cloning': 10,
                    'detecting': 15,
                    'warning': 20,
                    'booting': 25,
                    'installing': 40,
                    'starting': 70,
                    'ready': 100,
                  };
                  startup.setTargetProgress(stepProgressMap[normalizedStep] || startup.targetProgress);

                  if (parsed.projectType?.toLowerCase().includes('next') ||
                    parsed.message?.toLowerCase().includes('next.js') ||
                    parsed.message?.toLowerCase().includes('turbopack')) {
                    startup.setIsNextJsProject(true);
                  }

                  startup.setStartupSteps(startup.startupSteps.map(step => {
                    if (step.id === normalizedStep) return { ...step, status: 'active' as const };
                    const stepOrder = ['analyzing', 'cloning', 'detecting', 'booting', 'installing', 'starting', 'ready'];
                    const currentIdx = stepOrder.indexOf(normalizedStep);
                    const stepIdx = stepOrder.indexOf(step.id);
                    if (stepIdx < currentIdx) return { ...step, status: 'complete' as const };
                    return step;
                  }));

                if (normalizedStep === 'ready') {
                  readyReceived = true;
                  const result = parsed;
                    console.log('[Preview:SSE] READY received!', {
                      previewUrl: result.previewUrl, machineId: result.machineId,
                      coderToken: !!result.coderToken, hasWebUI: result.hasWebUI,
                    });
                    // Backend already verified the server is responding — set 'running' immediately.
                    const completeSetup = () => {
                      console.log('[Preview:SSE] completeSetup() called — setting running');
                      setServerStatus('running');
                      startup.clearLogs();
                      startup.setIsStarting(false);
                      resolve();
                    };

                    // Save detected technology to workstation store
                    if (result.projectInfo?.type && currentWorkstation) {
                      const detectedTech = result.projectInfo.type;
                      if (detectedTech !== 'unknown' && detectedTech !== 'static' && detectedTech !== 'detecting') {
                        const { useWorkstationStore } = require('../../../core/terminal/workstationStore');
                        const wsStore = useWorkstationStore.getState();
                        const updated = { ...currentWorkstation, technology: detectedTech, language: detectedTech };
                        wsStore.setWorkstation(updated);
                        // Also persist to Firestore
                        import('firebase/firestore').then(({ doc, updateDoc }) => {
                          import('../../../config/firebase').then(({ db }) => {
                            if (currentWorkstation.projectId || currentWorkstation.id) {
                              const projId = currentWorkstation.projectId || currentWorkstation.id;
                              updateDoc(doc(db, 'user_projects', projId), { technology: detectedTech }).catch(() => {});
                            }
                          });
                        }).catch(() => {});
                      }
                    }

                    if (result.projectInfo) {
                      setProjectInfo({
                        type: result.projectInfo.type || 'unknown',
                        defaultPort: result.projectInfo.defaultPort || result.projectInfo.port || 3000,
                        startCommand: result.projectInfo.startCommand || '',
                        installCommand: result.projectInfo.installCommand || '',
                        description: result.projectInfo.description || '',
                        hasWebUI: typeof result.hasWebUI === 'boolean'
                          ? result.hasWebUI
                          : inferHasWebUI(result.projectInfo.type),
                      });
                    }

                    // Determine hasWebUI from backend response or infer from project type
                    const projectHasWebUI = typeof result.hasWebUI === 'boolean'
                      ? result.hasWebUI
                      : inferHasWebUI(result.projectInfo?.type);
                    setHasWebUI(projectHasWebUI);
                    if (!projectHasWebUI) setWebViewReady(true);

                    if (result.previewUrl) {
                      if (result.coderToken) setCoderToken(result.coderToken);
                      if (result.previewToken) {
                        updatePreviewAccessToken(result.previewToken, currentWorkstation?.id);
                      }

                      if (result.machineId) {
                        setGlobalFlyMachineId(result.machineId, currentWorkstation?.id);
                        flyMachineIdRef.current = result.machineId;
                        getAuthHeaders().then(authHeaders => fetch(`${apiUrl}/fly/session`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', ...authHeaders },
                          body: JSON.stringify({ projectId: currentWorkstation?.id, machineId: result.machineId }),
                          credentials: 'include',
                        })).then(res => res.json()).then((sessionData) => {
                          if (sessionData?.previewToken) {
                            updatePreviewAccessToken(sessionData.previewToken, currentWorkstation?.id);
                          }
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
                      // Console project (no web UI) — clear preview URL, keep machineId for exec
                      setCurrentPreviewUrlLocal('');
                      if (currentWorkstation?.id) {
                        setPreviewServerUrl('', currentWorkstation.id);
                      }
                      if (result.machineId) {
                        setGlobalFlyMachineId(result.machineId, currentWorkstation?.id);
                        flyMachineIdRef.current = result.machineId;
                      }
                      completeSetup();
                    }
                  }
                } else if (parsed.type === 'error') {
                  console.log('[Preview:SSE] ERROR received:', parsed.message);
                  errorReceived = true;
                  applyMissingEnvVarsFromMessage(parsed.message || '');
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
          console.log('[Preview:SSE] XHR onload', { status: xhr.status, readyReceived, errorReceived });
          if (pollInterval) clearInterval(pollInterval);
          processResponse();
          if (xhr.status < 200 || xhr.status >= 300) {
            console.log('[Preview:SSE] XHR bad status:', xhr.status);
            let message = `Server error: ${xhr.status}`;
            try {
              const payload = JSON.parse(xhr.responseText || '{}');
              if (typeof payload?.error === 'string' && payload.error.trim().length > 0) {
                message = payload.error;
              } else if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
                message = payload.message;
              }
            } catch {}
            if (xhr.status === 403 && !/access denied/i.test(message)) {
              message = 'Access denied: project ownership check failed. Refresh project list and retry.';
            }
            reject(new Error(message));
            return;
          }
          if (!readyReceived && !errorReceived && xhr.status === 200) {
            console.log('[Preview:SSE] No ready/error received, falling back to session check');
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
                if (sessionData.previewToken) {
                  updatePreviewAccessToken(sessionData.previewToken, currentWorkstation?.id);
                }
                const fallbackUrl = `${apiUrl}/preview/${currentWorkstation?.id}/`;
                setCurrentPreviewUrl(fallbackUrl);
                setServerStatus('running');
                startup.setIsStarting(false);
                resolve();
              } else {
                if (currentWorkstation?.id) {
                  clearProjectPreviewSession(currentWorkstation.id);
                }
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
      const message = error.message || t('terminal:preview.errorDuringStartup');
      if (isMissingPreviewTokenError(message)) {
        resetToStartScreen();
        return;
      }
      applyMissingEnvVarsFromMessage(message || '');
      logError(message || t('terminal:preview.errorDuringStartup'), 'preview');
      setServerStatus('stopped');
      startup.setIsStarting(false);
      startup.setPreviewError({ message: message || t('terminal:preview.errorStartingPreview'), timestamp: new Date() });
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
    setTerminalOutput([]);
    logsSinceCursorRef.current = 0;
    errorDetectedRef.current = false;
    // Grace period: skip old cached logs burst from container
    errorDetectionEnabledAtRef.current = Date.now() + 1200;
    ignoreLogsUntilRef.current = Date.now() + 1200;
    startup.setStartupSteps([
      { id: 'analyzing', label: t('terminal:preview.steps.analyzing'), status: 'pending' },
      { id: 'cloning', label: t('terminal:preview.steps.cloning'), status: 'pending' },
      { id: 'detecting', label: t('terminal:preview.steps.detecting'), status: 'pending' },
      { id: 'booting', label: t('terminal:preview.steps.booting'), status: 'pending' },
      { id: 'installing', label: t('terminal:preview.steps.installing'), status: 'pending' },
      { id: 'starting', label: t('terminal:preview.steps.starting'), status: 'pending' },
      { id: 'ready', label: t('terminal:preview.steps.ready'), status: 'pending' },
    ]);
    startup.setSmoothProgress(0);
    handleStartServer();
  };

  const sendErrorToChat = () => {
    if (!startup.previewError) return;
    // Build error message for the AI agent
    const errorLines = terminalOutput
      .filter(l => {
        const lower = l.toLowerCase();
        return lower.includes('error') || lower.includes('failed') || lower.includes('cannot') || lower.includes('×');
      })
      .slice(-10);
    const logSnippet = errorLines.length > 0
      ? errorLines.join('\n')
      : startup.previewError.message;

    const chatMessage = `Fix this preview error:\n\`\`\`\n${logSnippet}\n\`\`\``;
    // Clear error state before closing so it won't be restored on reopen
    startup.setPreviewError(null);
    setTerminalOutput([]);
    logsSinceCursorRef.current = 0;
    errorDetectedRef.current = false;
    // Grace period for when preview reopens: skip old cached logs burst
    errorDetectionEnabledAtRef.current = Date.now() + 1200;
    ignoreLogsUntilRef.current = Date.now() + 1200;
    const store = useUIStore.getState();
    store.setPendingChatMessage(chatMessage);
    store.setAutoRetryPreview(true);
    handleClose();
  };

  const handleStopPreview = () => {
    if (checkInterval.current) {
      clearInterval(checkInterval.current);
      checkInterval.current = null;
    }
    if (logsXhrRef.current) {
      logsXhrRef.current.abort();
      logsXhrRef.current = null;
    }

    if (currentWorkstation?.id) {
      const closingProjectId = currentWorkstation.id;

      clearPendingRelease(closingProjectId);
      pendingReleaseTimers.delete(closingProjectId);

      setServerStatus('stopped');
      setSessionExpired(false);
      setSessionExpiredMessage('');
      startup.setPreviewError(null);
      startup.setIsStarting(false);
      setTerminalOutput([]);
      logsSinceCursorRef.current = 0;
      errorDetectedRef.current = false;
      errorDetectionEnabledAtRef.current = 0;
      ignoreLogsUntilRef.current = 0;
      setWebViewReady(false);
      setIsLoading(true);
      setHasWebUI(true);

      setGlobalFlyMachineId(null, closingProjectId);
      flyMachineIdRef.current = null;
      updatePreviewAccessToken(null, closingProjectId);
      setPreviewServerStatus('stopped');
      setPreviewServerUrl(null, closingProjectId);
      clearProjectPreviewSession(closingProjectId);
      serverLogService.disconnect();

      void (async () => {
        try {
          const releaseAuthHeaders = await getAuthHeaders();
          await fetch(`${apiUrl}/fly/release`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...releaseAuthHeaders },
            body: JSON.stringify({ projectId: closingProjectId }),
          });
        } catch {}
      })();
    }
  };

  const handleClose = () => {
    handleStopPreview();
    // Keep panel opacity at 1 when closed because VSCodeSidebar now keeps
    // PreviewPanel mounted (hidden off-screen). Fading to 0 would persist
    // and make reopen look like "stuck on chat".
    fadeAnim.stopAnimation(() => {
      fadeAnim.setValue(1);
      onClose();
    });
  };

  const handleRefresh = () => {
    pendingChangesRef.current = 0;
    setShowReloadBanner(false);
    useAgentStore.getState().clearFileTracking();
    webViewRef.current?.clearCache(true);
    const baseUrl = currentPreviewUrl.split('?')[0];
    setCurrentPreviewUrl(`${baseUrl}?_t=${Date.now()}`);
    webViewRef.current?.reload();
    checkServerStatus();
  };

  const handleBannerReload = () => {
    pendingChangesRef.current = 0;
    setShowReloadBanner(false);
    useAgentStore.getState().clearFileTracking();
    handleRefresh();
  };

  const handleSaveEnvVars = async () => {
    if (!currentWorkstation?.id) return;
    setIsSavingEnv(true);
    logSystem(t('terminal:preview.savingEnvVars'), 'preview');
    try {
      const envAuthHeaders = await getAuthHeaders();
      const variables = Object.entries(envVarValues)
        .filter(([key]) => key.trim().length > 0)
        .map(([key, value]) => ({ key, value, isSecret: false }));

      const response = await fetch(`${apiUrl}/fly/project/${currentWorkstation.id}/env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...envAuthHeaders },
        body: JSON.stringify({ variables }),
      });
      if (!response.ok) throw new Error(t('terminal:preview.saveError'));
      logOutput(t('terminal:preview.varsSavedIn', { file: '.env' }), 'preview', 0);
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

  // Hot reload: connect to file watcher — defer reload when agent is active
  useEffect(() => {
    const workstationId = currentWorkstation?.id;
    const username = currentWorkstation?.githubAccountUsername?.toLowerCase() || 'default';
    if (serverStatus === 'running' && workstationId && username) {
      fileWatcherService.connect(workstationId, username, (change) => {
        logOutput(`[Hot Reload] ${change.file} changed`, 'preview', 0);
        pendingChangesRef.current += 1;

        if (agentIsRunningRef.current) {
          // Agent is active — accumulate changes, banner will appear when it finishes
          return;
        }
        // No agent: debounce 1s then show banner
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          if (pendingChangesRef.current > 0) {
            setShowReloadBanner(true);
          }
        }, 1000);
      });
    }
  }, [serverStatus, currentWorkstation?.id]);

  // Show reload banner when agent finishes and there are pending changes
  useEffect(() => {
    const wasRunning = agentIsRunningRef.current;
    agentIsRunningRef.current = agentIsRunning;
    if (wasRunning && !agentIsRunning) {
      // Check both file watcher events AND agentStore file tracking
      const agentTouchedFiles = agentFilesCreated.length + agentFilesModified.length;
      if (pendingChangesRef.current > 0 || agentTouchedFiles > 0) {
        setShowReloadBanner(true);
      }
    }
  }, [agentIsRunning, agentFilesCreated.length, agentFilesModified.length]);

  // Periodic health checks when running
  useEffect(() => {
    if (!isVisible) return;
    if (serverStatus !== 'running') return;
    if (currentPreviewUrl.includes('localhost:3001')) return;
    checkInterval.current = setInterval(checkServerStatus, 5000);
    return () => { if (checkInterval.current) clearInterval(checkInterval.current); };
  }, [currentPreviewUrl, serverStatus, isVisible]);

  // Set default project info
  useEffect(() => {
    if (!projectInfo) {
      setProjectInfo({ type: 'detecting', defaultPort: 3000, startCommand: '', installCommand: '', description: 'Click Play to detect and start' });
    }
  }, [currentWorkstation]);

  // Fallback: force WebView ready after timeout only when loading finished.
  useEffect(() => {
    let isMounted = true;

    if (serverStatus === 'running' && !webViewReady && !isLoading) {
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
  }, [serverStatus, webViewReady, isLoading]);

  // Auto-recovery: request machineId if missing
  useEffect(() => {
    let isMounted = true;

    const shouldRecover =
      (serverStatus === 'running' || serverStatus === 'stopped')
      && currentWorkstation?.id
      && (!globalFlyMachineId || !previewAccessTokenRef.current);
    if (shouldRecover) {
      getAuthHeaders().then(recoverAuthHeaders => fetch(`${apiUrl}/fly/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...recoverAuthHeaders },
        body: JSON.stringify({ projectId: currentWorkstation.id }),
        credentials: 'include',
      })).then(res => res.json()).then(data => {
        if (!isMounted) return;
        if (data.machineId) {
          setGlobalFlyMachineId(data.machineId, currentWorkstation.id);
          if (data.previewToken) {
            updatePreviewAccessToken(data.previewToken, currentWorkstation.id);
          }
        } else {
          clearProjectPreviewSession(currentWorkstation.id);
        }
      }).catch((err) => {
        if (isMounted) {
          console.warn('[Preview] Failed to recover machine ID:', err?.message || err);
        }
      });
    }

    return () => { isMounted = false; };
  }, [serverStatus, globalFlyMachineId, currentWorkstation?.id, apiUrl, previewAccessToken]);

  // Live logs SSE streaming
  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isMounted = true;

    if (!isVisible) return;

    const connectToLogs = async () => {
      if (!isMounted) return;
      // Console projects get output via SSE exec, not agent /logs stream
      if (!hasWebUIRef.current) return;
      if ((serverStatus !== 'running' && !startup.isStarting && serverStatus !== 'checking') || !currentWorkstation?.id) return;
      if (logsXhrRef.current) { logsXhrRef.current.abort(); logsXhrRef.current = null; }

      const logsSince = logsSinceCursorRef.current > 0
        ? Math.max(0, logsSinceCursorRef.current)
        : 0;
      const tokenQuery = previewAccessTokenRef.current ? `&previewToken=${encodeURIComponent(previewAccessTokenRef.current)}` : '';
      const logsUrl = `${apiUrl}/fly/logs/${currentWorkstation.id}?since=${logsSince}${tokenQuery}`;
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
          const rawLine = dataBuffer.substring(0, lineEndIndex).replace(/\r/g, '');
          const line = rawLine.trim();
          dataBuffer = dataBuffer.substring(lineEndIndex + 1);
          if (line.startsWith('data: ')) {
            try {
              const dataStr = line.substring(6);
              if (dataStr === '[DONE]') continue;
              const data = JSON.parse(dataStr);
              if (data.type === 'connected') continue;
              if (data.type === 'error') {
                if (typeof data.message === 'string' && isMissingPreviewTokenError(data.message)) {
                  resetToStartScreen();
                  continue;
                }
                if (typeof data.message === 'string' && data.message.toLowerCase().includes('no active session')) {
                  clearProjectPreviewSession(currentWorkstation.id);
                  setSessionExpired(true);
                  setSessionExpiredMessage(t('terminal:preview.sessionExpired'));
                  setServerStatus('stopped');
                  startup.setIsStarting(false);
                }
                continue;
              }
              if (data.type === 'session_expired') {
                setSessionExpired(true);
                setSessionExpiredMessage(data.message || t('terminal:preview.sessionExpired'));
                setServerStatus('stopped');
                startup.setIsStarting(false);
                if (checkInterval.current) { clearInterval(checkInterval.current); checkInterval.current = null; }
                continue;
              }
              if (data.text) {
                if (typeof data.id === 'number' && Number.isFinite(data.id) && data.id > 0) {
                  logsSinceCursorRef.current = Math.max(logsSinceCursorRef.current, Math.floor(data.id));
                }
                if (serverStatus !== 'running') startup.setDisplayedMessage(data.text);
                setTerminalOutput(prev => {
                  const newOutput = [...prev, data.text];
                  return newOutput.length > 500 ? newOutput.slice(-500) : newOutput;
                });
                setTimeout(() => terminalScrollRef.current?.scrollToEnd({ animated: true }), 50);
              }
            } catch {}
          } else if (
            line.length > 0 &&
            !line.startsWith(':') &&
            !line.startsWith('event:') &&
            !line.startsWith('id:') &&
            !line.startsWith('retry:')
          ) {
            if (serverStatus !== 'running') startup.setDisplayedMessage(line);
            setTerminalOutput(prev => {
              const newOutput = [...prev, line];
              return newOutput.length > 500 ? newOutput.slice(-500) : newOutput;
            });
            setTimeout(() => terminalScrollRef.current?.scrollToEnd({ animated: true }), 50);
          }
        }
      };

      xhr.onerror = () => { if (isMounted) reconnectTimeout = setTimeout(connectToLogs, 3000); };
      xhr.onload = () => {
        if (xhr.status === 401 || xhr.status === 403) {
          let message = xhr.status === 401
            ? t('terminal:preview.sessionExpired')
            : 'Access denied: project ownership check failed';
          try {
            const payload = JSON.parse(xhr.responseText || '{}');
            if (typeof payload?.error === 'string' && payload.error.trim().length > 0) {
              message = payload.error;
            }
          } catch {}
          if (currentWorkstation?.id) {
            clearProjectPreviewSession(currentWorkstation.id);
          }
          if (isMissingPreviewTokenError(message)) {
            resetToStartScreen();
            return;
          }
          setSessionExpired(true);
          setSessionExpiredMessage(message);
          setServerStatus('stopped');
          startup.setIsStarting(false);
          startup.setPreviewError({ message, timestamp: new Date() });
          return;
        }
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
  }, [serverStatus, startup.isStarting, currentWorkstation?.id, apiUrl, previewAccessToken, isVisible]);

  // Grace period: skip old cached logs from container for N seconds after startup
  const ignoreLogsUntilRef = useRef(0);

  // Detect critical errors in terminal output and immediately show error screen
  const errorDetectedRef = useRef(false);
  // Grace period: skip error detection for first N seconds after startup to ignore old cached logs
  const errorDetectionEnabledAtRef = useRef(0);
  useEffect(() => {
    // Only detect during startup, not when already running or already errored
    if (serverStatus !== 'checking' || startup.previewError || errorDetectedRef.current) return;
    // Skip if still within grace period (old cached logs from container)
    if (Date.now() < errorDetectionEnabledAtRef.current) return;

    const recentLines = terminalOutput.slice(-30);
    const errorLines = recentLines.filter(line => {
      const lower = line.toLowerCase();
      return (lower.includes('error:') || lower.includes('× error') || lower.includes('failed to compile'))
        && !lower.includes('[error]'); // skip our own log prefix
    });

    // If we see 2+ distinct error lines, immediately trigger error screen
    if (errorLines.length >= 2) {
      errorDetectedRef.current = true;
      const errorSummary = errorLines.slice(0, 3).join('\n');
      startup.setPreviewError({ message: errorSummary, timestamp: new Date() });
      setServerStatus('stopped');
      startup.setIsStarting(false);
    }
  }, [terminalOutput, serverStatus, startup.previewError]);

  // Reset error detection on retry
  useEffect(() => {
    if (!startup.previewError) {
      errorDetectedRef.current = false;
    }
  }, [startup.previewError]);

  // Reset/restore state when project changes
  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    const currentId = currentWorkstation?.id;
    if (prevWorkstationId.current && prevWorkstationId.current !== currentId) {
      logsSinceCursorRef.current = 0;
      clearPendingRelease(currentId);
      serverLogService.disconnect();

      const restoredMachineId = currentId ? projectMachineIds[currentId] : null;
      const restoredUrl = currentId ? projectPreviewUrls[currentId] : null;
      const restoredToken = currentId ? projectPreviewTokens[currentId] : null;
      setPreviewAccessTokenLocal(restoredToken || null);
      previewAccessTokenRef.current = restoredToken || null;

      if (restoredMachineId) {
        setServerStatus('checking');
        setGlobalFlyMachineId(restoredMachineId, currentId);
        serverLogService.connect(currentId, apiUrl);
        getAuthHeaders().then(switchAuthHeaders => fetch(`${apiUrl}/fly/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...switchAuthHeaders },
          body: JSON.stringify({ projectId: currentId }),
          credentials: 'include',
        })).then(res => res.json()).then((sessionData) => {
          if (!isMounted) return;
          if (!sessionData?.machineId) {
            clearProjectPreviewSession(currentId);
            setServerStatus('stopped');
            setPreviewServerUrl(null);
            setGlobalFlyMachineId(null);
            setWebViewReady(false);
            return;
          }
          if (sessionData.machineId !== restoredMachineId) {
            setGlobalFlyMachineId(sessionData.machineId, currentId);
            flyMachineIdRef.current = sessionData.machineId;
          }
          if (sessionData.previewToken) {
            updatePreviewAccessToken(sessionData.previewToken, currentId);
          }
          timeoutId = setTimeout(() => {
            if (isMounted) {
              const nextUrl = restoredUrl || `${apiUrl}/preview/${currentId}/`;
              setCurrentPreviewUrl(nextUrl);
              checkServerStatus(nextUrl);
            }
          }, 1000);
        }).catch(() => {
          if (!isMounted) return;
          const nextUrl = restoredUrl || `${apiUrl}/preview/${currentId}/`;
          setCurrentPreviewUrl(nextUrl);
          checkServerStatus(nextUrl);
        });
      } else {
        setServerStatus('stopped');
        setPreviewServerUrl(null);
        setPreviewAccessToken(null, currentId);
        setPreviewAccessTokenLocal(null);
        previewAccessTokenRef.current = null;
        setGlobalFlyMachineId(null);
        if (currentId) clearProjectPreviewSession(currentId);
        setProjectInfo(null);
        setCoderToken(null);
        startup.setIsStarting(false);
        setWebViewReady(false);
        setCurrentPreviewUrlLocal(''); // Clear stale URL from previous project
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

  // Opening animation + session cookie restore + verify persisted session
  useEffect(() => {
    let isMounted = true;

    Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    clearPendingRelease(currentWorkstation?.id);
    if (globalFlyMachineId && apiUrl) {
      flyMachineIdRef.current = globalFlyMachineId;
      getAuthHeaders().then(initAuthHeaders => fetch(`${apiUrl}/fly/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...initAuthHeaders },
        body: JSON.stringify({ projectId: currentWorkstation?.id, machineId: globalFlyMachineId }),
        credentials: 'include',
      })).then(res => res.json()).then((sessionData) => {
        if (sessionData?.previewToken) {
          updatePreviewAccessToken(sessionData.previewToken, currentWorkstation?.id);
        }
        // If we started as 'checking' (persisted machineId), verify the server is actually up
        if (isMounted && serverStatusRef.current === 'checking' && currentPreviewUrl) {
          setTimeout(() => {
            if (isMounted) checkServerStatus();
          }, 1000);
        }
      }).catch((err) => {
        if (isMounted) {
          console.warn('[Preview] Failed to restore session cookie:', err?.message || err);
          // Still try to check — session might already exist
          if (serverStatusRef.current === 'checking' && currentPreviewUrl) {
            checkServerStatus();
          }
        }
      });
    } else if (serverStatusRef.current === 'checking') {
      // No machineId but status is checking — shouldn't happen, reset to stopped
      if (currentWorkstation?.id) clearProjectPreviewSession(currentWorkstation.id);
      setServerStatus('stopped');
    }

    return () => { isMounted = false; };
  }, []);


  // Fix corrupted or wrong-project URL: ensure it points to the current projectId
  useEffect(() => {
    if (!currentPreviewUrl || !projectId) return;
    try {
      const parsed = new URL(currentPreviewUrl);
      const match = parsed.pathname.match(/^\/preview\/([^/]+)/);
      if (!match) {
        // No /preview/ path at all — reconstruct
        setCurrentPreviewUrl(`${parsed.origin}/preview/${projectId}/`);
      } else if (match[1] !== projectId) {
        // URL has a different project's ID — fix it
        setCurrentPreviewUrl(`${parsed.origin}/preview/${projectId}/`);
      }
    } catch {}
  }, [currentPreviewUrl, projectId]);

  // Ensure preview URL always carries the active preview token
  useEffect(() => {
    if (!currentPreviewUrl) return;
    const secured = withPreviewToken(currentPreviewUrl, previewAccessToken);
    if (secured !== currentPreviewUrl) {
      setCurrentPreviewUrlLocal(secured);
      setPreviewServerUrl(secured, currentWorkstation?.id);
    }
  }, [previewAccessToken]);

  // Update URL when prop changes
  useEffect(() => {
    if (previewUrl && previewUrl !== currentPreviewUrl && !globalServerUrl) {
      setCurrentPreviewUrl(previewUrl);
    }
  }, [previewUrl]);

  // Keep toolbar hidden during the initial loading mask to avoid the black strip.
  // If WEBVIEW_READY doesn't arrive, reveal it when loading settles.
  const shouldRenderToolbar = serverStatus === 'running'
    && (!hasWebUI || webViewReady || !isLoading);

  // ---- Render ----
  return (
    <>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

      <Reanimated.View style={[styles.container, containerAnimatedStyle]}>
        <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
          <LinearGradient colors={['#0a0a0a', '#000000']} style={StyleSheet.absoluteFill} />

          <View style={{ flex: 1 }}>
            {shouldRenderToolbar && (
              <Animated.View>
                {!hasWebUI ? (
                  /* Console projects: minimal header with just the close button */
                  <View style={{ paddingTop: insets.top, backgroundColor: '#0d1117' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 12 }}>
                      <TouchableOpacity onPress={handleStopPreview} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Ionicons name="close" size={22} color="#9ca3af" />
                      </TouchableOpacity>
                      <Text style={{ flex: 1, textAlign: 'center', color: '#6b7280', fontSize: 13, fontFamily: 'SF Mono' }}>Terminal</Text>
                      <View style={{ width: 22 }} />
                    </View>
                  </View>
                ) : (
                  <PreviewToolbar
                    currentPreviewUrl={currentPreviewUrl}
                    onClose={handleStopPreview}
                    onRefresh={handleRefresh}
                    onPublish={publish.openPublishModal}
                    onUrlChange={setCurrentPreviewUrl}
                    existingPublish={publish.existingPublish}
                    topInset={insets.top}
                    viewportMode={viewportMode}
                    onViewportChange={setViewportMode}
                  />
                )}
              </Animated.View>
            )}

            <View style={styles.webViewContainer}>
              {/* Reload banner — shown when file changes detected */}
              {showReloadBanner && serverStatus === 'running' && (
                <TouchableOpacity
                  style={styles.reloadBanner}
                  onPress={handleBannerReload}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh" size={14} color="#fff" />
                  <Text style={styles.reloadBannerText}>Modifiche rilevate — Ricarica</Text>
                </TouchableOpacity>
              )}
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
                  terminalOutput={terminalOutput}
                  onClose={handleClose}
                  onRetryPreview={handleRetryPreview}
                  onSendErrorReport={sendErrorToChat}
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
              ) : serverStatus === 'checking' ? (
                /* During 'checking', show ONLY loading screen — no WebView.
                   checkServerStatus is polling; WebView would just cause
                   conflicting error detection. WebView mounts only after
                   checkServerStatus confirms the server is truly responsive. */
                <PreviewLoadingScreen
                  previewError={startup.previewError}
                  previewLogs={startup.previewLogs}
                  terminalOutput={terminalOutput}
                  displayedMessage={startup.displayedMessage}
                  startingMessage={startup.startingMessage}
                  smoothProgress={startup.smoothProgress}
                  elapsedSeconds={startup.elapsedSeconds}
                  pulseAnim={startup.pulseAnim}
                  onClose={handleClose}
                  onRetryPreview={handleRetryPreview}
                  onSendErrorReport={sendErrorToChat}
                  topInset={insets.top}
                  t={t}
                />
              ) : (
                <PreviewWebView
                  webViewRef={webViewRef}
                  currentPreviewUrl={currentPreviewUrl}
                  coderToken={coderToken}
                  globalFlyMachineId={globalFlyMachineId}
                  previewAccessToken={previewAccessToken}
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
                  onSendErrorReport={sendErrorToChat}
                  topInset={insets.top}
                  viewportMode={viewportMode}
                  projectId={projectId || ''}
                  wsUrl={wsUrl}
                  authToken={terminalAuthToken}
                  startCommand={projectInfo?.startCommand}
                  t={t}
                />
              )}
            </View>
          </View>

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
              onStopAgent={() => { chat.stopAgent(); }}
              onToggleInspectMode={chat.toggleInspectMode}
              onClearSelectedElement={chat.clearSelectedElement}
              onSelectParentElement={chat.selectParentElement}
              onLoadPastChat={chat.loadPastChat}
              onStartNewChat={chat.startNewChat}
              contextUsagePercent={chat.contextUsagePercent}
              selectedModel={chat.selectedModel}
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
  reloadBanner: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(99, 102, 241, 0.95)',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  reloadBannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
