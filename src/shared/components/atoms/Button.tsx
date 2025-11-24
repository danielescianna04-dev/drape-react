import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';

interface ButtonProps {
  /** Button label text */
  label: string;
  /** Callback when button is pressed */
  onPress: () => void;
  /** Button variant style */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Whether button is disabled */
  disabled?: boolean;
  /** Additional style for the button container */
  style?: ViewStyle;
  /** Additional style for the label text */
  labelStyle?: TextStyle;
  /** Accessibility label */
  accessibilityLabel?: string;
}

/**
 * Reusable button component with multiple variants
 * Used throughout the app for actions and interactions
 */
export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
  labelStyle,
  accessibilityLabel,
}) => {
  const getButtonStyle = () => {
    switch (variant) {
      case 'primary':
        return styles.primaryButton;
      case 'secondary':
        return styles.secondaryButton;
      case 'ghost':
        return styles.ghostButton;
      default:
        return styles.primaryButton;
    }
  };

  const getLabelStyle = () => {
    switch (variant) {
      case 'primary':
        return styles.primaryLabel;
      case 'secondary':
        return styles.secondaryLabel;
      case 'ghost':
        return styles.ghostLabel;
      default:
        return styles.primaryLabel;
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        getButtonStyle(),
        disabled && styles.disabledButton,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel || label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text style={[getLabelStyle(), disabled && styles.disabledLabel, labelStyle]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#8B7CF6',
  },
  secondaryButton: {
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
    borderWidth: 1,
    borderColor: '#8B7CF6',
  },
  ghostButton: {
    backgroundColor: 'transparent',
  },
  disabledButton: {
    opacity: 0.5,
  },
  primaryLabel: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  secondaryLabel: {
    fontSize: 15,
    color: '#8B7CF6',
    fontWeight: '600',
  },
  ghostLabel: {
    fontSize: 15,
    color: '#888',
    fontWeight: '500',
  },
  disabledLabel: {
    color: '#666',
  },
});
