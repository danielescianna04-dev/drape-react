import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle, View } from 'react-native';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../theme/colors';

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
  /** Whether to force disable glass effect */
  noGlass?: boolean;
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
  noGlass = false,
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

  const buttonStyle = [
    styles.button,
    getButtonStyle(),
    disabled && styles.disabledButton,
    style,
  ];

  // If Liquid Glass is supported and not disabled
  if (isLiquidGlassSupported && !noGlass && variant !== 'ghost') {
    // Flatten styles to extract border radius if present, otherwise default to 12
    const flattenedStyle = StyleSheet.flatten(buttonStyle);
    const borderRadius = (flattenedStyle.borderRadius as number) || 12;
    
    // For glass effect, we want the container to be the glass view
    // and the button inside to be transparent or semi-transparent
    return (
      <LiquidGlassView
        style={[
          buttonStyle,
          { 
            backgroundColor: 'transparent', // Let glass handle background
            overflow: 'hidden',
            borderRadius 
          }
        ]}
        interactive={true}
        effect="clear"
        colorScheme="dark"
      >
        <TouchableOpacity
          style={[
            styles.innerButton,
            {
              backgroundColor: variant === 'primary' ? 'rgba(155, 138, 255, 0.6)' : 'rgba(255, 255, 255, 0.1)'
            }
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
      </LiquidGlassView>
    );
  }

  return (
    <TouchableOpacity
      style={buttonStyle}
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
  innerButton: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  primaryButton: {
    backgroundColor: AppColors.primary,
  },
  secondaryButton: {
    backgroundColor: 'rgba(155, 138, 255, 0.2)',
    borderWidth: 1,
    borderColor: AppColors.primary,
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
    color: AppColors.primary,
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
