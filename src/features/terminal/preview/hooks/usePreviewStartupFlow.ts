/**
 * usePreviewStartupFlow — SSE/XHR startup stream handling,
 * progress tracking, step labels, startup messages, and
 * the transition to ready or error.
 */
import { useState, useRef } from 'react';
import { Animated, Easing, ScrollView } from 'react-native';
import { ProjectInfo } from '../../../../core/preview/projectDetector';
import { useWorkstationStore } from '../../../../core/terminal/workstationStore';
import { useAuthStore } from '../../../../core/auth/authStore';
import { useUIStore } from '../../../../core/terminal/uiStore';
import { useTabStore } from '../../../../core/tabs/tabStore';
import { logOutput, logError, logSystem } from '../../../../core/terminal/terminalLogger';
import { gitAccountService } from '../../../../core/git/gitAccountService';
import { tracciaAnteprimaAvviata, tracciaAnteprimaPronta, tracciaErroreAnteprima } from '../../../../core/services/analyticsService';
import { getAuthToken, getAuthHeaders } from '../../../../core/api/getAuthToken';

import { isMissingPreviewTokenError } from '../errors';

import type { PreviewSessionReturn } from './usePreviewSession';
import type { PreviewPreflightReturn } from './usePreviewPreflight';

// ── Constants ────────────────────────────────────────────────

const USE_HOLY_GRAIL = true;

// ── Types ────────────────────────────────────────────────────

type ServerStatus = 'checking' | 'running' | 'stopped';

export interface PreviewStartupFlowParams {
  apiUrl: string;
  t: (key: string, opts?: any) => string;
  currentWorkstation: any;
  terminalScrollRef: React.RefObject<ScrollView>;
  session: PreviewSessionReturn;
  preflight: PreviewPreflightReturn;
  setServerStatus: (status: ServerStatus) => void;
  serverStatusRef: React.MutableRefObject<ServerStatus>;
  setWebViewReady: (ready: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  hasWebUI: boolean;
  setHasWebUI: (val: boolean) => void;
  hasWebUIRef: React.MutableRefObject<boolean>;
  setProjectInfo: (info: ProjectInfo | null) => void;
  setCoderToken: (token: string | null) => void;
  setTerminalOutput: React.Dispatch<React.SetStateAction<string[]>>;
  setTerminalAuthToken: (token: string | null) => void;
  setSessionExpired: (val: boolean) => void;
  setSessionExpiredMessage: (msg: string) => void;
  errorDetectedRef: React.MutableRefObject<boolean>;
  errorDetectionEnabledAtRef: React.MutableRefObject<number>;
  ignoreLogsUntilRef: React.MutableRefObject<number>;
  logsSinceCursorRef: React.MutableRefObject<number>;
  /** The startup hook (usePreviewStartup) */
  startup: any;
  checkServerStatus: (urlOverride?: string, retryCount?: number) => Promise<void>;
  resetToStartScreen: () => void;
}

export interface PreviewStartupFlowReturn {
  handleStartServer: () => Promise<void>;
  handleStartWithTransition: () => void;
  projectInfo: ProjectInfo | null;
  coderToken: string | null;
  terminalOutput: string[];
  setTerminalOutput: React.Dispatch<React.SetStateAction<string[]>>;
  terminalAuthToken: string | null;
}

export function usePreviewStartupFlow({
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
  setProjectInfo: setProjectInfoExternal,
  setCoderToken: setCoderTokenExternal,
  setTerminalOutput: setTerminalOutputExternal,
  setTerminalAuthToken: setTerminalAuthTokenExternal,
  setSessionExpired,
  setSessionExpiredMessage,
  errorDetectedRef,
  errorDetectionEnabledAtRef,
  ignoreLogsUntilRef,
  logsSinceCursorRef,
  startup,
  checkServerStatus,
  resetToStartScreen,
}: PreviewStartupFlowParams): PreviewStartupFlowReturn {

  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [coderToken, setCoderToken] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [terminalAuthToken, setTerminalAuthToken] = useState<string | null>(null);

  // Sync external setters
  const setProjectInfoBoth = (info: ProjectInfo | null) => { setProjectInfo(info); setProjectInfoExternal(info); };
  const setCoderTokenBoth = (token: string | null) => { setCoderToken(token); setCoderTokenExternal(token); };
  const setTerminalOutputBoth: React.Dispatch<React.SetStateAction<string[]>> = (val) => {
    setTerminalOutput(val); setTerminalOutputExternal(val);
  };
  const setTerminalAuthTokenBoth = (token: string | null) => { setTerminalAuthToken(token); setTerminalAuthTokenExternal(token); };

  const normalizeStartupStep = (rawStep?: string): string => {
    const step = (rawStep || '').toLowerCase();
    const map: Record<string, string> = {
      container: 'booting', clone: 'cloning', detect: 'detecting',
      install: 'installing', server: 'starting', starting: 'starting',
      ready: 'ready', analyzing: 'analyzing', cloning: 'cloning',
      detecting: 'detecting', booting: 'booting', installing: 'installing',
    };
    return map[step] || step || 'analyzing';
  };

  const inferHasWebUI = (projectType?: string): boolean => {
    const normalized = String(projectType || '').toLowerCase();
    if (!normalized) return true;
    const noWebUiTypes = new Set(['python-console', 'javascript-console', 'c-lang', 'cpp', 'java']);
    return !noWebUiTypes.has(normalized);
  };

  // ── Main start server ────────────────────────────────────────

  const handleStartServer = async () => {
    if (!currentWorkstation?.id) {
      logError('No workstation selected', 'preview');
      return;
    }

    // Preflight
    if (!preflight.checkAndSetSkipPreflight()) {
      const canProceed = await preflight.preflightEnvCheck();
      if (!canProceed) {
        startup.setIsStartTransitioning(false);
        startup.startTransitionAnim.setValue(0);
        return;
      }
    }

    tracciaAnteprimaAvviata(currentWorkstation?.name || 'unknown');
    session.clearPendingRelease(currentWorkstation.id);
    setWebViewReady(false);
    setIsLoading(true);
    setTerminalOutputBoth([]);
    logsSinceCursorRef.current = 0;
    errorDetectedRef.current = false;
    startup.setPreviewError(null);

    // Clear stale runtimeError from env-vars tab
    const tabStore = useTabStore.getState();
    const envTab = tabStore.tabs.find((tab: any) => tab.id === 'env-vars');
    if (envTab?.data?.runtimeError) {
      const { runtimeError: _removed, ...keepData } = envTab.data;
      tabStore.updateTab('env-vars', { data: keepData });
    }

    errorDetectionEnabledAtRef.current = Date.now() + 1200;
    ignoreLogsUntilRef.current = Date.now() + 1200;

    // Quick health check
    console.log('[Preview:START] handleStartServer called', {
      globalFlyMachineId: session.flyMachineIdRef.current, currentPreviewUrl: session.currentPreviewUrl,
      serverStatus: serverStatusRef.current, projectId: currentWorkstation?.id,
    });
    if (session.flyMachineIdRef.current && session.currentPreviewUrl) {
      console.log('[Preview:START] Quick health check starting...');
      setServerStatus('checking');
      startup.setIsStarting(true);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(session.currentPreviewUrl, {
          method: 'GET', cache: 'no-store', credentials: 'include',
          redirect: 'manual' as RequestRedirect,
          headers: {
            'Fly-Force-Instance-Id': session.flyMachineIdRef.current!,
            ...(session.previewAccessTokenRef.current ? { 'X-Drape-Preview-Token': session.previewAccessTokenRef.current } : {}),
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (response.status >= 200 && response.status < 300 && !(response.status >= 300 && response.status < 400)) {
          console.log('[Preview:START] Quick health check PASSED');
          setServerStatus('running');
          startup.setIsStarting(false);
          if (!hasWebUI) setWebViewReady(true);
          return;
        }
        console.log('[Preview:START] Quick health check failed, falling through to SSE');
      } catch (e: any) {
        console.log('[Preview:START] Quick health check error:', e.message);
      }
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
      if (authToken) setTerminalAuthTokenBoth(authToken);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', previewEndpoint);
        xhr.setRequestHeader('Content-Type', 'application/json');
        if (authToken) xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);

        let lastIndex = 0;
        let pollInterval: any = null;
        let dataBuffer = '';
        let readyReceived = false;
        let errorReceived = false;
        const MAX_RESPONSE_SIZE = 2 * 1024 * 1024;

        const processResponse = () => {
          try {
            if (xhr.responseText && xhr.responseText.length > MAX_RESPONSE_SIZE) {
              console.warn('[Preview:SSE] Response too large, aborting');
              try { xhr.abort(); } catch {}
              return;
            }
          } catch (e) {
            try { xhr.abort(); } catch {}
            return;
          }
          let newData: string;
          try { newData = xhr.responseText.substring(lastIndex); } catch (e) { try { xhr.abort(); } catch {} return; }
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
                      logOutput(`\u26a0\ufe0f ${warningData.message}`, 'preview', 0);
                    }
                  } catch {}
                } else if (parsed.type === 'log') {
                  const rawText = typeof parsed.text === 'string' ? parsed.text : (typeof parsed.message === 'string' ? parsed.message : '');
                  if (!rawText) continue;
                  const lines = rawText.replace(/\r/g, '\n').replace(/\u0000/g, '').split('\n')
                    .map((l: string) => l.trimEnd()).filter((l: string) => l.trim().length > 0);
                  if (lines.length === 0) continue;
                  startup.recentLogsRef.current.push(...lines.map((l: string) => `[LOG] ${l}`));
                  if (startup.recentLogsRef.current.length > 200) startup.recentLogsRef.current = startup.recentLogsRef.current.slice(-200);
                  setTerminalOutputBoth((prev: string[]) => {
                    const newOutput = [...prev, ...lines];
                    return newOutput.length > 500 ? newOutput.slice(-500) : newOutput;
                  });
                  if (serverStatusRef.current !== 'running') startup.setDisplayedMessage(lines[lines.length - 1]);
                  setTimeout(() => terminalScrollRef.current?.scrollToEnd({ animated: true }), 40);
                } else if (parsed.type === 'step') {
                  startup.recentLogsRef.current.push(`[STEP] ${parsed.step}: ${parsed.message}`);
                  if (startup.recentLogsRef.current.length > 50) startup.recentLogsRef.current.shift();
                  const normalizedStep = normalizeStartupStep(parsed.step);
                  startup.setCurrentStepId(normalizedStep);
                  startup.setStartingMessage(parsed.message);
                  startup.setDisplayedMessage(parsed.message);
                  const stepProgressMap: Record<string, number> = {
                    analyzing: 5, cloning: 10, detecting: 15, warning: 20,
                    booting: 25, installing: 40, starting: 70, ready: 100,
                  };
                  startup.setTargetProgress(stepProgressMap[normalizedStep] || startup.targetProgress);
                  if (parsed.projectType?.toLowerCase().includes('next') ||
                    parsed.message?.toLowerCase().includes('next.js') ||
                    parsed.message?.toLowerCase().includes('turbopack')) {
                    startup.setIsNextJsProject(true);
                  }
                  startup.setStartupSteps(startup.startupSteps.map((step: any) => {
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
                    console.log('[Preview:SSE] READY received!', { previewUrl: result.previewUrl, machineId: result.machineId });
                    const completeSetup = () => {
                      console.log('[Preview:SSE] completeSetup()');
                      setServerStatus('running');
                      tracciaAnteprimaPronta(currentWorkstation?.name || 'unknown');
                      startup.clearLogs();
                      startup.setIsStarting(false);
                      resolve();
                    };

                    // Unsupported tech
                    const SUPPORTED_TECHS = ['nextjs', 'react', 'vite', 'vue', 'html', 'static', 'astro', 'expo', 'nodejs'];
                    if (result.projectInfo?.type && !SUPPORTED_TECHS.some((s: string) => result.projectInfo.type.includes(s)) && result.projectInfo.type !== 'unknown' && result.projectInfo.type !== 'detecting') {
                      setServerStatus('stopped');
                    }

                    // Save detected tech
                    if (result.projectInfo?.type && currentWorkstation) {
                      const detectedTech = result.projectInfo.type;
                      if (detectedTech !== 'unknown' && detectedTech !== 'static' && detectedTech !== 'detecting') {
                        const wsStore = useWorkstationStore.getState();
                        const updated = { ...currentWorkstation, technology: detectedTech, language: detectedTech };
                        wsStore.setWorkstation(updated);
                        import('firebase/firestore').then(({ doc, updateDoc }) => {
                          import('../../../../config/firebase').then(({ db }) => {
                            if (currentWorkstation.projectId || currentWorkstation.id) {
                              const projId = currentWorkstation.projectId || currentWorkstation.id;
                              updateDoc(doc(db, 'user_projects', projId), { technology: detectedTech }).catch(() => {});
                            }
                          });
                        }).catch(() => {});
                      }
                    }

                    if (result.projectInfo) {
                      setProjectInfoBoth({
                        type: result.projectInfo.type || 'unknown',
                        defaultPort: result.projectInfo.defaultPort || result.projectInfo.port || 3000,
                        startCommand: result.projectInfo.startCommand || '',
                        installCommand: result.projectInfo.installCommand || '',
                        description: result.projectInfo.description || '',
                        hasWebUI: typeof result.hasWebUI === 'boolean' ? result.hasWebUI : inferHasWebUI(result.projectInfo.type),
                      });
                    }

                    const projectHasWebUI = typeof result.hasWebUI === 'boolean' ? result.hasWebUI : inferHasWebUI(result.projectInfo?.type);
                    setHasWebUI(projectHasWebUI);
                    if (!projectHasWebUI) setWebViewReady(true);

                    if (result.previewUrl) {
                      if (result.coderToken) setCoderTokenBoth(result.coderToken);
                      if (result.previewToken) session.updatePreviewAccessToken(result.previewToken, currentWorkstation?.id);
                      if (result.machineId) {
                        session.flyMachineIdRef.current = result.machineId;
                        getAuthHeaders().then(authHeaders => fetch(`${apiUrl}/fly/session`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', ...authHeaders },
                          body: JSON.stringify({ projectId: currentWorkstation?.id, machineId: result.machineId }),
                          credentials: 'include',
                        })).then(res => res.json()).then((sessionData) => {
                          if (sessionData?.previewToken) session.updatePreviewAccessToken(sessionData.previewToken, currentWorkstation?.id);
                          setTimeout(() => {
                            session.setCurrentPreviewUrl(result.previewUrl);
                            completeSetup();
                          }, 1000);
                        }).catch(() => {
                          session.setCurrentPreviewUrl(result.previewUrl);
                          completeSetup();
                        });
                      } else {
                        session.setCurrentPreviewUrl(result.previewUrl);
                        completeSetup();
                      }
                    } else {
                      session.setCurrentPreviewUrlLocal('');
                      if (result.machineId) session.flyMachineIdRef.current = result.machineId;
                      completeSetup();
                    }
                  }
                } else if (parsed.type === 'error') {
                  console.log('[Preview:SSE] ERROR received:', parsed.message);
                  errorReceived = true;
                  if (preflight.isEnvRelatedError(parsed.message || '')) preflight.redirectToEnvVarsWithError(parsed.message || '');
                  preflight.applyMissingEnvVarsFromMessage(parsed.message || '');
                  startup.recentLogsRef.current.push(`[ERROR] ${parsed.message}`);
                  startup.setStartupSteps(startup.startupSteps.map((s: any) => s.status === 'active' ? { ...s, status: 'error' as const } : s));
                  logError(parsed.message, 'preview');
                  setServerStatus('stopped');
                  startup.setIsStarting(false);
                  startup.setPreviewError({ message: parsed.message, timestamp: new Date() });
                  tracciaErroreAnteprima(parsed.message);
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
            let message = `Server error: ${xhr.status}`;
            let errorCode = '';
            try {
              const payload = JSON.parse(xhr.responseText || '{}');
              errorCode = payload?.error || '';
              if (typeof payload?.message === 'string' && payload.message.trim().length > 0) message = payload.message;
              else if (typeof payload?.error === 'string' && payload.error.trim().length > 0) message = payload.error;
            } catch {}
            if (xhr.status === 403 && message === `Server error: 403`) message = 'Access denied: project ownership check failed. Refresh project list and retry.';
            if (errorCode === 'PREVIEW_LIMIT_EXCEEDED' || errorCode === 'PUBLISH_REQUIRES_PAID') message = `__LIMIT__${errorCode}__::${message}`;
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
                session.flyMachineIdRef.current = sessionData.machineId;
                if (sessionData.previewToken) session.updatePreviewAccessToken(sessionData.previewToken, currentWorkstation?.id);
                const fallbackUrl = `${apiUrl}/preview/${currentWorkstation?.id}/`;
                session.setCurrentPreviewUrl(fallbackUrl);
                setServerStatus('running');
                startup.setIsStarting(false);
                resolve();
              } else {
                if (currentWorkstation?.id) session.clearPendingRelease(currentWorkstation.id);
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
          repositoryUrl: repoUrl, githubToken, userEmail, username,
        }));
      });
    } catch (error: any) {
      const message = error.message || t('terminal:preview.errorDuringStartup');
      if (isMissingPreviewTokenError(message)) { resetToStartScreen(); return; }
      if (message.startsWith('__LIMIT__')) {
        setServerStatus('stopped');
        startup.setIsStarting(false);
        startup.setPreviewError({ message, timestamp: new Date() });
        return;
      }
      if (preflight.isEnvRelatedError(message || '')) preflight.redirectToEnvVarsWithError(message || '');
      preflight.applyMissingEnvVarsFromMessage(message || '');
      logError(message || t('terminal:preview.errorDuringStartup'), 'preview');
      setServerStatus('stopped');
      startup.setIsStarting(false);
      startup.setPreviewError({ message: message || t('terminal:preview.errorStartingPreview'), timestamp: new Date() });
      tracciaErroreAnteprima(message || 'Unknown preview error');
    }
  };

  const handleStartWithTransition = () => {
    startup.setIsStartTransitioning(true);
    Animated.timing(startup.startTransitionAnim, {
      toValue: 1, duration: 300, easing: Easing.in(Easing.cubic), useNativeDriver: true,
    }).start(() => handleStartServer());
  };

  return {
    handleStartServer,
    handleStartWithTransition,
    projectInfo,
    coderToken,
    terminalOutput,
    setTerminalOutput: setTerminalOutputBoth,
    terminalAuthToken,
  };
}
