import React, { useEffect, memo, useCallback } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, interpolate, useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { useTabStore, Tab } from '../../../core/tabs/tabStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SIDEBAR_WIDTH = 50;
const CARD_WIDTH = SCREEN_WIDTH - SIDEBAR_WIDTH;

// Separate component for each card to avoid hooks issues
const CardView = memo(({
  tab,
  index,
  scrollPosition,
  children
}: {
  tab: Tab;
  index: number;
  scrollPosition: Animated.SharedValue<number>;
  children: (tab: Tab, isCardMode: boolean, cardDimensions: { width: number, height: number }) => React.ReactNode;
}) => {
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
      [0.85, 0.95, 0.85],
      'clamp'
    );

    const opacity = interpolate(
      scrollPosition.value,
      inputRange,
      [0.3, 1, 0.3],
      'clamp'
    );

    const tiltDeg = interpolate(
      scrollPosition.value,
      inputRange,
      [3, 0, -3],
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
    <Animated.View style={[styles.screen, animatedStyle]}>
      {children(tab, true, { width: CARD_WIDTH, height: SCREEN_HEIGHT })}
    </Animated.View>
  );
});

interface Props {
  children: (tab: Tab, isCardMode: boolean, cardDimensions: { width: number, height: number }) => React.ReactNode;
  onClose: () => void;
  trackpadTranslation?: Animated.SharedValue<number>;
  isTrackpadActive?: Animated.SharedValue<boolean>;
  skipZoomAnimation?: Animated.SharedValue<boolean>;
  onGestureEnd?: () => void;
}

export const VerticalCardSwitcher = ({
  children,
  onClose,
  trackpadTranslation,
  isTrackpadActive,
  skipZoomAnimation,
}: Props) => {
  const { tabs, activeTabId, setActiveTab } = useTabStore();
  const scrollPosition = useSharedValue(0);
  const activeIndex = tabs.findIndex(t => t.id === activeTabId);
  const zoomScale = useSharedValue(1); // For exit animation

  // Apple-style smooth spring config
  const SPRING_CONFIG = {
    damping: 20,
    stiffness: 180,
    mass: 0.8,
    overshootClamping: false,
    restDisplacementThreshold: 0.01,
    restSpeedThreshold: 0.5,
  };

  // Smooth spring animation when active tab changes
  useEffect(() => {
    scrollPosition.value = withSpring(activeIndex * SCREEN_HEIGHT, SPRING_CONFIG);
  }, [activeIndex]);

  // React to trackpad translation on UI thread
  useAnimatedReaction(
    () => {
      if (!trackpadTranslation || !isTrackpadActive) return { value: 0, active: false };
      return { value: trackpadTranslation.value, active: isTrackpadActive.value };
    },
    (current, previous) => {
      if (current.active && trackpadTranslation) {
        // User is actively dragging
        const basePosition = activeIndex * SCREEN_HEIGHT;
        const amplifiedValue = current.value * 3;
        scrollPosition.value = basePosition - amplifiedValue;
        zoomScale.value = 1; // Keep at scale 1 while dragging
      } else if (previous && previous.active && !current.active) {
        // User released - check if this was a quick flick
        if (skipZoomAnimation && skipZoomAnimation.value) {
          // Quick flick - minimal or no zoom
          zoomScale.value = withSpring(1.02, {
            damping: 60,
            stiffness: 600,
            mass: 0.1,
          });
        } else {
          // Slow drag - full zoom animation with slight overshoot
          zoomScale.value = withSpring(1.1, {
            damping: 22,
            stiffness: 90,
            mass: 1.2,
            overshootClamping: false, // Allow slight bounce for natural feel
          });
        }
      }
    },
    [trackpadTranslation, isTrackpadActive, activeIndex]
  );


  const containerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: zoomScale.value }],
    };
  });

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      <View style={styles.cardsWrapper}>
        {tabs.map((tab, index) => (
          <CardView
            key={tab.id}
            tab={tab}
            index={index}
            scrollPosition={scrollPosition}
            children={children}
          />
        ))}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    overflow: 'hidden',
    marginLeft: 50, // Space for icon bar
  },
  cardsWrapper: {
    flex: 1,
  },
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
});
