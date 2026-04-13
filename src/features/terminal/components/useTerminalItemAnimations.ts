import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TerminalItem, TerminalItemType as ItemType } from '../../../shared/types';

// Module-level: each new thinking indicator picks the next phrase, never repeats "Thinking" every time
const THINKING_PHRASES = ['thinking'];
let _globalPhraseIndex = Math.floor(Math.random() * THINKING_PHRASES.length);

export function useTerminalItemAnimations(
  item: TerminalItem,
  showThinking: boolean | undefined,
  isExecuting: boolean | undefined,
  isLoading: boolean,
) {
  const { t } = useTranslation();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [dotCount, setDotCount] = useState(1);

  // Animation effect - fade in and slide
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Animated dots for loading state
  useEffect(() => {
    if (item?.type === ItemType.LOADING) {
      const interval = setInterval(() => {
        setDotCount((prev) => (prev >= 3 ? 1 : prev + 1));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [item?.type]);

  const thinkingDotsPhase = useRef(new Animated.Value(0)).current;
  // Native-driver clock for thinking animations (dots + pulse)
  useEffect(() => {
    const shouldAnimateThinkingDots = showThinking && !item?.content;
    if (!shouldAnimateThinkingDots) {
      thinkingDotsPhase.setValue(0);
      return;
    }

    const dotsAnimation = Animated.loop(
      Animated.timing(thinkingDotsPhase, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    dotsAnimation.start();

    return () => {
      dotsAnimation.stop();
      thinkingDotsPhase.setValue(0);
    };
  }, [showThinking, item?.content, thinkingDotsPhase]);

  const thinkingPulseOpacity = thinkingDotsPhase.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.95, 0.32, 0.95],
    extrapolate: 'clamp',
  });

  const thinkingDotOpacity1 = thinkingDotsPhase.interpolate({
    inputRange: [0, 0.01, 0.34, 0.67, 1],
    outputRange: [0.25, 1, 1, 1, 0.25],
    extrapolate: 'clamp',
  });
  const thinkingDotOpacity2 = thinkingDotsPhase.interpolate({
    inputRange: [0, 0.33, 0.34, 0.67, 1],
    outputRange: [0.25, 0.25, 1, 1, 0.25],
    extrapolate: 'clamp',
  });
  const thinkingDotOpacity3 = thinkingDotsPhase.interpolate({
    inputRange: [0, 0.66, 0.67, 1],
    outputRange: [0.25, 0.25, 1, 0.25],
    extrapolate: 'clamp',
  });

  const threadDotOpacity = showThinking
    ? thinkingPulseOpacity
    : isExecuting
      ? pulseAnim
      : 1;

  // Pulse animation for executing tools (thinking uses thinkingDotsPhase clock)
  useEffect(() => {
    if (isExecuting) {
      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnimation.start();
      return () => pulseAnimation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isExecuting]);

  // Pick a base thinking phrase per item, then rotate it slowly while waiting
  const [currentPhrase] = useState(() => {
    const phrase = THINKING_PHRASES[_globalPhraseIndex % THINKING_PHRASES.length];
    _globalPhraseIndex++;
    return phrase;
  });
  const [thinkingElapsedSec, setThinkingElapsedSec] = useState(0);

  useEffect(() => {
    const isActiveThinking = showThinking && !item?.content;
    if (!isActiveThinking) {
      setThinkingElapsedSec(0);
      return;
    }

    const rawTs = item?.timestamp as any;
    const startMs = rawTs instanceof Date
      ? rawTs.getTime()
      : (rawTs ? new Date(rawTs).getTime() : Date.now());

    const tick = () => {
      const next = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setThinkingElapsedSec(next);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [showThinking, item?.content, item?.timestamp]);

  const basePhraseIndex = Math.max(0, THINKING_PHRASES.indexOf(currentPhrase));
  const phraseOffset = Math.floor(thinkingElapsedSec / 2) % THINKING_PHRASES.length;
  const rotatingPhrase = THINKING_PHRASES[(basePhraseIndex + phraseOffset) % THINKING_PHRASES.length];
  const thinkingDisplayText = item?.thinkingContent
    ? item.thinkingContent
    : `${t('terminal:agent.thinking')}${thinkingElapsedSec >= 10 ? ` (${thinkingElapsedSec}s)` : ''}`;
  const dotSequence = ['.', '..', '...', '..', '.'];

  // Animated dots for executing tools (bounce: . → .. → ... → .. → .)
  const [execDotIndex, setExecDotIndex] = useState(0);
  useEffect(() => {
    if (isExecuting) {
      const interval = setInterval(() => {
        setExecDotIndex(prev => (prev + 1) % dotSequence.length);
      }, 400);
      return () => clearInterval(interval);
    } else {
      setExecDotIndex(0);
    }
  }, [isExecuting]);
  const executingDots = dotSequence[execDotIndex];

  return {
    fadeAnim,
    slideAnim,
    pulseAnim,
    dotCount,
    thinkingPulseOpacity,
    thinkingDotOpacity1,
    thinkingDotOpacity2,
    thinkingDotOpacity3,
    threadDotOpacity,
    thinkingDisplayText,
    executingDots,
  };
}
