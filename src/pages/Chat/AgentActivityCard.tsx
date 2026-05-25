import React, { useEffect, useRef, useState } from 'react';
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
import { ACTIVITY_TITLES, renderStatusFromPool } from './chatToolFormatting';

interface Props {
  state: 'running' | 'done';
  poolKey: string;
  file: string;
}

const TITLE_INTERVAL_MS = 3800;
const SUBTITLE_INTERVAL_MS = 2500;

/**
 * Lovable-style activity card shown in chat while the AI is running tools.
 *
 * Self-rotating UX (independent from how often the backend emits tool events):
 *   • title rotates through ACTIVITY_TITLES every 3.8s ("Lavoro in corso",
 *     "Ci penso io", "Sto preparando tutto", …)
 *   • subtitle rotates through STATUS_POOLS[poolKey] every 2.5s, with {file}
 *     interpolated — picked at random each tick for variety.
 *   • shimmer on the subtitle (color α 0.35 ↔ 0.95, 1.6s cycle) plus a
 *     pulse dot on the title — both stop the moment state becomes 'done'.
 *
 * Why rotate inside the card and not on every backend event:
 *   opencode often runs ONE long-lived tool call (write_file on a 200-line
 *   HTML can take 60-120s) with no further tool events in between. If the
 *   card subtitle was driven only by toolStart it would freeze on the first
 *   pick. Rotation inside the card guarantees the user always sees life.
 */
export const AgentActivityCard: React.FC<Props> = ({ state, poolKey, file }) => {
  const pulse = useSharedValue(0.4);
  const shimmer = useSharedValue(0);

  // Rotating copy as plain state — picked from the pool on a timer.
  const [title, setTitle] = useState<string>(() => ACTIVITY_TITLES[0]);
  const [subtitle, setSubtitle] = useState<string>(() => renderStatusFromPool(poolKey, file));

  // When the pool key changes (a new tool started server-side) reset the
  // subtitle immediately so the user sees the change without waiting for the
  // next rotation tick.
  const poolRef = useRef<{ poolKey: string; file: string }>({ poolKey, file });
  useEffect(() => {
    if (poolRef.current.poolKey !== poolKey || poolRef.current.file !== file) {
      poolRef.current = { poolKey, file };
      setSubtitle(renderStatusFromPool(poolKey, file));
    } else {
      poolRef.current = { poolKey, file };
    }
  }, [poolKey, file]);

  // Self-rotation timers — only run while the card is in "running" state.
  useEffect(() => {
    if (state !== 'running') return;
    const subTimer = setInterval(() => {
      setSubtitle(renderStatusFromPool(poolRef.current.poolKey, poolRef.current.file));
    }, SUBTITLE_INTERVAL_MS);
    const titleTimer = setInterval(() => {
      setTitle((current) => {
        // Pick a NEW one (avoid repeating the same title back to back).
        const others = ACTIVITY_TITLES.filter((t) => t !== current);
        return others[Math.floor(Math.random() * others.length)];
      });
    }, TITLE_INTERVAL_MS);
    return () => {
      clearInterval(subTimer);
      clearInterval(titleTimer);
    };
  }, [state]);

  // Pulse + shimmer animations on the worklet thread (reanimated v4).
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
      <Animated.Text style={[styles.subtitle, subtitleStyle]}>
        {subtitle}
      </Animated.Text>
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
    marginLeft: 18,
  },
});
