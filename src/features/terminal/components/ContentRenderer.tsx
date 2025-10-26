import React from 'react';
import { Animated, Dimensions, View } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ContentRendererProps {
  children: (isCardMode: boolean, cardDimensions: { width: number, height: number }) => React.ReactNode;
  scaleAnim: Animated.Value;
}

export const ContentRenderer = ({ children, scaleAnim }: ContentRendererProps) => {
  // Always render children with full screen dimensions, scaled by scaleAnim
  return (
    <Animated.View style={{ flex: 1, transform: [{ scale: scaleAnim }] }}>
      {children(false, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT })}
    </Animated.View>
  );
};
