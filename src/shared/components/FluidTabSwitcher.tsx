import React, { ReactNode, useCallback, useEffect } from 'react';
import { StyleSheet, Dimensions, View } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Apple's spring configuration
const SPRING_CONFIG = {
  damping: 30,
  mass: 0.8,
  stiffness: 200,
  overshootClamping: false,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 2,
};

const SWIPE_VELOCITY_THRESHOLD = 500;
const SWIPE_DISTANCE_THRESHOLD = SCREEN_WIDTH * 0.35;

interface FluidTabSwitcherProps<T = any> {
  currentIndex: number;
  tabs: T[];
  renderTab: (tab: T) => ReactNode;
  onIndexChange: (newIndex: number) => void;
}

export const FluidTabSwitcher: React.FC<FluidTabSwitcherProps> = ({
  currentIndex,
  tabs,
  renderTab,
  onIndexChange,
}) => {
  // Single translateX that controls the entire track position
  const translateX = useSharedValue(-currentIndex * SCREEN_WIDTH);

  // Sync translateX when currentIndex changes externally
  useEffect(() => {
    translateX.value = withSpring(-currentIndex * SCREEN_WIDTH, SPRING_CONFIG);
  }, [currentIndex]);

  const handleIndexChange = useCallback((newIndex: number) => {
    onIndexChange(newIndex);
  }, [onIndexChange]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-25, 25])
    .onUpdate((event) => {
      'worklet';
      const basePosition = -currentIndex * SCREEN_WIDTH;
      const { translationX } = event;

      // Apply rubber band at edges
      let adjustedTranslation = translationX;
      if (currentIndex === 0 && translationX > 0) {
        adjustedTranslation = translationX * 0.2;
      } else if (currentIndex === tabs.length - 1 && translationX < 0) {
        adjustedTranslation = translationX * 0.2;
      }

      translateX.value = basePosition + adjustedTranslation;
    })
    .onEnd((event) => {
      'worklet';
      const { translationX, velocityX } = event;

      const shouldSwipeLeft =
        currentIndex < tabs.length - 1 &&
        (translationX < -SWIPE_DISTANCE_THRESHOLD || velocityX < -SWIPE_VELOCITY_THRESHOLD);

      const shouldSwipeRight =
        currentIndex > 0 &&
        (translationX > SWIPE_DISTANCE_THRESHOLD || velocityX > SWIPE_VELOCITY_THRESHOLD);

      let targetIndex = currentIndex;
      if (shouldSwipeLeft) {
        targetIndex = currentIndex + 1;
      } else if (shouldSwipeRight) {
        targetIndex = currentIndex - 1;
      }

      // Animate to target position
      translateX.value = withSpring(-targetIndex * SCREEN_WIDTH, SPRING_CONFIG, (finished) => {
        if (finished && targetIndex !== currentIndex) {
          runOnJS(handleIndexChange)(targetIndex);
        }
      });
    });

  // Animated style for the entire track
  const trackStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  // Only render visible tabs (current + adjacent) for performance
  const visibleTabs = React.useMemo(() => {
    const start = Math.max(0, currentIndex - 1);
    const end = Math.min(tabs.length, currentIndex + 2);
    return tabs.slice(start, end).map((tab, idx) => ({
      tab,
      actualIndex: start + idx,
    }));
  }, [tabs, currentIndex]);

  return (
    <View style={styles.container}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.track, trackStyle]}>
          {tabs.map((tab, index) => {
            // Check if this tab should be rendered
            const isVisible = visibleTabs.some(v => v.actualIndex === index);

            return (
              <View key={index} style={styles.page}>
                {isVisible ? renderTab(tab) : null}
              </View>
            );
          })}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  track: {
    flexDirection: 'row',
    height: '100%',
  },
  page: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
});
