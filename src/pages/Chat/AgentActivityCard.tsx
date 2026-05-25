import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolateColor,
  cancelAnimation,
} from 'react-native-reanimated';

interface Props {
  state: 'running' | 'done';
  title: string;
  subtitle: string;
}

/**
 * Lovable-style activity card shown in chat while the AI is running tools.
 * One persistent card morphs through statuses (Sto leggendo... → Sto
 * scrivendo... → Sto modificando...) instead of N technical cards.
 *
 * Two animations:
 *   • Pulse dot (running): purple dot fades 0.4 → 1 → 0.4 every 1.4s.
 *   • Shimmer subtitle: subtitle text color interpolates across a
 *     bright→dim→bright cycle every 1.6s, giving a "shimmering" feel that
 *     reads as "the AI is actively working" without needing MaskedView.
 *
 * Both animations stop when state === 'done', and the card is replaced
 * entirely by the model's final text reply as soon as token streaming begins.
 */
export const AgentActivityCard: React.FC<Props> = ({ state, title, subtitle }) => {
  const pulse = useSharedValue(0.4);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (state !== 'running') {
      cancelAnimation(pulse);
      cancelAnimation(shimmer);
      pulse.value = 1;
      shimmer.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(pulse);
      cancelAnimation(shimmer);
    };
  }, [state, pulse, shimmer]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  // Subtitle shimmer: interpolate text color between a dim and a bright
  // shade. The eye reads the oscillation as a shimmer-like life signal.
  const subtitleStyle = useAnimatedStyle(() => {
    if (state === 'done') return { color: 'rgba(230, 237, 243, 0.55)' };
    const color = interpolateColor(
      shimmer.value,
      [0, 0.5, 1],
      [
        'rgba(230, 237, 243, 0.35)',
        'rgba(230, 237, 243, 0.95)',
        'rgba(230, 237, 243, 0.35)',
      ],
    );
    return { color };
  }, [state]);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        {state === 'running' ? (
          <Animated.View style={[styles.dot, dotStyle]} />
        ) : (
          <View style={styles.iconWrap}>
            <Ionicons name="checkmark" size={12} color="#3FB950" />
          </View>
        )}
        <Text style={styles.title}>{title}</Text>
      </View>
      {!!subtitle && (
        <Animated.Text style={[styles.subtitle, subtitleStyle]}>
          {subtitle}
        </Animated.Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#A78BFA',
  },
  iconWrap: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(63, 185, 80, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E6EDF3',
    letterSpacing: -0.1,
  },
  subtitle: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
    marginLeft: 18, // align with title (past the dot)
  },
});
