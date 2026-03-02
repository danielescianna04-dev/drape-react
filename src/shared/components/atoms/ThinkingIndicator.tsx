import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, TextStyle, View, ViewStyle } from 'react-native';

interface ThinkingIndicatorProps {
  text?: string;
  textStyle?: TextStyle;
  containerStyle?: ViewStyle;
}

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  text = 'Thinking',
  textStyle,
  containerStyle,
}) => {
  const dotsPhase = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const dots = Animated.loop(
      Animated.timing(dotsPhase, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    dots.start();

    return () => {
      dots.stop();
      dotsPhase.setValue(0);
    };
  }, [dotsPhase]);

  const pulseOpacity = dotsPhase.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.95, 0.32, 0.95],
    extrapolate: 'clamp',
  });

  const dot1Opacity = dotsPhase.interpolate({
    inputRange: [0, 0.01, 0.34, 0.67, 1],
    outputRange: [0.25, 1, 1, 1, 0.25],
    extrapolate: 'clamp',
  });
  const dot2Opacity = dotsPhase.interpolate({
    inputRange: [0, 0.33, 0.34, 0.67, 1],
    outputRange: [0.25, 0.25, 1, 1, 0.25],
    extrapolate: 'clamp',
  });
  const dot3Opacity = dotsPhase.interpolate({
    inputRange: [0, 0.66, 0.67, 1],
    outputRange: [0.25, 0.25, 1, 0.25],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={[containerStyle, { opacity: pulseOpacity, flexDirection: 'row', alignItems: 'center' }]}>
      <Text style={textStyle}>{text}</Text>
      <View style={{ flexDirection: 'row', marginLeft: 1 }}>
        <Animated.Text style={[textStyle, { opacity: dot1Opacity }]}>.</Animated.Text>
        <Animated.Text style={[textStyle, { opacity: dot2Opacity }]}>.</Animated.Text>
        <Animated.Text style={[textStyle, { opacity: dot3Opacity }]}>.</Animated.Text>
      </View>
    </Animated.View>
  );
};
