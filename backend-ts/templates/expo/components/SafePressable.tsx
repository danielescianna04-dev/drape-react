import React from 'react';
import { Pressable, PressableProps, Text, StyleSheet } from 'react-native';

/**
 * SafePressable — warns in dev mode when onPress is missing.
 * Drop-in replacement for Pressable in Expo/React Native projects.
 */
interface SafePressableProps extends PressableProps {
  label?: string;
}

export const SafePressable = ({ onPress, label, children, disabled, ...props }: SafePressableProps) => {
  if (__DEV__ && !onPress && !disabled) {
    const displayLabel = label || (typeof children === 'string' ? children : 'unknown');
    console.error(`[Drape] Dead pressable detected: "${displayLabel}" has no onPress handler. Add a real handler or remove the element.`);
  }
  return (
    <Pressable onPress={onPress} disabled={disabled} {...props}>
      {children}
    </Pressable>
  );
};

/**
 * SafeButton — styled button variant with dev-mode onPress check.
 */
interface SafeButtonProps extends PressableProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline';
}

export const SafeButton = ({ onPress, title, variant = 'primary', disabled, style, ...props }: SafeButtonProps) => {
  if (__DEV__ && !onPress && !disabled) {
    console.error(`[Drape] Dead button detected: "${title}" has no onPress handler. Add a real handler or remove the button.`);
  }

  const variantStyle = variant === 'primary' ? styles.primary
    : variant === 'outline' ? styles.outline
    : styles.secondary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.base, variantStyle, pressed && styles.pressed, disabled && styles.disabled, style as any]}
      {...props}
    >
      <Text style={[styles.text, variant === 'outline' && styles.outlineText]}>{title}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#8B5CF6' },
  secondary: { backgroundColor: '#374151' },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#8B5CF6' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  text: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  outlineText: { color: '#8B5CF6' },
});
