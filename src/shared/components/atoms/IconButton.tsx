import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface IconButtonProps {
  /** Icon name from Ionicons */
  iconName: keyof typeof Ionicons.glyphMap;
  /** Icon size in pixels */
  size?: number;
  /** Icon color */
  color?: string;
  /** Callback when button is pressed */
  onPress: () => void;
  /** Whether button is in active/selected state */
  isActive?: boolean;
  /** Active state color */
  activeColor?: string;
  /** Additional style for the button container */
  style?: ViewStyle;
  /** Accessibility label */
  accessibilityLabel?: string;
}

/**
 * Reusable icon button component
 * Used throughout the app for toolbar icons, action buttons, etc.
 */
export const IconButton: React.FC<IconButtonProps> = ({
  iconName,
  size = 24,
  color = '#888',
  onPress,
  isActive = false,
  activeColor = '#8B7CF6',
  style,
  accessibilityLabel,
}) => {
  return (
    <TouchableOpacity
      style={[styles.button, isActive && styles.activeButton, style]}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel || iconName}
      accessibilityRole="button"
    >
      <Ionicons
        name={iconName}
        size={size}
        color={isActive ? activeColor : color}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeButton: {
    backgroundColor: 'rgba(139, 124, 246, 0.1)',
  },
});
