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
  const FLICK_VELOCITY_THRESHOLD = 0.5; // Increased from 0.3
  const SENSITIVITY = 1; // 1:1 control for scroll-driven animation
  const DEADZONE = 6; // ignore micro-jitters

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

          // If we haven't moved enough, it's a tap. Reset state and avoid any animation.
          if (!hasMovedEnough.current) {
            // Set position directly (no spring) to avoid visible swipe animation on tap
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
          
          // --- Swipe logic ---
          const currentPos = lastPosition.current;
          const delta = currentPos - currentIndex;
          const vel = maxVelocity.current;
          let newIndex = activeIndex;
          
          if (Math.abs(vel) > FLICK_VELOCITY_THRESHOLD) {
            if (vel > 0 && activeIndex < tabs.length - 1) newIndex = activeIndex + 1;
            else if (vel < 0 && activeIndex > 0) newIndex = activeIndex - 1;
          }
          else if (Math.abs(delta) > SWIPE_THRESHOLD) {
            if (delta > SWIPE_THRESHOLD && activeIndex < tabs.length - 1) newIndex = activeIndex + 1;
            else if (delta < -SWIPE_THRESHOLD && activeIndex > 0) newIndex = activeIndex - 1;
          }
            
          // If tab is changing, setActiveTab will trigger this whole useEffect again, resetting state.
          if (newIndex !== activeIndex && tabs[newIndex]) {
            setActiveTab(tabs[newIndex].id);
          } else {
            // If not changing tab (snap-back), animate back and reset gesture-start state.
            scrollPosition.value = withSpring(currentIndex, SPRING_CONFIG);
            lastPosition.current = currentIndex; // Explicitly sync state after snap-back
            startY.current = 0;
            hasMovedEnough.current = false;
          }
          if (onScrollEnd) onScrollEnd();
          return;
        }
        
        // --- Gesture Start ---
        if (startY.current === 0) {
          startY.current = dy;
          lastTime.current = Date.now();
          touchCount.current = 0;
          lastPosition.current = activeIndex * SCREEN_HEIGHT;
          hasMovedEnough.current = false;
          maxVelocity.current = 0;
          firstDirection.current = null;
        }
        
        // --- Gesture Move ---
        const rawDelta = dy - startY.current;
        
        // Decide commit eligibility by threshold, but always follow finger for visual control
        if (!hasMovedEnough.current && Math.abs(rawDelta) > SWIPE_THRESHOLD) {
          hasMovedEnough.current = true;
        }
        
        const effectiveDelta = Math.abs(rawDelta) < DEADZONE ? 0 : rawDelta;
        const delta = effectiveDelta * SENSITIVITY;
        let newPos = activeIndex * SCREEN_HEIGHT - delta;
        // Clamp within bounds
        const minPos = 0;
        const maxPos = Math.max(0, tabs.length - 1) * SCREEN_HEIGHT;
        if (newPos < minPos) newPos = minPos;
        if (newPos > maxPos) newPos = maxPos;

        const now = Date.now();
        const timeDelta = now - lastTime.current;
        if (timeDelta > 0) {
          const posDelta = newPos - lastPosition.current;
          velocity.current = posDelta / timeDelta;
          if (Math.abs(velocity.current) > Math.abs(maxVelocity.current)) {
            maxVelocity.current = velocity.current;
          }
        }
        lastTime.current = now;
        
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