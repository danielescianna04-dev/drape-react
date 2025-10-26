import React from 'react';
import { Dimensions } from 'react-native';
import Animated from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ContentRendererProps {
  children: (isCardMode: boolean, cardDimensions: { width: number, height: number }) => React.ReactNode;
  animatedStyle: any;
}

export const ContentRenderer = ({ children, animatedStyle }: ContentRendererProps) => {
  return (
    <Animated.View style={[{ flex: 1 }, animatedStyle]}>
      {children(false, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT })}
    </Animated.View>
  );
};
