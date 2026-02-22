import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, TextStyle, ViewStyle } from 'react-native';

const DOT_SEQUENCE = ['.', '..', '...', '..', '.'];

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
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [dotIndex, setDotIndex] = useState(0);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();

    const dotInterval = setInterval(() => {
      setDotIndex(prev => (prev + 1) % DOT_SEQUENCE.length);
    }, 400);

    return () => {
      pulse.stop();
      clearInterval(dotInterval);
    };
  }, []);

  return (
    <Animated.View style={[containerStyle, { opacity: pulseAnim }]}>
      <Text style={textStyle}>
        {text}{DOT_SEQUENCE[dotIndex]}
      </Text>
    </Animated.View>
  );
};
