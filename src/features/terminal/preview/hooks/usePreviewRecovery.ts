/**
 * usePreviewRecovery — retry preview, auto-fix triggering,
 * session expired detection, fatal vs recoverable error policy,
 * attempt counting, and live logs SSE streaming.
 */
import { useState, useEffect, useRef } from 'react';
import { ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import { Animated } from 'react-native';
import { logError } from '../../../../core/terminal/terminalLogger';
import { tracciaAnteprimaFermata, tracciaFixAIAnteprima, tracciaErroreAnteprima } from '../../../../core/services/analyticsService';
import { isMissingPreviewTokenError, detectCriticalTerminalErrors } from '../errors';
import { serverLogService } from '../../../../core/services/serverLogService';
import { getAuthToken, getAuthHeaders } from '../../../../core/api/getAuthToken';
import { useUIStore } from '../../../../core/terminal/uiStore';
import { useAgentStore } from '../../../../core/agent/agentStore';

import type { PreviewAutoFixReturn } from '../../../../hooks/preview/usePreviewAutoFix';
import type { PreviewSessionReturn } from './usePreviewSession';

// ── Types ────────────────────────────────────────────────────

type ServerStatus = 'checking' | 'running' | 'stopped';

export interface PreviewRecoveryParams {
  apiUrl: string;
  t: (key: string, opts?: any) => string;
  currentWorkstation: any;
  webViewRef: React.RefObject<WebView>;
  terminalScrollRef: React.RefObject<ScrollView>;
  session: PreviewSessionReturn;
  autoFix: PreviewAutoFixReturn;
  isVisible: boolean;
  fadeAnim: Animated.Value;
  onClose: () => void;
  serverStatusRef: React.MutableRefObject<ServerStatus>;
  setServerStatus: (status: ServerStatus) => void;
  setWebViewReady: (ready: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setHasWebUI: (val: boolean) => void;
  hasWebUIRef: React.MutableRefObject<boolean>;
  clearProjectPreviewSession: (projectId: string) => void;
  setPreviewServerStatus: (status: string) => void;
  setPreviewServerUrl: (url: string | null, projectId?: string) => void;
  setGlobalFlyMachineId: (id: string | null, projectId?: string) => void;
  jsErrorsRef: React.MutableRefObject<string[]>;
  checkInterval: React.MutableRefObject<NodeJS.Timeout | null>;
  errorDetectedRef: React.MutableRefObject<boolean>;
  errorDetectionEnabledAtRef: React.MutableRefObject<number>;
  ignoreLogsUntilRef: React.MutableRefObject<number>;
  logsSinceCursorRef: React.MutableRefObject<number>;
  /** startup hook */
  startup: any;
  handleStartServer: () => Promise<void>;
  terminalOutput: string[];
  setTerminalOutput: React.Dispatch<React.SetStateAction<string[]>>;
  resetToStartScreen: () => void;
}

export interface PreviewRecoveryReturn {
  sessionExpired: boolean;
  setSessionExpired: React.Dispatch<React.SetStateAction<boolean>>;
  sessionExpiredMessage: string;
  setSessionExpiredMessage: React.Dispatch<React.SetStateAction<string>>;
  preflightDoneRef: React.MutableRefObject<boolean>;
  autoFixTriggeredRef: React.MutableRefObject<boolean>;
  handleRetryPreview: () => void;
  handleStopPreview: () => void;
  handleClose: () => void;
  sendErrorToChat: () => void;
  logsXhrRef: React.MutableRefObject<XMLHttpRequest | null>;
}

export function usePreviewRecovery({
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
  checkInterval,
  errorDetectedRef,
  errorDetectionEnabledAtRef,
  ignoreLogsUntilRef,
  logsSinceCursorRef,
  startup,
  handleStartServer,
  terminalOutput,
  setTerminalOutput,
  resetToStartScreen,
}: PreviewRecoveryParams): PreviewRecoveryReturn {

  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState('');
  const preflightDoneRef = useRef(false);
  const autoFixTriggeredRef = useRef(false);
  const logsXhrRef = useRef<XMLHttpRequest | null>(null);

  // ── Retry ────────────────────────────────────────────────────

  const handleRetryPreview = () => {
    startup.setPreviewError(null);
    startup.setReportSent(false);
    if (serverStatusRef.current === 'running' || session.currentPreviewUrl) {
      setServerStatus('running');
      startup.setIsStarting(false);
      webViewRef.current?.reload();
      return;
    }
    setTerminalOutput([]);
    logsSinceCursorRef.current = 0;
    errorDetectedRef.current = false;
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

  // ── Stop ─────────────────────────────────────────────────────

  const handleStopPreview = () => {
    if (checkInterval.current) { clearInterval(checkInterval.current); checkInterval.current = null; }
    if (logsXhrRef.current) { logsXhrRef.current.abort(); logsXhrRef.current = null; }
    tracciaAnteprimaFermata();

    if (currentWorkstation?.id) {
      const closingProjectId = currentWorkstation.id;
      session.clearPendingRelease(closingProjectId);
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
      session.flyMachineIdRef.current = null;
      session.updatePreviewAccessToken(null, closingProjectId);
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

  // ── Close ────────────────────────────────────────────────────

  const handleClose = () => {
    handleStopPreview();
    fadeAnim.stopAnimation(() => {
      fadeAnim.setValue(1);
      onClose();
    });
  };

  // ── Send error to chat ───────────────────────────────────────

  const sendErrorToChat = () => {
    if (!startup.previewError) return;
    tracciaFixAIAnteprima();
    const errorLines = terminalOutput
      .filter(l => {
        const lower = l.toLowerCase();
        return lower.includes('error') || lower.includes('failed') || lower.includes('cannot') || lower.includes('\u00d7');
      })
      .slice(-10);
    const logSnippet = errorLines.length > 0 ? errorLines.join('\n') : startup.previewError.message;
    const chatMessage = `Fix this preview error:\n\`\`\`\n${logSnippet}\n\`\`\``;
    startup.setPreviewError(null);
    setTerminalOutput([]);
    logsSinceCursorRef.current = 0;
    errorDetectedRef.current = false;
    errorDetectionEnabledAtRef.current = Date.now() + 1200;
    ignoreLogsUntilRef.current = Date.now() + 1200;
    const store = useUIStore.getState();
    store.setPendingChatMessage(chatMessage);
    store.setAutoRetryPreview(true);
    handleClose();
  };

  // ── Auto-fix preflight: mark verified when WebView loads ─────

  useEffect(() => {
    if (!startup.webViewReady && !preflightDoneRef.current) return;
    // webViewReady not available here — we rely on the orchestrator passing it
  }, []);

  // ── Reset preflight when project changes ─────────────────────

  useEffect(() => {
    preflightDoneRef.current = false;
    autoFix.reset();
    jsErrorsRef.current = [];
  }, [currentWorkstation?.id]);

  // ── Auto-recovery: request machineId if missing ──────────────

  useEffect(() => {
    let isMounted = true;
    const shouldRecover =
      (serverStatusRef.current === 'running' || serverStatusRef.current === 'stopped')
      && currentWorkstation?.id
      && (!session.flyMachineIdRef.current || !session.previewAccessTokenRef.current);
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
          if (data.previewToken) session.updatePreviewAccessToken(data.previewToken, currentWorkstation.id);
        } else {
          clearProjectPreviewSession(currentWorkstation.id);
        }
      }).catch((err) => {
        if (isMounted) console.warn('[Preview] Failed to recover machine ID:', err?.message || err);
      });
    }
    return () => { isMounted = false; };
  }, [serverStatusRef.current, session.flyMachineIdRef.current, currentWorkstation?.id, apiUrl, session.previewAccessToken]);

  // ── Live logs SSE streaming ──────────────────────────────────

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isMounted = true;
    if (!isVisible) return;

    const connectToLogs = async () => {
      if (!isMounted) return;
      if (!hasWebUIRef.current) return;
      if ((serverStatusRef.current !== 'running' && !startup.isStarting && serverStatusRef.current !== 'checking') || !currentWorkstation?.id) return;
      if (logsXhrRef.current) { logsXhrRef.current.abort(); logsXhrRef.current = null; }
      const logsSince = logsSinceCursorRef.current > 0 ? Math.max(0, logsSinceCursorRef.current) : 0;
      const tokenQuery = session.previewAccessTokenRef.current ? `&previewToken=${encodeURIComponent(session.previewAccessTokenRef.current)}` : '';
      const logsUrl = `${apiUrl}/fly/logs/${currentWorkstation.id}?since=${logsSince}${tokenQuery}`;
      const xhr = new XMLHttpRequest();
      logsXhrRef.current = xhr;
      let lastIndex = 0;
      let dataBuffer = '';
      const logsAuthToken = await getAuthToken();
      xhr.open('GET', logsUrl);
      xhr.setRequestHeader('Accept', 'text/event-stream');
      if (logsAuthToken) xhr.setRequestHeader('Authorization', `Bearer ${logsAuthToken}`);
      const LOG_MAX_RESPONSE_SIZE = 2 * 1024 * 1024;

      xhr.onprogress = () => {
        try {
          if (xhr.responseText && xhr.responseText.length > LOG_MAX_RESPONSE_SIZE) {
            try { xhr.abort(); } catch {}
            return;
          }
        } catch (e) { try { xhr.abort(); } catch {} return; }
        let newData: string;
        try { newData = xhr.responseText.substring(lastIndex); } catch (e) { try { xhr.abort(); } catch {} return; }
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
                if (typeof data.message === 'string' && isMissingPreviewTokenError(data.message)) { resetToStartScreen(); continue; }
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
                if (serverStatusRef.current !== 'running') startup.setDisplayedMessage(data.text);
                setTerminalOutput((prev: string[]) => {
                  const newOutput = [...prev, data.text];
                  return newOutput.length > 500 ? newOutput.slice(-500) : newOutput;
                });
                setTimeout(() => terminalScrollRef.current?.scrollToEnd({ animated: true }), 50);
              }
            } catch {}
          } else if (line.length > 0 && !line.startsWith(':') && !line.startsWith('event:') && !line.startsWith('id:') && !line.startsWith('retry:')) {
            if (serverStatusRef.current !== 'running') startup.setDisplayedMessage(line);
            setTerminalOutput((prev: string[]) => {
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
          let message = xhr.status === 401 ? t('terminal:preview.sessionExpired') : 'Access denied: project ownership check failed';
          try {
            const payload = JSON.parse(xhr.responseText || '{}');
            if (typeof payload?.error === 'string' && payload.error.trim().length > 0) message = payload.error;
          } catch {}
          if (currentWorkstation?.id) clearProjectPreviewSession(currentWorkstation.id);
          if (isMissingPreviewTokenError(message)) { resetToStartScreen(); return; }
          setSessionExpired(true);
          setSessionExpiredMessage(message);
          setServerStatus('stopped');
          startup.setIsStarting(false);
          startup.setPreviewError({ message, timestamp: new Date() });
          tracciaErroreAnteprima(message);
          return;
        }
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
  }, [serverStatusRef.current, startup.isStarting, currentWorkstation?.id, apiUrl, session.previewAccessToken, isVisible]);

  // ── Detect critical errors in terminal output ────────────────

  useEffect(() => {
    if (serverStatusRef.current !== 'checking' || startup.previewError || errorDetectedRef.current) return;
    if (Date.now() < errorDetectionEnabledAtRef.current) return;
    const recentLines = terminalOutput.slice(-30);
    const errorLines = detectCriticalTerminalErrors(recentLines);
    if (errorLines.length >= 2) {
      errorDetectedRef.current = true;
      const errorSummary = errorLines.slice(0, 3).join('\n');
      startup.setPreviewError({ message: errorSummary, timestamp: new Date() });
      tracciaErroreAnteprima(errorSummary);
      setServerStatus('stopped');
      startup.setIsStarting(false);
    }
  }, [terminalOutput, serverStatusRef.current, startup.previewError]);

  // ── Auto-fix: when fatal preview error occurs, fix in-place ──

  useEffect(() => {
    if (startup.previewError && !autoFixTriggeredRef.current) {
      autoFixTriggeredRef.current = true;
      const timer = setTimeout(() => {
        console.log('[PreviewAutoFix] Fatal error detected, fixing in-place');
        const errorLines = terminalOutput
          .filter(l => {
            const lower = l.toLowerCase();
            return lower.includes('error') || lower.includes('failed') || lower.includes('cannot');
          })
          .slice(-10);
        const errors = errorLines.length > 0 ? errorLines : [startup.previewError?.message || 'Preview failed to start'];
        autoFix.reportCheckResult({ rootChildren: 0, jsErrors: errors, screenshotBase64: null });
      }, 500);
      return () => clearTimeout(timer);
    }
    if (!startup.previewError) {
      autoFixTriggeredRef.current = false;
      errorDetectedRef.current = false;
    }
  }, [startup.previewError]);

  return {
    sessionExpired,
    setSessionExpired,
    sessionExpiredMessage,
    setSessionExpiredMessage,
    preflightDoneRef,
    autoFixTriggeredRef,
    handleRetryPreview,
    handleStopPreview,
    handleClose,
    sendErrorToChat,
    logsXhrRef,
  };
}
