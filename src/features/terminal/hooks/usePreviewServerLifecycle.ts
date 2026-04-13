/**
 * usePreviewServerLifecycle — thin orchestrator.
 *
 * Composes focused hooks and wires them together.
 * Exposes the same external API that PreviewPanel.tsx expects.
 */
import { useState, useEffect, useRef } from 'react';
import { Animated, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import { ProjectInfo } from '../../../core/preview/projectDetector';
import { useUIStore } from '../../../core/terminal/uiStore';
import { logOutput, logSystem } from '../../../core/terminal/terminalLogger';
import { serverLogService } from '../../../core/services/serverLogService';
import { getAuthHeaders } from '../../../core/api/getAuthToken';
import { ViewportMode } from '../components/PreviewToolbar';

import { usePreviewStartup } from './usePreviewStartup';
import type { PreviewAutoFixReturn } from '../../../hooks/preview/usePreviewAutoFix';

import { usePreviewSession } from '../preview/hooks/usePreviewSession';
import { usePreviewPreflight } from '../preview/hooks/usePreviewPreflight';
import { usePreviewHealth } from '../preview/hooks/usePreviewHealth';
import { usePreviewStartupFlow } from '../preview/hooks/usePreviewStartupFlow';
import { usePreviewRecovery } from '../preview/hooks/usePreviewRecovery';
import { usePreviewNavigation } from '../preview/hooks/usePreviewNavigation';

type ServerStatus = 'checking' | 'running' | 'stopped';

interface UsePreviewServerLifecycleParams {
  projectId: string | undefined;
  previewUrl: string;
  onClose: () => void;
  apiUrl: string;
  wsUrl: string;
  insets: { top: number; bottom: number };
  t: (key: string, opts?: any) => string;
  currentWorkstation: any;
  globalServerUrl: string | null;
  setPreviewServerStatus: (status: string) => void;
  setPreviewServerUrl: (url: string | null, projectId?: string) => void;
  setPreviewCurrentUrl: (url: string) => void;
  setPreviewViewportMode: (mode: string) => void;
  setPreviewHandlers: (handlers: any) => void;
  globalFlyMachineId: string | null;
  setGlobalFlyMachineId: (id: string | null, projectId?: string) => void;
  setPreviewAccessToken: (token: string | null, projectId?: string) => void;
  clearProjectPreviewSession: (projectId: string) => void;
  projectMachineIds: Record<string, string>;
  projectPreviewUrls: Record<string, string>;
  projectPreviewTokens: Record<string, string>;
  autoFix: PreviewAutoFixReturn;
  isVisible: boolean;
  fadeAnim: Animated.Value;
  webViewRef: React.RefObject<WebView>;
  webViewContainerRef: React.RefObject<any>;
  jsErrorsRef: React.MutableRefObject<string[]>;
  terminalScrollRef: React.RefObject<ScrollView>;
  publishOpenPublishModal: () => void;
  currentWorkstationName: string | undefined;
}

export function usePreviewServerLifecycle({
  projectId,
  previewUrl,
  onClose,
  apiUrl,
  wsUrl,
  insets,
  t,
  currentWorkstation,
  globalServerUrl,
  setPreviewServerStatus,
  setPreviewServerUrl,
  setPreviewCurrentUrl,
  setPreviewViewportMode,
  setPreviewHandlers,
  globalFlyMachineId,
  setGlobalFlyMachineId,
  setPreviewAccessToken,
  clearProjectPreviewSession,
  projectMachineIds,
  projectPreviewUrls,
  projectPreviewTokens,
  autoFix,
  isVisible,
  fadeAnim,
  webViewRef,
  webViewContainerRef,
  jsErrorsRef,
  terminalScrollRef,
  publishOpenPublishModal,
  currentWorkstationName,
}: UsePreviewServerLifecycleParams) {

  // ── Core server state ────────────────────────────────────────

  const [isLoading, setIsLoading] = useState(true);
  const globalStatusBelongsToProject = projectId && projectMachineIds[projectId];
  const initialServerStatus: ServerStatus = globalStatusBelongsToProject ? 'checking' : 'stopped';
  const [serverStatus, setServerStatusLocal] = useState<ServerStatus>(initialServerStatus);
  const serverStatusRef = useRef<ServerStatus>(initialServerStatus);
  const [webViewReady, setWebViewReady] = useState(false);
  const [hasWebUI, setHasWebUIState] = useState(true);
  const hasWebUIRef = useRef(true);
  const setHasWebUI = (val: boolean) => { hasWebUIRef.current = val; setHasWebUIState(val); };
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [coderToken, setCoderToken] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [terminalAuthToken, setTerminalAuthToken] = useState<string | null>(null);

  // Shared refs
  const prevWorkstationId = useRef<string | null>(null);
  const logsSinceCursorRef = useRef<number>(0);
  const errorDetectedRef = useRef(false);
  const errorDetectionEnabledAtRef = useRef(0);
  const ignoreLogsUntilRef = useRef(0);

  // Health check interval ref (shared between health & recovery)
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const setServerStatus = (status: ServerStatus) => {
    if (serverStatusRef.current === status) return;
    setServerStatusLocal(status);
    setPreviewServerStatus(status);
    serverStatusRef.current = status;
    if (status === 'stopped' && checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
  };

  // ── 1. Session ───────────────────────────────────────────────

  const session = usePreviewSession({
    projectId,
    previewUrl,
    globalServerUrl,
    globalFlyMachineId,
    projectMachineIds,
    projectPreviewUrls,
    projectPreviewTokens,
    setPreviewServerUrl,
    setPreviewAccessToken,
    setGlobalFlyMachineId,
    clearProjectPreviewSession,
    currentWorkstationId: currentWorkstation?.id,
  });

  // ── 2. Startup hook ──────────────────────────────────────────

  const startup = usePreviewStartup({
    projectId,
    previewAccessToken: session.effectivePreviewAccessToken,
    serverStatus,
    webViewReady,
    currentWorkstationName,
  });

  // ── Reset helper (used by health, recovery) ──────────────────

  const resetToStartScreen = () => {
    if (currentWorkstation?.id) clearProjectPreviewSession(currentWorkstation.id);
    setServerStatus('stopped');
    setWebViewReady(false);
    setIsLoading(true);
    startup.setPreviewError(null);
    startup.setIsStarting(false);
  };

  // ── 3. Preflight ─────────────────────────────────────────────

  const preflight = usePreviewPreflight({
    apiUrl,
    currentWorkstationId: currentWorkstation?.id,
    onClose,
    t,
    clearStartTransition: () => {
      startup.setIsStartTransitioning(false);
      startup.startTransitionAnim.setValue(0);
    },
  });

  // ── 4. Health ────────────────────────────────────────────────

  const health = usePreviewHealth({
    currentPreviewUrl: session.currentPreviewUrl,
    coderToken,
    previewAccessTokenRef: session.previewAccessTokenRef,
    flyMachineIdRef: session.flyMachineIdRef,
    hasWebUIRef,
    serverStatusRef,
    isVisible,
    t,
    currentWorkstationId: currentWorkstation?.id,
    clearProjectPreviewSession,
    setServerStatus,
    setWebViewReady,
    setIsLoading,
    hasWebUI,
    startupSetStartingMessage: startup.setStartingMessage,
    startupSetPreviewError: startup.setPreviewError,
    startupSetIsStarting: startup.setIsStarting,
    startupClearLogs: startup.clearLogs,
    preflight: {
      applyMissingEnvVarsFromMessage: preflight.applyMissingEnvVarsFromMessage,
      extractStartupErrorFromBody: preflight.extractStartupErrorFromBody,
    },
    resetToStartScreen,
  });

  // ── 5. Startup flow ──────────────────────────────────────────

  const startupFlow = usePreviewStartupFlow({
    apiUrl,
    t,
    currentWorkstation,
    terminalScrollRef,
    session,
    preflight,
    setServerStatus,
    serverStatusRef,
    setWebViewReady,
    setIsLoading,
    hasWebUI,
    setHasWebUI,
    hasWebUIRef,
    setProjectInfo,
    setCoderToken,
    setTerminalOutput,
    setTerminalAuthToken,
    setSessionExpired: (val: boolean) => recovery.setSessionExpired(val),
    setSessionExpiredMessage: (msg: string) => recovery.setSessionExpiredMessage(msg),
    errorDetectedRef,
    errorDetectionEnabledAtRef,
    ignoreLogsUntilRef,
    logsSinceCursorRef,
    startup,
    checkServerStatus: health.checkServerStatus,
    resetToStartScreen,
  });

  // ── 6. Recovery ──────────────────────────────────────────────

  const recovery = usePreviewRecovery({
    apiUrl,
    t,
    currentWorkstation,
    webViewRef,
    terminalScrollRef,
    session,
    autoFix,
    isVisible,
    fadeAnim,
    onClose,
    serverStatusRef,
    setServerStatus,
    setWebViewReady,
    setIsLoading,
    setHasWebUI,
    hasWebUIRef,
    clearProjectPreviewSession,
    setPreviewServerStatus,
    setPreviewServerUrl,
    setGlobalFlyMachineId,
    jsErrorsRef,
    checkInterval: health.checkInterval,
    errorDetectedRef,
    errorDetectionEnabledAtRef,
    ignoreLogsUntilRef,
    logsSinceCursorRef,
    startup,
    handleStartServer: startupFlow.handleStartServer,
    terminalOutput: startupFlow.terminalOutput,
    setTerminalOutput: startupFlow.setTerminalOutput,
    resetToStartScreen,
  });

  // ── 7. Navigation ────────────────────────────────────────────

  const navigation = usePreviewNavigation({
    currentWorkstation,
    webViewRef,
    session,
    serverStatus,
    setPreviewCurrentUrl,
    setPreviewViewportMode,
    setPreviewHandlers,
    publishOpenPublishModal,
    checkServerStatus: health.checkServerStatus,
  });

  // ── Save env vars (bridges preflight + startup) ──────────────

  const handleSaveEnvVars = async () => {
    await preflight.handleSaveEnvVars(startupFlow.handleStartServer);
  };

  // ── Effects — project switch / init / URL fixups ─────────────

  // Set default project info
  useEffect(() => {
    if (!projectInfo) {
      const knownTech = currentWorkstation?.technology || currentWorkstation?.language || 'detecting';
      setProjectInfo({ type: knownTech, defaultPort: 3000, startCommand: '', installCommand: '', description: 'Click Play to detect and start' });
    }
  }, [currentWorkstation]);

  // Fallback: force WebView ready after timeout
  useEffect(() => {
    let isMounted = true;
    if (serverStatus === 'running' && !webViewReady && !isLoading) {
      const timer = setTimeout(() => { if (isMounted) setWebViewReady(true); }, 10000);
      return () => { isMounted = false; clearTimeout(timer); };
    }
    return () => { isMounted = false; };
  }, [serverStatus, webViewReady, isLoading]);

  // Auto-fix preflight: mark verified when WebView loads
  useEffect(() => {
    if (!webViewReady || recovery.preflightDoneRef.current) return;
    recovery.preflightDoneRef.current = true;
    autoFix.reportCheckResult({ rootChildren: 1, jsErrors: [], screenshotBase64: null });
  }, [webViewReady]);

  // Re-run preflight when preview becomes visible
  const prevVisibleRef = useRef(isVisible);
  useEffect(() => {
    const wasHidden = !prevVisibleRef.current;
    prevVisibleRef.current = isVisible;
    if (!isVisible || !wasHidden) return;
    if (useUIStore.getState().skipNextPreflight) {
      if (serverStatus === 'stopped') startupFlow.handleStartWithTransition();
      return;
    }
    if (preflight.skipEnvErrorRedirectRef.current) return;
    if (serverStatus !== 'running') return;
    preflight.preflightEnvCheck().then((ok) => {
      if (!ok) { setServerStatus('stopped'); onClose(); }
    }).catch(() => {});
  }, [isVisible]);

  // Reset/restore state when project changes
  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;
    const currentId = currentWorkstation?.id;

    if (prevWorkstationId.current && prevWorkstationId.current !== currentId) {
      logsSinceCursorRef.current = 0;
      session.clearPendingRelease(currentId);
      serverLogService.disconnect();

      const restoredMachineId = currentId ? projectMachineIds[currentId] : null;
      const restoredUrl = currentId ? projectPreviewUrls[currentId] : null;
      const restoredToken = currentId ? projectPreviewTokens[currentId] : null;
      session.previewAccessTokenRef.current = restoredToken || null;

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
            session.flyMachineIdRef.current = sessionData.machineId;
          }
          if (sessionData.previewToken) session.updatePreviewAccessToken(sessionData.previewToken, currentId);
          timeoutId = setTimeout(() => {
            if (isMounted) {
              const nextUrl = restoredUrl || `${apiUrl}/preview/${currentId}/`;
              session.setCurrentPreviewUrl(nextUrl);
              health.checkServerStatus(nextUrl);
            }
          }, 1000);
        }).catch(() => {
          if (!isMounted) return;
          const nextUrl = restoredUrl || `${apiUrl}/preview/${currentId}/`;
          session.setCurrentPreviewUrl(nextUrl);
          health.checkServerStatus(nextUrl);
        });
      } else {
        setServerStatus('stopped');
        setPreviewServerUrl(null);
        setPreviewAccessToken(null, currentId);
        session.previewAccessTokenRef.current = null;
        setGlobalFlyMachineId(null);
        if (currentId) clearProjectPreviewSession(currentId);
        setProjectInfo(null);
        setCoderToken(null);
        startup.setIsStarting(false);
        setWebViewReady(false);
        session.setCurrentPreviewUrlLocal('');
        serverLogService.disconnect();
      }
      if (health.checkInterval.current) { clearInterval(health.checkInterval.current); health.checkInterval.current = null; }
    }
    prevWorkstationId.current = currentId || null;
    return () => { isMounted = false; if (timeoutId) clearTimeout(timeoutId); };
  }, [currentWorkstation?.id]);

  // Opening animation + session cookie restore + verify persisted session
  useEffect(() => {
    let isMounted = true;
    Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    session.clearPendingRelease(currentWorkstation?.id);
    if (globalFlyMachineId && apiUrl) {
      session.flyMachineIdRef.current = globalFlyMachineId;
      getAuthHeaders().then(initAuthHeaders => fetch(`${apiUrl}/fly/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...initAuthHeaders },
        body: JSON.stringify({ projectId: currentWorkstation?.id, machineId: globalFlyMachineId }),
        credentials: 'include',
      })).then(res => res.json()).then((sessionData) => {
        if (sessionData?.previewToken) session.updatePreviewAccessToken(sessionData.previewToken, currentWorkstation?.id);
        if (isMounted && serverStatusRef.current === 'checking' && session.currentPreviewUrl) {
          setTimeout(() => { if (isMounted) health.checkServerStatus(); }, 1000);
        }
      }).catch((err) => {
        if (isMounted) {
          console.warn('[Preview] Failed to restore session cookie:', err?.message || err);
          if (serverStatusRef.current === 'checking' && session.currentPreviewUrl) health.checkServerStatus();
        }
      });
    } else if (serverStatusRef.current === 'checking') {
      if (currentWorkstation?.id) clearProjectPreviewSession(currentWorkstation.id);
      setServerStatus('stopped');
    }
    return () => { isMounted = false; };
  }, []);

  // Fix corrupted or wrong-project URL
  useEffect(() => {
    if (!session.currentPreviewUrl || !projectId) return;
    try {
      const parsed = new URL(session.currentPreviewUrl);
      const isSubdomain = parsed.hostname.endsWith('.drape.info') && !['www.drape.info', 'dev.drape.info', 'api.drape.info', 'drape.info'].includes(parsed.hostname);
      if (isSubdomain) return;
      const match = parsed.pathname.match(/^\/preview\/([^/]+)/);
      if (!match) session.setCurrentPreviewUrl(`https://${projectId}.drape.info/`);
      else if (match[1] !== projectId) session.setCurrentPreviewUrl(`https://${projectId}.drape.info/`);
    } catch {}
  }, [session.currentPreviewUrl, projectId]);

  // Ensure preview URL carries active token
  useEffect(() => {
    if (!session.currentPreviewUrl) return;
    const secured = session.withPreviewToken(session.currentPreviewUrl, session.previewAccessToken);
    if (secured !== session.currentPreviewUrl) {
      session.setCurrentPreviewUrlLocal(secured);
      setPreviewServerUrl(secured, currentWorkstation?.id);
    }
  }, [session.previewAccessToken]);

  // Update URL when prop changes
  useEffect(() => {
    if (previewUrl && previewUrl !== session.currentPreviewUrl && !globalServerUrl) {
      session.setCurrentPreviewUrl(previewUrl);
    }
  }, [previewUrl]);

  // ── Return — identical API to the original monolith ──────────

  return {
    // State
    serverStatus,
    currentPreviewUrl: session.currentPreviewUrl,
    coderToken: startupFlow.coderToken,
    previewAccessToken: session.previewAccessToken,
    terminalOutput: startupFlow.terminalOutput,
    viewportMode: navigation.viewportMode,
    hasWebUI,
    webViewReady,
    isLoading,
    canGoBack: navigation.canGoBack,
    canGoForward: navigation.canGoForward,
    requiredEnvVars: preflight.requiredEnvVars,
    envVarValues: preflight.envVarValues,
    isSavingEnv: preflight.isSavingEnv,
    sessionExpired: recovery.sessionExpired,
    sessionExpiredMessage: recovery.sessionExpiredMessage,
    showReloadBanner: navigation.showReloadBanner,
    projectInfo: startupFlow.projectInfo,
    terminalAuthToken: startupFlow.terminalAuthToken,
    effectivePreviewAccessToken: session.effectivePreviewAccessToken,

    // Refs
    flyMachineIdRef: session.flyMachineIdRef,
    preflightDoneRef: recovery.preflightDoneRef,
    autoFixTriggeredRef: recovery.autoFixTriggeredRef,

    // Setters
    setServerStatus,
    setCurrentPreviewUrl: session.setCurrentPreviewUrl,
    setWebViewReady,
    setIsLoading,
    setCanGoBack: navigation.setCanGoBack,
    setCanGoForward: navigation.setCanGoForward,
    setViewportMode: navigation.setViewportMode,
    setEnvVarValues: preflight.setEnvVarValues,
    setRequiredEnvVars: preflight.setRequiredEnvVars,

    // Handlers
    handleStartServer: startupFlow.handleStartServer,
    handleStartWithTransition: startupFlow.handleStartWithTransition,
    handleRetryPreview: recovery.handleRetryPreview,
    handleStopPreview: recovery.handleStopPreview,
    handleClose: recovery.handleClose,
    handleRefresh: navigation.handleRefresh,
    handleBannerReload: navigation.handleBannerReload,
    handleSaveEnvVars,
    sendErrorToChat: recovery.sendErrorToChat,
    redirectToEnvVarsWithError: preflight.redirectToEnvVarsWithError,
    checkServerStatus: health.checkServerStatus,

    // Startup hook
    startup,
  };
}
