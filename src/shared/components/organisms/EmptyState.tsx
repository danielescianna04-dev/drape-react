import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface EmptyStateProps {
  /** Icon to display */
  icon: keyof typeof Ionicons.glyphMap;
  /** Icon size */
  iconSize?: number;
  /** Icon color */
  iconColor?: string;
  /** Main title text */
  title: string;
  /** Subtitle/description text */
  subtitle?: string;
  /** Optional action button */
  action?: React.ReactNode;
  /** Additional style for container */
  style?: ViewStyle;
}

/**
 * Empty state component for displaying when there's no content
 * Used in lists, panels, and other containers that can be empty
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  iconSize = 48,
  iconColor = 'rgba(255, 255, 255, 0.2)',
  title,
  subtitle,
  action,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <Ionicons name={icon} size={iconSize} color={iconColor} />
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {action && <View style={styles.actionContainer}>{action}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.3)',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 18,
  },
  actionContainer: {
    marginTop: 24,
  },
});
