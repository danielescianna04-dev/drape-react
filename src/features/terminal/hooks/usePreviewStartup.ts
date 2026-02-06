import { useState, useEffect, useRef } from 'react';
import { Animated, AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../../core/terminal/uiStore';
import { usePreviewLogs } from '../../../hooks/api/usePreviewLogs';
import { liveActivityService } from '../../../core/services/liveActivityService';

interface UsePreviewStartupParams {
  projectId: string | undefined;
  serverStatus: 'checking' | 'running' | 'stopped';
  webViewReady: boolean;
  currentWorkstationName: string | undefined;
}

export function usePreviewStartup({
  projectId,
  serverStatus,
  webViewReady,
  currentWorkstationName,
}: UsePreviewStartupParams) {
  const { t } = useTranslation(['terminal', 'common']);

  const setPreviewStartupState = useUIStore((state) => state.setPreviewStartupState);
  const getPreviewStartupState = useUIStore((state) => state.getPreviewStartupState);
  const clearPreviewStartupState = useUIStore((state) => state.clearPreviewStartupState);

  // Restore persisted state
  const persistedState = projectId ? getPreviewStartupState(projectId) : null;

  const [isStarting, setIsStartingLocal] = useState(persistedState?.isStarting ?? false);
  const [startingMessage, setStartingMessageLocal] = useState(persistedState?.startingMessage ?? '');
  const [isNextJsProject, setIsNextJsProject] = useState(false);

  const defaultSteps = [
    { id: 'analyzing', label: t('terminal:preview.steps.analyzing'), status: 'pending' as const },
    { id: 'cloning', label: t('terminal:preview.steps.cloning'), status: 'pending' as const },
    { id: 'detecting', label: t('terminal:preview.steps.detecting'), status: 'pending' as const },
    { id: 'booting', label: t('terminal:preview.steps.booting'), status: 'pending' as const },
    { id: 'installing', label: t('terminal:preview.steps.installing'), status: 'pending' as const },
    { id: 'starting', label: t('terminal:preview.steps.starting'), status: 'pending' as const },
    { id: 'ready', label: t('terminal:preview.steps.ready'), status: 'pending' as const },
  ];

  const [startupSteps, setStartupStepsLocal] = useState<Array<{
    id: string; label: string; status: 'pending' | 'active' | 'complete' | 'error';
  }>>(Array.isArray(persistedState?.startupSteps) ? persistedState.startupSteps : defaultSteps);

  const [currentStepId, setCurrentStepIdLocal] = useState<string | null>(persistedState?.currentStepId ?? null);
  const [smoothProgress, setSmoothProgressLocal] = useState(persistedState?.smoothProgress ?? 0);
  const smoothProgressRef = useRef(persistedState?.smoothProgress ?? 0);
  const [targetProgress, setTargetProgressLocal] = useState(persistedState?.targetProgress ?? 0);
  const [displayedMessage, setDisplayedMessageLocal] = useState(persistedState?.displayedMessage ?? '');
  const [previewError, setPreviewErrorLocal] = useState<{ message: string; timestamp: Date } | null>(persistedState?.previewError ?? null);

  const [estimatedRemainingSeconds, setEstimatedRemainingSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const appState = useRef(AppState.currentState);

  // Error reporting
  const [isSendingReport, setIsSendingReport] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const recentLogsRef = useRef<string[]>([]);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const maskOpacityAnim = useRef(new Animated.Value(1)).current;

  // Start screen transition
  const startTransitionAnim = useRef(new Animated.Value(0)).current;
  const [isStartTransitioning, setIsStartTransitioning] = useState(false);

  // Preview logs
  const { logs: previewLogs, clearLogs } = usePreviewLogs({
    enabled: serverStatus === 'checking',
    maxLogs: 12,
  });

  // Sync timer ref for throttling
  const smoothProgressSyncTimer = useRef<NodeJS.Timeout | null>(null);

  // ---- Persisted state wrappers ----
  const setIsStarting = (value: boolean) => {
    setIsStartingLocal(value);
    if (projectId) setPreviewStartupState(projectId, { isStarting: value });
  };

  const setStartingMessage = (value: string) => {
    setStartingMessageLocal(value);
    if (projectId) setPreviewStartupState(projectId, { startingMessage: value });
  };

  const setStartupSteps = (value: Array<{ id: string; label: string; status: 'pending' | 'active' | 'complete' | 'error' }>) => {
    setStartupStepsLocal(value);
    if (projectId) setPreviewStartupState(projectId, { startupSteps: value });
  };

  const setCurrentStepId = (value: string | null) => {
    setCurrentStepIdLocal(value);
    if (projectId) setPreviewStartupState(projectId, { currentStepId: value });
  };

  const setSmoothProgress = (value: number | ((prev: number) => number)) => {
    const resolved = typeof value === 'function' ? value(smoothProgressRef.current) : value;
    smoothProgressRef.current = resolved;
    if (!smoothProgressSyncTimer.current) {
      smoothProgressSyncTimer.current = setTimeout(() => {
        smoothProgressSyncTimer.current = null;
        setSmoothProgressLocal(smoothProgressRef.current);
      }, 200);
    }
  };

  const setTargetProgress = (value: number) => {
    setTargetProgressLocal(value);
    if (projectId) setPreviewStartupState(projectId, { targetProgress: value });
  };

  const setDisplayedMessage = (value: string) => {
    setDisplayedMessageLocal(value);
    if (projectId) setPreviewStartupState(projectId, { displayedMessage: value });
  };

  const setPreviewError = (value: { message: string; timestamp: Date } | null) => {
    setPreviewErrorLocal(value);
    if (projectId) setPreviewStartupState(projectId, { previewError: value });
  };

  // ---- Loading messages ----
  const LOADING_MESSAGES: Record<string, string[]> = {
    analyzing: t('terminal:preview.loadingMessages.analyzing', { returnObjects: true }) as string[],
    cloning: t('terminal:preview.loadingMessages.cloning', { returnObjects: true }) as string[],
    detecting: t('terminal:preview.loadingMessages.detecting', { returnObjects: true }) as string[],
    booting: t('terminal:preview.loadingMessages.booting', { returnObjects: true }) as string[],
    ready: t('terminal:preview.loadingMessages.ready', { returnObjects: true }) as string[],
  };

  // ---- Effects ----

  // Cycling loading messages
  useEffect(() => {
    if (!currentStepId || serverStatus === 'stopped') return;
    const messages = LOADING_MESSAGES[currentStepId] || [startingMessage || "Elaborazione..."];
    let msgIndex = 0;
    setDisplayedMessage(messages[0]);
    const interval = setInterval(() => {
      msgIndex = (msgIndex + 1) % messages.length;
      setDisplayedMessage(messages[msgIndex]);
    }, 4000);
    return () => clearInterval(interval);
  }, [currentStepId, serverStatus]);

  // Smooth progress animation
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const stepRanges: Record<string, { min: number; max: number }> = {
      'analyzing': { min: 1, max: 12 },
      'cloning': { min: 12, max: 20 },
      'detecting': { min: 20, max: 28 },
      'warning': { min: 28, max: 32 },
      'booting': { min: 32, max: 45 },
      'install': { min: 45, max: 55 },
      'installing': { min: 45, max: 55 },
      'starting': { min: 55, max: 92 },
      'ready': { min: 92, max: 100 },
    };

    if (serverStatus === 'stopped') {
      setSmoothProgress(0);
      setTargetProgress(0);
    } else {
      interval = setInterval(() => {
        const prev = smoothProgressRef.current;
        let next: number;
        if (webViewReady) {
          next = Math.min(prev + 3, 100);
        } else {
          const range = currentStepId ? stepRanges[currentStepId] : { min: 0, max: 10 };
          if (!range) return;
          if (prev < range.min) {
            next = Math.min(prev + 0.5, range.min);
          } else if (prev < range.max) {
            const stepSize = range.max - range.min;
            const baseSpeed = isNextJsProject && currentStepId === 'starting' ? 0.008 : stepSize > 20 ? 0.02 : 0.08;
            const distToMax = range.max - prev;
            const speed = Math.max(0.005, baseSpeed * (distToMax / stepSize));
            next = Math.min(prev + speed, range.max - 0.5);
          } else {
            next = prev + 0.002;
          }
        }
        setSmoothProgress(next);
      }, 50);
    }
    return () => clearInterval(interval);
  }, [serverStatus, webViewReady, targetProgress, currentStepId, isNextJsProject]);

  // Pulse animation
  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    const shouldPulse = serverStatus === 'checking' || (serverStatus === 'running' && !webViewReady);
    if (shouldPulse) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.85, duration: 1500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ])
      );
      animation.start();
    } else {
      Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    }
    return () => animation?.stop();
  }, [serverStatus, webViewReady]);

  // Mask fade-out when webViewReady
  useEffect(() => {
    if (webViewReady) {
      Animated.timing(maskOpacityAnim, { toValue: 0, duration: 800, useNativeDriver: true }).start();
    } else {
      maskOpacityAnim.setValue(1);
    }
  }, [webViewReady]);

  // Reset transition when stopped
  useEffect(() => {
    if (serverStatus === 'stopped') {
      startTransitionAnim.setValue(0);
      setIsStartTransitioning(false);
    }
  }, [serverStatus]);

  // Clear persisted state when preview completes
  useEffect(() => {
    if (serverStatus === 'running' && webViewReady && projectId) {
      clearPreviewStartupState(projectId);
      const name = currentWorkstationName || t('terminal:preview.project');
      if (liveActivityService.isActivityActive()) {
        liveActivityService.endWithSuccess(name).catch(() => {});
      }
      liveActivityService.sendNotification(
        t('terminal:preview.ready'),
        t('terminal:preview.projectReadyForPreview', { name })
      ).catch(() => {});
    }
  }, [serverStatus, webViewReady, projectId]);

  // Live Activity refs for stable AppState callback
  const isStartingRef = useRef(isStarting);
  const currentStepIdRef = useRef(currentStepId);
  const startupStepsRef = useRef(startupSteps);
  const estimatedRemainingSecondsRef = useRef(estimatedRemainingSeconds);

  useEffect(() => { isStartingRef.current = isStarting; }, [isStarting]);
  useEffect(() => { currentStepIdRef.current = currentStepId; }, [currentStepId]);
  useEffect(() => { startupStepsRef.current = startupSteps; }, [startupSteps]);
  useEffect(() => { estimatedRemainingSecondsRef.current = estimatedRemainingSeconds; }, [estimatedRemainingSeconds]);

  // Start Live Activity in foreground
  useEffect(() => {
    if (isStarting && currentWorkstationName && !liveActivityService.isActivityActive()) {
      const currentStepLabel = startupSteps.find(s => s.id === currentStepId)?.label || t('terminal:preview.loading');
      liveActivityService.startPreviewActivity(currentWorkstationName, {
        remainingSeconds: estimatedRemainingSeconds || 240,
        currentStep: currentStepLabel,
        progress: smoothProgressRef.current / 100,
      }).catch(() => {});
    }
  }, [isStarting, currentWorkstationName]);

  // Monitor AppState
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      appState.current = nextAppState;
    });
    return () => subscription.remove();
  }, []);

  // Update Live Activity every 2s
  useEffect(() => {
    const updateInterval = setInterval(() => {
      if (liveActivityService.isActivityActive()) {
        try {
          const currentStepLabel = startupStepsRef.current.find(s => s.id === currentStepIdRef.current)?.label || t('terminal:preview.loading');
          liveActivityService.updatePreviewActivity({
            remainingSeconds: estimatedRemainingSecondsRef.current,
            currentStep: currentStepLabel,
            progress: smoothProgressRef.current / 100,
          });
        } catch {}
      }
    }, 2000);
    return () => clearInterval(updateInterval);
  }, []);

  // Estimated remaining seconds
  useEffect(() => {
    if (!isStarting) {
      setEstimatedRemainingSeconds(0);
      return;
    }
    const updateEstimate = () => {
      const estimatedTotalSeconds = isNextJsProject ? 480 : 240;
      const progressFraction = smoothProgressRef.current / 100;
      const elapsed = estimatedTotalSeconds * progressFraction;
      setEstimatedRemainingSeconds(Math.max(0, Math.round(estimatedTotalSeconds - elapsed)));
    };
    updateEstimate();
    const timer = setInterval(updateEstimate, 2000);
    return () => clearInterval(timer);
  }, [isStarting, isNextJsProject]);

  // Elapsed timer
  useEffect(() => {
    if (isStarting) {
      if (!startTimeRef.current) startTimeRef.current = Date.now();
      setElapsedSeconds(0);
      const timer = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
      return () => clearInterval(timer);
    } else {
      startTimeRef.current = null;
      setElapsedSeconds(0);
    }
  }, [isStarting]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (smoothProgressSyncTimer.current) clearTimeout(smoothProgressSyncTimer.current);
      try { liveActivityService.cleanup(); } catch {}
    };
  }, []);

  return {
    // State
    isStarting,
    startingMessage,
    startupSteps,
    currentStepId,
    smoothProgress,
    targetProgress,
    displayedMessage,
    previewError,
    isNextJsProject,
    elapsedSeconds,
    previewLogs,
    isStartTransitioning,
    isSendingReport,
    reportSent,
    recentLogsRef,
    // Animations
    pulseAnim,
    maskOpacityAnim,
    startTransitionAnim,
    smoothProgressRef,
    // Setters
    setIsStarting,
    setStartingMessage,
    setStartupSteps,
    setCurrentStepId,
    setSmoothProgress,
    setTargetProgress,
    setDisplayedMessage,
    setPreviewError,
    setIsNextJsProject,
    setIsStartTransitioning,
    setIsSendingReport,
    setReportSent,
    clearLogs,
  };
}
