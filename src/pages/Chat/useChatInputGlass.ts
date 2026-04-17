import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { applyGlassEffect, removeAllGlassEffects, removeGlassEffect } from '../../shared/components/NativeGlassView';

interface Params {
  tabId?: string;
  activeTabId?: string;
  isActiveTab: boolean;
  hasChatStarted: boolean;
  inputGlassRevealDelay: number;
  chatWelcomeVisible: boolean;
}

export const useChatInputGlass = ({
  tabId,
  activeTabId,
  isActiveTab,
  hasChatStarted,
  inputGlassRevealDelay,
  chatWelcomeVisible,
}: Params) => {
  const inputBarGlassId = useMemo(() => {
    const rawId = tabId ?? activeTabId ?? 'main';
    const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `inputBarGlass-${safeId}`;
  }, [tabId, activeTabId]);

  const lastGlassIdRef = useRef<string | null>(null);
  const lastApplyKeyRef = useRef<string | null>(null);
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [glassApplied, setGlassApplied] = useState(false);
  const glassAppliedRef = useRef(false);
  const debugCountsRef = useRef<Record<string, number>>({});
  const logGlassDebug = useCallback((name: string, payload?: Record<string, unknown>) => {
    const nextCount = (debugCountsRef.current[name] || 0) + 1;
    debugCountsRef.current[name] = nextCount;
    if (nextCount <= 25) {
      console.log('[ChatGlassDebug]', name, { count: nextCount, ...payload });
    }
  }, []);

  useEffect(() => {
    glassAppliedRef.current = glassApplied;
  }, [glassApplied]);

  const applyInputGlass = useCallback(async (prevId?: string | null) => {
    if (Platform.OS !== 'ios' || !isActiveTab) return;
    const applyKey = `${inputBarGlassId}:${prevId ?? 'none'}`;
    if (lastApplyKeyRef.current === applyKey && glassAppliedRef.current) {
      logGlassDebug('apply_skip_same_key', { applyKey, glassApplied: glassAppliedRef.current });
      return;
    }
    logGlassDebug('apply_start', { applyKey, prevId: prevId ?? null, glassApplied: glassAppliedRef.current });
    const ok = await applyGlassEffect(inputBarGlassId, 28);
    if (ok) {
      lastApplyKeyRef.current = applyKey;
      if (!glassAppliedRef.current) {
        glassAppliedRef.current = true;
        setGlassApplied(true);
      }
      logGlassDebug('apply_success', { applyKey });
      if (prevId && prevId !== inputBarGlassId) {
        if (removeTimerRef.current) {
          clearTimeout(removeTimerRef.current);
          removeTimerRef.current = null;
        }
        removeTimerRef.current = setTimeout(() => {
          removeGlassEffect(prevId);
        }, 32);
      }
    }
  }, [inputBarGlassId, isActiveTab, logGlassDebug]);

  useEffect(() => {
    logGlassDebug('effect_main', {
      inputBarGlassId,
      isActiveTab,
      hasChatStarted,
      inputGlassRevealDelay,
      chatWelcomeVisible,
      glassApplied: glassAppliedRef.current,
    });
    if (Platform.OS !== 'ios' || !isActiveTab) return;
    if (chatWelcomeVisible) {
      if (removeTimerRef.current) {
        clearTimeout(removeTimerRef.current);
        removeTimerRef.current = null;
      }
      lastApplyKeyRef.current = null;
      if (glassAppliedRef.current) {
        glassAppliedRef.current = false;
        setGlassApplied(false);
      }
      removeGlassEffect(inputBarGlassId);
      return;
    }

    let cancelled = false;
    const prevId = lastGlassIdRef.current;
    if (removeTimerRef.current) {
      clearTimeout(removeTimerRef.current);
      removeTimerRef.current = null;
    }

    lastApplyKeyRef.current = null;
    if (glassAppliedRef.current) {
      glassAppliedRef.current = false;
      setGlassApplied(false);
    }
    lastGlassIdRef.current = inputBarGlassId;

    const delays = hasChatStarted ? [0, 80, 200] : [inputGlassRevealDelay, inputGlassRevealDelay + 120];
    const timers = delays.map((ms) =>
      setTimeout(async () => {
        if (cancelled) return;
        await applyInputGlass(prevId);
        if (!cancelled) {
          logGlassDebug('effect_apply_success', {
            inputBarGlassId,
            prevId: prevId ?? null,
            delay: ms,
          });
        }
      }, ms),
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      if (removeTimerRef.current) {
        clearTimeout(removeTimerRef.current);
        removeTimerRef.current = null;
      }
      const idToRemove = inputBarGlassId;
      removeTimerRef.current = setTimeout(() => {
        removeGlassEffect(idToRemove);
      }, 180);
    };
  }, [applyInputGlass, chatWelcomeVisible, hasChatStarted, inputBarGlassId, inputGlassRevealDelay, isActiveTab, logGlassDebug]);

  useEffect(() => {
    logGlassDebug('effect_inactive_cleanup', {
      isActiveTab,
      glassApplied: glassAppliedRef.current,
    });
    if (!isActiveTab && Platform.OS === 'ios') {
      lastApplyKeyRef.current = null;
      removeAllGlassEffects();
      if (glassAppliedRef.current) {
        glassAppliedRef.current = false;
        setGlassApplied(false);
      }
    }
    return () => {
      if (Platform.OS === 'ios') {
        lastApplyKeyRef.current = null;
        removeAllGlassEffects();
      }
    };
  }, [isActiveTab, logGlassDebug]);

  return {
    inputBarGlassId,
    glassApplied,
    applyInputGlass,
  };
};
