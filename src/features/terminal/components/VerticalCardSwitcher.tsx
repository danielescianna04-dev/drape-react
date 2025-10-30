import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnUI, interpolate } from 'react-native-reanimated';
import { useTabStore, Tab } from '../../../core/tabs/tabStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  children: (tab: Tab, isCardMode: boolean, cardDimensions: { width: number, height: number }) => React.ReactNode;
  onClose: () => void;
  onScrollRef?: (scrollFn: (dy: number) => void) => void;
  onScrollEnd?: () => void;
}

export const VerticalCardSwitcher = ({ children, onClose, onScrollRef, onScrollEnd }: Props) => {
  const { tabs, activeTabId, setActiveTab } = useTabStore();
  const scrollPosition = useSharedValue(0);
  const activeIndex = tabs.findIndex(t => t.id === activeTabId);
  const startY = useRef(0);
  const lastPosition = useRef(0);
  const lastTime = useRef(0);
  const velocity = useRef(0);
  const maxVelocity = useRef(0);
  const touchCount = useRef(0);
  const firstDirection = useRef<'up' | 'down' | null>(null);
  const hasMovedEnough = useRef(false);
  const SWIPE_THRESHOLD = 40; // Drag must be at least 40px
  const FLICK_VELOCITY_THRESHOLD = 0.2; // consider flick from ~200 px/s
  const SENSITIVITY = 1; // 1:1 distance
  const DEADZONE = 1; // minimal deadzone
  const DRAG_VELOCITY_ACTIVATE = 0.02; // activate drag for very quick flicks (~20 px/s)
  const MIN_GAIN = 0.2; // softer response for small moves
  const FULL_GAIN_AT = 80; // px distance to reach 1:1 response
  const accumulatedRelative = { current: 0 } as React.MutableRefObject<number>;
  const totalDelta = { current: 0 } as React.MutableRefObject<number>;
  const gestureStartTime = { current: 0 } as React.MutableRefObject<number>;
  const lastDySample = { current: 0 } as React.MutableRefObject<number>;

  const SPRING_CONFIG = {
    damping: 28,
    stiffness: 240,
    mass: 0.9,
  };

  useEffect(() => {
    // When the active tab changes, reset all gesture state to ensure a clean slate.
    // This prevents state from a previous tab's gestures from leaking into the current one.
    scrollPosition.value = withSpring(activeIndex * SCREEN_HEIGHT, SPRING_CONFIG);
    startY.current = 0;
    lastPosition.current = activeIndex * SCREEN_HEIGHT;
    lastTime.current = 0;
    velocity.current = 0;
    maxVelocity.current = 0;
    touchCount.current = 0;
    firstDirection.current = null;
    hasMovedEnough.current = false;

    if (onScrollRef) {
      onScrollRef((dy: number) => {
        if (dy === -1) { // Gesture End
          const currentIndex = activeIndex * SCREEN_HEIGHT;

          // Decide via velocity OR distance; only then treat as tap
          const currentPos = lastPosition.current;
          const delta = currentPos - currentIndex;
          const elapsedMs = Math.max(1, Date.now() - gestureStartTime.current);
          const inferredVel = totalDelta.current / elapsedMs; // px per ms
          const vel = Math.abs(maxVelocity.current) > Math.abs(inferredVel) ? maxVelocity.current : inferredVel;
          let newIndex = activeIndex;

          // TAP: very small displacement, quick, and low velocity → snap instantly (no spring)
          const isTapByDistance = Math.abs(totalDelta.current) < 8 && Math.abs(delta) < DEADZONE;
          const isTapByTime = elapsedMs < 220;
          if ((isTapByDistance && isTapByTime) || (Math.abs(delta) < DEADZONE && Math.abs(vel) < 0.15)) {
            scrollPosition.value = currentIndex;
            lastPosition.current = currentIndex;
            startY.current = 0;
            hasMovedEnough.current = false;
            velocity.current = 0;
            maxVelocity.current = 0;
            lastTime.current = 0;
            if (onScrollEnd) onScrollEnd();
            return;
          }

          if (Math.abs(vel) > FLICK_VELOCITY_THRESHOLD) {
            if (vel > 0 && activeIndex < tabs.length - 1) newIndex = activeIndex + 1;
            else if (vel < 0 && activeIndex > 0) newIndex = activeIndex - 1;
          } else if (Math.abs(delta) > SWIPE_THRESHOLD) {
            if (delta > SWIPE_THRESHOLD && activeIndex < tabs.length - 1) newIndex = activeIndex + 1;
            else if (delta < -SWIPE_THRESHOLD && activeIndex > 0) newIndex = activeIndex - 1;
          }

          console.log(
            'VerticalCardSwitcher:end',
            JSON.stringify({
              activeIndex,
              delta: Math.round(delta),
              vel: Number(vel.toFixed(4)),
              maxVel: Number(maxVelocity.current.toFixed(4)),
              mode: 'hybrid',
              totalDelta: Math.round(totalDelta.current),
            })
          );

          if (newIndex !== activeIndex && tabs[newIndex]) {
            setActiveTab(tabs[newIndex].id);
          } else {
            // snap-back to current index
            scrollPosition.value = withSpring(currentIndex, SPRING_CONFIG);
            lastPosition.current = currentIndex;
          }
          // reset gesture state
          startY.current = 0;
          hasMovedEnough.current = false;
          velocity.current = 0;
          maxVelocity.current = 0;
          lastTime.current = 0;
          accumulatedRelative.current = 0;
          totalDelta.current = 0;
          gestureStartTime.current = 0;
          if (onScrollEnd) onScrollEnd();
          return;
        }
        
        // --- Gesture Start ---
        if (startY.current === 0) {
          // hybrid mode: track both absolute and relative deltas
          startY.current = dy;
          const nowStart = Date.now();
          lastTime.current = nowStart;
          gestureStartTime.current = nowStart;
          touchCount.current = 0;
          lastPosition.current = activeIndex * SCREEN_HEIGHT;
          hasMovedEnough.current = false;
          maxVelocity.current = 0;
          firstDirection.current = null;
          accumulatedRelative.current = 0;
          totalDelta.current = 0;
          lastDySample.current = dy;
        }
        
        // --- Gesture Move ---
        // compute delta in hybrid: accumulate relative and compare with absolute
        const step = dy - lastDySample.current;
        lastDySample.current = dy;
        // Heuristica: se dy sembra già un delta (|dy| molto più grande di |step|), somma dy; altrimenti usa lo step
        const relIncrement = Math.abs(dy) > Math.abs(step) * 2 ? dy : step;
        accumulatedRelative.current += relIncrement;
        totalDelta.current += relIncrement;
        const absDelta = dy - startY.current;
        const rawDelta = Math.abs(accumulatedRelative.current) > Math.abs(absDelta)
          ? accumulatedRelative.current
          : absDelta;
        
        // Decide commit eligibility by threshold, velocity o gesto rapido (tempo breve + delta minimo)
        const gestureElapsed = Date.now() - gestureStartTime.current;
        const quickGesture = gestureElapsed < 180 && Math.abs(totalDelta.current) > 12;
        if (!hasMovedEnough.current && (Math.abs(rawDelta) > SWIPE_THRESHOLD || Math.abs(velocity.current) > DRAG_VELOCITY_ACTIVATE || quickGesture)) {
          hasMovedEnough.current = true;
        }
        
        // Compute base position from raw delta (used for velocity calc)
        const baseDelta = rawDelta * SENSITIVITY;
        const basePos = activeIndex * SCREEN_HEIGHT - baseDelta;

        // Update instantaneous velocity BEFORE visual gating (avoid chicken-and-egg)
        const now = Date.now();
        const timeDelta = now - lastTime.current;
        let instantVel = 0;
        if (timeDelta > 0) {
          const posDeltaTemp = basePos - lastPosition.current;
          instantVel = posDeltaTemp / timeDelta;
          velocity.current = instantVel;
          if (Math.abs(velocity.current) > Math.abs(maxVelocity.current)) {
            maxVelocity.current = velocity.current;
          }
          console.log(
            'VerticalCardSwitcher:move',
            JSON.stringify({
              v: Number(velocity.current.toFixed(4)),
              maxV: Number(maxVelocity.current.toFixed(4)),
              rawDelta: Math.round(rawDelta),
              pos: Math.round(basePos),
              idx: activeIndex,
            })
          );
        }
        lastTime.current = now;

        // Gain compresso: piccoli movimenti molto attenuati; flick veloci mostrati ma contenuti
        const belowDeadzone = Math.abs(rawDelta) < DEADZONE;
        const fastFlick = Math.abs(instantVel) > DRAG_VELOCITY_ACTIVATE;
        const magnitude = Math.abs(rawDelta);
        let gainLinear = Math.min(1, Math.max(0, (magnitude - 10) / (FULL_GAIN_AT - 10)));
        let gain = gainLinear > 0 ? Math.max(MIN_GAIN, gainLinear) : (fastFlick ? MIN_GAIN : 0);
        // Se sotto deadzone e non è flick veloce, resta fermo
        if (belowDeadzone && !fastFlick) gain = 0;
        const effectiveDelta = rawDelta * gain;
        const delta = effectiveDelta * SENSITIVITY;
        let newPos = activeIndex * SCREEN_HEIGHT - delta;
        // Edge resistance instead of hard clamp
        const minPos = 0;
        const maxPos = Math.max(0, tabs.length - 1) * SCREEN_HEIGHT;
        if (newPos < minPos) {
          const overflow = minPos - newPos;
          newPos = minPos - overflow / 3;
        } else if (newPos > maxPos) {
          const overflow = newPos - maxPos;
          newPos = maxPos + overflow / 3;
        }

        scrollPosition.value = newPos;
        lastPosition.current = newPos;
      });
    }
  }, [activeIndex, onScrollRef, tabs, SENSITIVITY, SWIPE_THRESHOLD, FLICK_VELOCITY_THRESHOLD, SPRING_CONFIG, setActiveTab, onScrollEnd]);

  return (
    <View style={styles.container}>
      {tabs.map((tab, index) => {
        const animatedStyle = useAnimatedStyle(() => {
          const inputRange = [
            (index - 1) * SCREEN_HEIGHT,
            index * SCREEN_HEIGHT,
            (index + 1) * SCREEN_HEIGHT,
          ];
          
          const translateY = interpolate(
            scrollPosition.value,
            inputRange,
            [SCREEN_HEIGHT, 0, -SCREEN_HEIGHT],
            'clamp'
          );
          
          const scale = interpolate(
            scrollPosition.value,
            inputRange,
            [0.94, 1, 0.94],
            'clamp'
          );
          
          const opacity = interpolate(
            scrollPosition.value,
            inputRange,
            [0.35, 1, 0.35],
            'clamp'
          );

          // Subtle premium 3D tilt and depth
          const tiltDeg = interpolate(
            scrollPosition.value,
            inputRange,
            [6, 0, -6],
            'clamp'
          );

          const shadowOpacity = interpolate(
            scrollPosition.value,
            inputRange,
            [0.35, 0.12, 0.35],
            'clamp'
          );

          const elevation = interpolate(
            scrollPosition.value,
            inputRange,
            [8, 2, 8],
            'clamp'
          );
          
          return {
            transform: [{ translateY }, { scale }, { rotateX: `${tiltDeg}deg` }],
            opacity,
            shadowOpacity,
            elevation,
          } as any;
        });

        return (
          <Animated.View key={tab.id} style={[styles.screen, animatedStyle]}>
            {children(tab, true, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT })}
          </Animated.View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});