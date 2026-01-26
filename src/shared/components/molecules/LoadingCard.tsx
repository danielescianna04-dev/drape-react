import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';

interface LoadingCardProps {
  /** Card title (e.g., "Git Clone", "Processing") */
  title: string;
  /** Status message to display */
  status: string;
  /** Whether to show animated dots */
  showDots?: boolean;
}

/**
 * Card displaying a loading status with optional animated dots
 * Used for showing Git clone progress, AI processing, etc.
 */
export const LoadingCard: React.FC<LoadingCardProps> = ({
  title,
  status,
  showDots = false,
}) => {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    if (showDots) {
      const interval = setInterval(() => {
        setDotCount((prev) => (prev >= 3 ? 1 : prev + 1));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [showDots]);

  const renderContent = () => (
    <>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.label}>STATUS</Text>
          <Text style={styles.status}>
            {status}
            {showDots && '.'.repeat(dotCount)}
          </Text>
        </View>
      </View>
    </>
  );

  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView
        style={[styles.card, { backgroundColor: 'transparent', overflow: 'hidden' }]}
        interactive={true}
        effect="clear"
        colorScheme="dark"
      >
        {renderContent()}
      </LiquidGlassView>
    );
  }

  return (
    <View style={styles.card}>
      {renderContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  title: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  body: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(139, 124, 246, 0.6)',
    letterSpacing: 0.5,
    width: 48,
    flexShrink: 0,
  },
  status: {
    flex: 1,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: 'rgba(139, 124, 246, 0.9)',
    lineHeight: 18,
  },
});
