import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';

interface GlassCardProps {
  children: React.ReactNode;
  style?: any;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, style }) => {
  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView style={[styles.glassCardLiquid, style]} interactive={true} effect="regular" colorScheme="dark">
        {children}
      </LiquidGlassView>
    );
  }
  return (
    <View style={[styles.sectionCardWrap, styles.sectionCardDark, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  glassCardLiquid: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  sectionCardWrap: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  sectionCardDark: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
});
