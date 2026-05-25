import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  state: 'running' | 'done';
  title: string;
  subtitle: string;
}

/**
 * Lovable-style activity card shown in chat while the AI is running tools.
 * One persistent card morphs through statuses (Sto leggendo... → Sto
 * scrivendo... → Sto modificando...) instead of N technical cards. The
 * subtitle is the friendly Italian status from friendlyToolStatus().
 *
 * When the card is in `running` state a pulsing dot animates next to the
 * title; when `done` it shows a checkmark. The card is overwritten by the
 * model's final text reply as soon as token streaming begins.
 */
export const AgentActivityCard: React.FC<Props> = ({ state, title, subtitle }) => {
  // Pulse animation for the running-state indicator dot. Loops while running;
  // pauses naturally when the card is replaced by the final reply.
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (state !== 'running') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        {state === 'running' ? (
          <Animated.View style={[styles.dot, { opacity: pulse }]} />
        ) : (
          <View style={styles.iconWrap}>
            <Ionicons name="checkmark" size={12} color="#3FB950" />
          </View>
        )}
        <Text style={styles.title}>{title}</Text>
      </View>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
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
    color: 'rgba(230, 237, 243, 0.55)',
    fontStyle: 'italic',
    lineHeight: 18,
    marginLeft: 18, // align with title (past the dot)
  },
});
