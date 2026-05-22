import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Animated, { useAnimatedStyle, interpolate, Extrapolate, SharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

const { height: SH } = Dimensions.get('window');
const AVAILABLE = SH * 0.50 - 8 - 88;

interface WelcomeScreenProps {
  keyboardHeight: SharedValue<number>;
  onSuggestionPress: (text: string) => void;
}

const ITEMS = [
  { icon: 'sparkles-outline' as const, key: 'suggestionFeature' },
  { icon: 'bug-outline' as const, key: 'suggestionBugs' },
  { icon: 'color-palette-outline' as const, key: 'suggestionDesign' },
  { icon: 'rocket-outline' as const, key: 'suggestionPerformance' },
];

export const WelcomeScreen = ({ keyboardHeight, onSuggestionPress }: WelcomeScreenProps) => {
  const { t } = useTranslation('chat');
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  if (renderCountRef.current <= 25) {
    console.log('[WelcomeScreenDebug] render', { count: renderCountRef.current });
  }

  const animStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [{ translateY: interpolate(keyboardHeight.value, [0, 300], [0, -80], Extrapolate.CLAMP) }],
    };
  });

  return (
    <Animated.View style={[styles.wrap, animStyle]}>
      <Text style={styles.title}>{t('welcomeTitle')}</Text>
      <Text style={styles.sub}>{t('welcomeSubtitle')}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    height: AVAILABLE,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginBottom: 4,
  },
  sub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    marginBottom: 0,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  chip: {},
  chipGlass: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  chipGlassFallback: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  chipText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
});
