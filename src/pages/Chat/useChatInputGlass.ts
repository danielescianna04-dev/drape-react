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
  const removeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [glassApplied, setGlassApplied] = useState(false);

  const applyInputGlass = useCallback(async (prevId?: string | null) => {
    if (Platform.OS !== 'ios' || !isActiveTab) return;
    const ok = await applyGlassEffect(inputBarGlassId, 28);
    if (ok) {
      setGlassApplied(true);
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
  }, [inputBarGlassId, isActiveTab]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !isActiveTab) return;
    if (chatWelcomeVisible) {
      if (removeTimerRef.current) {
        clearTimeout(removeTimerRef.current);
        removeTimerRef.current = null;
      }
      setGlassApplied(false);
      removeGlassEffect(inputBarGlassId);
      return;
    }

    let cancelled = false;
    const prevId = lastGlassIdRef.current;
    if (removeTimerRef.current) {
      clearTimeout(removeTimerRef.current);
      removeTimerRef.current = null;
    }

    setGlassApplied(false);
    lastGlassIdRef.current = inputBarGlassId;

    const delays = hasChatStarted ? [0, 80, 200] : [inputGlassRevealDelay, inputGlassRevealDelay + 120];
    const timers = delays.map((ms) =>
      setTimeout(async () => {
        if (cancelled) return;
        const ok = await applyGlassEffect(inputBarGlassId, 28);
        if (ok && !cancelled) {
          setGlassApplied(true);
          if (prevId && prevId !== inputBarGlassId) {
            removeGlassEffect(prevId);
          }
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
  }, [applyInputGlass, chatWelcomeVisible, hasChatStarted, inputBarGlassId, inputGlassRevealDelay, isActiveTab]);

  useEffect(() => {
    if (!isActiveTab && Platform.OS === 'ios') {
      removeAllGlassEffects();
      setGlassApplied(false);
    }
    return () => {
      if (Platform.OS === 'ios') removeAllGlassEffects();
    };
  }, [isActiveTab]);

  return {
    inputBarGlassId,
    glassApplied,
    applyInputGlass,
  };
};
