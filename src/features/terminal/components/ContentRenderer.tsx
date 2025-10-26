import React from 'react';
import { Animated, Dimensions, View } from 'react-native';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ContentRendererProps {
  children: (isCardMode: boolean, cardDimensions: { width: number, height: number }) => React.ReactNode;
  animatedStyle: any; // Change type to any or specific AnimatedStyle type
}

export const ContentRenderer = ({ children, animatedStyle }: ContentRendererProps) => {
  // Always render children with full screen dimensions, scaled by animatedStyle
  return (
    <Reanimated.Animated.View style={[{ flex: 1 }, animatedStyle]}>
      {children(false, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT })}
    </Reanimated.Animated.View>
  );
};
