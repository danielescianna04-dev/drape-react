import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../theme/colors';
import { IconButton } from '../atoms';

interface PanelHeaderProps {
  /** Panel title */
  title: string;
  /** Icon name to display */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Icon color */
  iconColor?: string;
  /** Callback when close button is pressed */
  onClose: () => void;
  /** Additional action buttons to show on the right */
  rightActions?: React.ReactNode;
  /** Additional style for the container */
  style?: ViewStyle;
}

/**
 * Reusable panel header with title, icon, and close button
 * Used in all panel components (Settings, Secrets, Preview, etc.)
 */
export const PanelHeader: React.FC<PanelHeaderProps> = ({
  title,
  icon,
  iconColor = AppColors.primary,
  onClose,
  rightActions,
  style,
}) => {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.headerLeft}>
        {icon && <Ionicons name={icon} size={24} color={iconColor} />}
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <View style={styles.headerRight}>
        {rightActions}
        <IconButton
          iconName="close"
          size={22}
          color="#FFFFFF"
          onPress={onClose}
          style={styles.closeButton}
          accessibilityLabel="Close panel"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
});
