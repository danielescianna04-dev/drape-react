import React, { useEffect, useCallback, memo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS, interpolate, useAnimatedReaction } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
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
}

export const VerticalCardSwitcher = ({
  children,
  onClose,
  trackpadTranslation,
  isTrackpadActive
}: Props) => {
  const { tabs, activeTabId, setActiveTab } = useTabStore();
  const scrollPosition = useSharedValue(0);
  const activeIndex = tabs.findIndex(t => t.id === activeTabId);
  const gestureStartPosition = useSharedValue(0);
  const isGestureActive = useSharedValue(false);

  const SPRING_CONFIG = {
    damping: 18,
    stiffness: 380,
    mass: 0.4,
    overshootClamping: false,
    restDisplacementThreshold: 0.01,
    restSpeedThreshold: 2,
  };

  // Smooth spring animation when active tab changes
  useEffect(() => {
    scrollPosition.value = withSpring(activeIndex * SCREEN_HEIGHT, SPRING_CONFIG);
  }, [activeIndex]);

  // React to trackpad translation on UI thread
  useAnimatedReaction(
    () => {
      if (!trackpadTranslation || !isTrackpadActive) return 0;
      return trackpadTranslation.value;
    },
    (currentValue) => {
      if (isTrackpadActive && isTrackpadActive.value && trackpadTranslation) {
        const basePosition = activeIndex * SCREEN_HEIGHT;
        // Multiply by 3 for higher sensitivity (3x more responsive)
        const amplifiedValue = currentValue * 3;
        scrollPosition.value = basePosition - amplifiedValue;
      }
    },
    [trackpadTranslation, isTrackpadActive, activeIndex]
  );


  return (
    <View style={styles.container}>
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
    </View>
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
