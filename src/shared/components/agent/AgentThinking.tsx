import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../theme/colors';

const colors = AppColors.dark;

interface AgentThinkingProps {
  iteration?: number;
  currentTool?: string;
  message?: string;
}

export const AgentThinking: React.FC<AgentThinkingProps> = ({
  iteration,
  currentTool,
  message,
}) => {
  const pulseAnim = useSharedValue(1);
  const dotAnim1 = useSharedValue(0);
  const dotAnim2 = useSharedValue(0);
  const dotAnim3 = useSharedValue(0);
  const scaleAnim = useSharedValue(0);

  useEffect(() => {
    // Entry animation
    scaleAnim.value = withSpring(1, {
      damping: 15,
      stiffness: 200,
    });

    // Pulse animation for icon
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 1000, easing: Easing.ease }),
        withTiming(1, { duration: 1000, easing: Easing.ease })
      ),
      -1,
      false
    );

    // Animated dots
    const dotAnimation = (delay: number) =>
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400, easing: Easing.ease }),
          withTiming(0, { duration: 400, easing: Easing.ease })
        ),
        -1,
        false
      );

    setTimeout(() => {
      dotAnim1.value = dotAnimation(0);
    }, 0);

    setTimeout(() => {
      dotAnim2.value = dotAnimation(0);
    }, 200);

    setTimeout(() => {
      dotAnim3.value = dotAnimation(0);
    }, 400);
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const dot1Style = useAnimatedStyle(() => ({
    opacity: dotAnim1.value,
  }));

  const dot2Style = useAnimatedStyle(() => ({
    opacity: dotAnim2.value,
  }));

  const dot3Style = useAnimatedStyle(() => ({
    opacity: dotAnim3.value,
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Icon with pulse */}
      <View style={styles.iconContainer}>
        <Animated.View style={[styles.iconPulse, pulseStyle]}>
          <Ionicons name="radio-button-on" size={10} color={colors.primary} />
        </Animated.View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Thinking</Text>
          <View style={styles.dots}>
            <Animated.View style={[styles.dot, dot1Style]} />
            <Animated.View style={[styles.dot, dot2Style]} />
            <Animated.View style={[styles.dot, dot3Style]} />
          </View>
        </View>

        {iteration !== undefined && (
          <Text style={styles.iteration}>Iteration {iteration}</Text>
        )}

        {currentTool && (
          <View style={styles.toolBadge}>
            <Ionicons name="hammer" size={12} color={colors.primary} />
            <Text style={styles.toolText}>{currentTool}</Text>
          </View>
        )}

        {message && <Text style={styles.message}>{message}</Text>}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    marginVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.backgroundDepth2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPulse: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  dots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  iteration: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  toolBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  toolText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  message: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
