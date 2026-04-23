/**
 * usePreviewHealth — health check function, polling interval,
 * and response interpretation (ready, pending, error, session expired).
 */
import { useRef, useEffect } from 'react';
import { logOutput } from '../../../../core/terminal/terminalLogger';
import { tracciaErroreAnteprima } from '../../../../core/services/analyticsService';
import { isMissingPreviewTokenError, isTransientProxyError } from '../errors';

import type { PreviewPreflightReturn } from './usePreviewPreflight';

// ── Types ────────────────────────────────────────────────────

type ServerStatus = 'checking' | 'running' | 'stopped';

export interface PreviewHealthParams {
  currentPreviewUrl: string;
  coderToken: string | null;
  previewAccessTokenRef: React.MutableRefObject<string | null>;
  flyMachineIdRef: React.MutableRefObject<string | null>;
  hasWebUIRef: React.MutableRefObject<boolean>;
  serverStatusRef: React.MutableRefObject<ServerStatus>;
  isVisible: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
  currentWorkstationId: string | undefined;
  clearProjectPreviewSession: (projectId: string) => void;
  setServerStatus: (status: ServerStatus) => void;
  setWebViewReady: (ready: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  hasWebUI: boolean;
  /** startup hook setters */
  startupSetStartingMessage: (msg: string) => void;
  startupSetPreviewError: (err: { message: string; timestamp: Date } | null) => void;
  startupSetIsStarting: (v: boolean) => void;
  startupClearLogs: () => void;
  setSessionExpired: (value: boolean) => void;
  setSessionExpiredMessage: (message: string) => void;
  /** preflight helpers */
  preflight: Pick<PreviewPreflightReturn, 'applyMissingEnvVarsFromMessage' | 'extractStartupErrorFromBody'>;
  /** reset helper */
  resetToStartScreen: () => void;
}

export interface PreviewHealthReturn {
  checkServerStatus: (urlOverride?: string, retryCount?: number) => Promise<void>;
  checkInterval: React.MutableRefObject<NodeJS.Timeout | null>;
}

export function usePreviewHealth({
  currentPreviewUrl,
  coderToken,
  previewAccessTokenRef,
  flyMachineIdRef,
  hasWebUIRef,
  serverStatusRef,
  isVisible,
  t,
  currentWorkstationId,
  clearProjectPreviewSession,
  setServerStatus,
  setWebViewReady,
  setIsLoading,
  hasWebUI,
  startupSetStartingMessage,
  startupSetPreviewError,
  startupSetIsStarting,
  startupClearLogs,
  setSessionExpired,
  setSessionExpiredMessage,
  preflight,
  resetToStartScreen,
}: PreviewHealthParams): PreviewHealthReturn {

  const checkInterval = useRef<NodeJS.Timeout | null>(null);

  const checkServerStatus = async (urlOverride?: string, retryCount = 0) => {
    if (!hasWebUIRef.current) return;
    const rawUrl = urlOverride || currentPreviewUrl;
    if (!rawUrl) return;

    let urlToCheck = rawUrl;
    try {
      const parsed = new URL(rawUrl);
      const previewMatch = parsed.pathname.match(/^(\/preview\/[^/]+\/)/);
      if (previewMatch) {
        parsed.pathname = previewMatch[1];
        urlToCheck = parsed.toString();
      }
    } catch { /* keep rawUrl */ }

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

      if (response.status >= 300 && response.status < 400) {
        console.warn('[Preview:CHECK] Server returned redirect:', response.status);
        scheduleRetry(2000);
        return;
      }

      const agentStatus = response.headers.get('X-Drape-Agent-Status');
      const contentType = response.headers.get('Content-Type') || '';

      if (agentStatus === 'waiting') {
        startupSetStartingMessage(t('terminal:preview.installingDeps'));
        scheduleRetry(2000);
        return;
      }

      let bodyText = '';
      const shouldReadBody = contentType.includes('application/json')
        || contentType.includes('text/plain')
        || response.status >= 500;
      if (shouldReadBody) {
        try { bodyText = await response.text(); } catch { /* ignore */ }
      }

      // Proxy-side errors
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
              if (currentWorkstationId) clearProjectPreviewSession(currentWorkstationId);
              setSessionExpired(true);
              setSessionExpiredMessage(t('terminal:preview.sessionExpired'));
              startupSetPreviewError(null);
              startupSetIsStarting(false);
              setWebViewReady(false);
              setIsLoading(true);
              setServerStatus('stopped');
              return;
            }
            if (isTransientProxyError(proxyError)) {
              console.warn('[Preview:CHECK] Transient proxy error, retrying:', proxyError);
              scheduleRetry(2000);
              return;
            }
            startupSetStartingMessage(t('terminal:preview.startingDevServer'));
            if (serverStatusRef.current === 'running') {
              startupSetPreviewError({ message: proxyError, timestamp: new Date() });
              tracciaErroreAnteprima(proxyError);
              setServerStatus('stopped');
              startupSetIsStarting(false);
            } else {
              scheduleRetry(2000);
            }
            return;
          }
        } catch { /* ignore malformed JSON */ }
      }

      if (response.status >= 200 && response.status < 300) {
        if (serverStatusRef.current === 'stopped') return;
        console.log('[Preview:CHECK] Server OK! Setting running');
        const wasRunning = serverStatusRef.current === 'running';
        if (!wasRunning) {
          logOutput(`Server is running at ${urlToCheck}`, 'preview', 0);
        }
        setServerStatus('running');
        if (!wasRunning) {
          startupClearLogs();
          startupSetIsStarting(false);
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
        if (serverStatusRef.current === 'running') return;
        const startupError = preflight.extractStartupErrorFromBody(bodyText);
        if (startupError) {
          preflight.applyMissingEnvVarsFromMessage(startupError);
          startupSetPreviewError({ message: startupError, timestamp: new Date() });
          tracciaErroreAnteprima(startupError);
          setServerStatus('stopped');
          startupSetIsStarting(false);
          return;
        }
        startupSetStartingMessage(t('terminal:preview.waitingForServer'));
        scheduleRetry(2000);
        return;
      }

      if (response.status === 403 || response.status === 404 || response.status === 503) {
        startupSetStartingMessage(
          response.status === 503
            ? t('terminal:preview.startingDevServer')
            : t('terminal:preview.configuringServer'),
        );
        scheduleRetry(2000);
        return;
      }

      if (response.status === 401) {
        // Token may not yet be propagated on the first health check after start.
        // Don't nuke the session — retry a few times before giving up.
        console.warn('[Preview:CHECK] 401 on health check, retrying');
        if (retryCount < 5) {
          scheduleRetry(2000);
          return;
        }
        resetToStartScreen();
        return;
      }

      startupSetStartingMessage(t('terminal:preview.waitingForServer'));
      scheduleRetry(2000);
    } catch (error: any) {
      startupSetStartingMessage(
        error.name === 'AbortError'
          ? t('terminal:preview.connecting')
          : t('terminal:preview.retryingConnection'),
      );
      scheduleRetry(3000);
    }
  };

  // ── Periodic health checks when running ──────────────────────
  useEffect(() => {
    if (!isVisible) return;
    if (serverStatusRef.current !== 'running') return;
    if (currentPreviewUrl.includes('localhost:3001')) return;
    checkInterval.current = setInterval(() => checkServerStatus(), 5000);
    return () => {
      if (checkInterval.current) clearInterval(checkInterval.current);
    };
  }, [currentPreviewUrl, serverStatusRef.current, isVisible]);

  return { checkServerStatus, checkInterval };
}
