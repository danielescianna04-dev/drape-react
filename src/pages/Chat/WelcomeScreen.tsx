import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Animated, { useAnimatedStyle, interpolate, Extrapolate, SharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { useTranslation } from 'react-i18next';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface WelcomeScreenProps {
  keyboardHeight: SharedValue<number>;
  onSuggestionPress: (text: string) => void;
}

const SUGGESTIONS = [
  { icon: 'sparkles-outline' as const, key: 'suggestionFeature' },
  { icon: 'bug-outline' as const, key: 'suggestionBugs' },
  { icon: 'color-palette-outline' as const, key: 'suggestionDesign' },
  { icon: 'rocket-outline' as const, key: 'suggestionPerformance' },
];

const Chip = ({ icon, text, onPress }: { icon: string; text: string; onPress: () => void }) => {
  const inner = (
    <View style={styles.chipInner}>
      <Ionicons name={icon as any} size={15} color="rgba(255,255,255,0.45)" />
      <Text style={styles.chipText}>{text}</Text>
    </View>
  );

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      {isLiquidGlassSupported ? (
        <LiquidGlassView interactive effect="regular" colorScheme="dark" style={styles.chipGlass}>
          {inner}
        </LiquidGlassView>
      ) : (
        <View style={styles.chipFallback}>
          {inner}
        </View>
      )}
    </TouchableOpacity>
  );
};

export const WelcomeScreen = ({ keyboardHeight, onSuggestionPress }: WelcomeScreenProps) => {
  const { t } = useTranslation('chat');

  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const translateY = interpolate(
      keyboardHeight.value,
      [0, 300],
      [0, -70],
      Extrapolate.CLAMP
    );
    return { transform: [{ translateY }] };
  });

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Text style={styles.title}>{t('welcomeTitle')}</Text>
      <Text style={styles.subtitle}>{t('welcomeSubtitle')}</Text>

      <View style={styles.suggestions}>
        {SUGGESTIONS.map((s, idx) => (
          <Chip
            key={idx}
            icon={s.icon}
            text={t(s.key)}
            onPress={() => onSuggestionPress(t(s.key))}
          />
        ))}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: SCREEN_HEIGHT - 250,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    marginBottom: 28,
  },
  suggestions: {
    alignItems: 'center',
    gap: 8,
  },
  chipGlass: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  chipFallback: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  chipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    gap: 8,
  },
  chipText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
  },
});
