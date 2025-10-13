import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { TerminalItem as TerminalItemType, TerminalItemType as ItemType } from '../../../shared/types';
import { AppColors } from '../../../shared/theme/colors';

const colors = AppColors.dark;

interface Props {
  item: TerminalItemType;
}

export const TerminalItem = ({ item }: Props) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const getTextColor = () => {
    switch (item.type) {
      case ItemType.COMMAND:
        return AppColors.primary;
      case ItemType.ERROR:
        return AppColors.error;
      case ItemType.SYSTEM:
        return AppColors.warning;
      default:
        return colors.bodyText;
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {item.type === ItemType.COMMAND && (
        <View style={styles.commandRow}>
          <Text style={[styles.prompt, { color: AppColors.primary }]}>$</Text>
          <Text style={[styles.commandText, { color: colors.titleText }]}>
            {item.content}
          </Text>
        </View>
      )}

      {item.type === ItemType.OUTPUT && (
        <Text style={[styles.outputText, { color: getTextColor() }]}>
          {item.content}
        </Text>
      )}

      {item.type === ItemType.ERROR && (
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: AppColors.error }]}>
            {item.content}
          </Text>
          {item.errorDetails && (
            <Text style={[styles.errorDetails, { color: colors.bodyText }]}>
              {item.errorDetails}
            </Text>
          )}
        </View>
      )}

      {item.type === ItemType.SYSTEM && (
        <Text style={[styles.systemText, { color: AppColors.warning }]}>
          {item.content}
        </Text>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  commandRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  prompt: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginRight: 8,
  },
  commandText: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1,
  },
  outputText: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 20,
  },
  errorContainer: {
    gap: 8,
  },
  errorText: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 20,
  },
  errorDetails: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    opacity: 0.7,
  },
  systemText: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontStyle: 'italic',
  },
});
