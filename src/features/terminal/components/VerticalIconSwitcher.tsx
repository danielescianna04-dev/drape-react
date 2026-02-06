import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  SharedValue,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

interface IconItem {
  name: string;
  action: () => void;
}

interface Props {
  icons: IconItem[];
  onIconChange?: (index: number) => void;
}

interface AnimatedIconProps {
  icon: IconItem;
  index: number;
  translateY: SharedValue<number>;
  iconSize: number;
}

const AnimatedIcon = ({ icon, index, translateY, iconSize }: AnimatedIconProps) => {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const position = index * iconSize;
    const currentPosition = position + translateY.value;
    const distanceFromCenter = Math.abs(currentPosition);

    const opacity = interpolate(
      distanceFromCenter,
      [0, iconSize, iconSize * 2],
      [1, 0.4, 0],
      Extrapolate.CLAMP
    );

    const scale = interpolate(
      distanceFromCenter,
      [0, iconSize],
      [1, 0.7],
      Extrapolate.CLAMP
    );

    return {
      transform: [
        { translateY: translateY.value },
        { scale },
      ],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        styles.iconContainer,
        { top: index * iconSize },
        animatedStyle,
      ]}
    >
      <Ionicons
        name={icon.name as any}
        size={24}
        color="#FFFFFF"
      />
    </Animated.View>
  );
};

export const VerticalIconSwitcher = ({ icons, onIconChange }: Props) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const translateY = useSharedValue(0);
  const startY = useSharedValue(0);

  const ICON_SIZE = 44;
  const iconCount = icons.length;

  const handleIndexChange = (newIndex: number) => {
    setActiveIndex(newIndex);
    onIconChange?.(newIndex);
  };

  const executeAction = (index: number) => {
    icons[index]?.action();
  };

  const switchToIndex = (newIndex: number) => {
    'worklet';
    const targetY = -newIndex * ICON_SIZE;
    translateY.value = withSpring(targetY, {
      damping: 18,
      stiffness: 180,
      mass: 0.8,
    });
    runOnJS(handleIndexChange)(newIndex);
  };

  const tapGesture = Gesture.Tap()
    .onEnd((event) => {
      'worklet';
      // Calculate which icon is under the tap, accounting for translateY offset
      // Icon i visual center = (i * ICON_SIZE + ICON_SIZE/2) + translateY.value
      const tapY = event.y;
      let closestIndex = 0;
      let closestDist = Infinity;

      for (let i = 0; i < iconCount; i++) {
        const iconCenter = i * ICON_SIZE + ICON_SIZE / 2 + translateY.value;
        const dist = Math.abs(tapY - iconCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closestIndex = i;
        }
      }

      // Current active index from translateY
      const currentActive = Math.round(-translateY.value / ICON_SIZE);
      const clampedCurrent = Math.max(0, Math.min(iconCount - 1, currentActive));

      if (closestIndex !== clampedCurrent) {
        // Tapped a different icon — switch to it
        switchToIndex(closestIndex);
      } else {
        // Tapped the already-active icon — execute its action
        runOnJS(executeAction)(closestIndex);
      }
    });

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      const newTranslation = startY.value + event.translationY;
      const maxScroll = (iconCount - 1) * ICON_SIZE;

      if (newTranslation > 0) {
        translateY.value = newTranslation * 0.3;
      } else if (Math.abs(newTranslation) > maxScroll) {
        const overflow = Math.abs(newTranslation) - maxScroll;
        translateY.value = -(maxScroll + overflow * 0.3);
      } else {
        translateY.value = newTranslation;
      }
    })
    .onEnd((event) => {
      const velocity = event.velocityY;
      let targetIndex = Math.round(Math.abs(translateY.value) / ICON_SIZE);

      if (Math.abs(velocity) > 500) {
        const velocityBoost = velocity > 0 ? -1 : 1;
        targetIndex = Math.round((Math.abs(translateY.value) + velocityBoost * ICON_SIZE * 0.5) / ICON_SIZE);
      }

      targetIndex = Math.max(0, Math.min(iconCount - 1, targetIndex));

      const targetY = -targetIndex * ICON_SIZE;
      translateY.value = withSpring(targetY, {
        damping: 18,
        stiffness: 180,
        mass: 0.8,
        velocity: velocity,
      });

      const currentActive = Math.round(-startY.value / ICON_SIZE);
      if (targetIndex !== currentActive) {
        runOnJS(handleIndexChange)(targetIndex);
      }
    });

  const composedGesture = Gesture.Race(tapGesture, panGesture);

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={styles.wrapper}>
        <Animated.View style={styles.container}>
          {icons.map((icon, index) => (
            <AnimatedIcon
              key={index}
              icon={icon}
              index={index}
              translateY={translateY}
              iconSize={ICON_SIZE}
            />
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: 48,
    height: 132,
    backgroundColor: 'transparent',
  },
  container: {
    width: 48,
    height: 132,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    position: 'absolute',
    width: 48,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
