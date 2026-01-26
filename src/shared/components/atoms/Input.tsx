import React from 'react';
import { TextInput, View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';

interface InputProps {
  /** Input value */
  value: string;
  /** Callback when text changes */
  onChangeText: (text: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether input is multiline */
  multiline?: boolean;
  /** Number of lines for multiline input */
  numberOfLines?: number;
  /** Whether to auto-focus */
  autoFocus?: boolean;
  /** Keyboard type */
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  /** Auto-capitalize behavior */
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /** Auto-correct behavior */
  autoCorrect?: boolean;
  /** Additional style for container */
  style?: ViewStyle;
  /** Additional style for input */
  inputStyle?: TextStyle;
  /** Optional label text */
  label?: string;
  /** Whether input has error */
  hasError?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Whether to force disable glass effect */
  noGlass?: boolean;
}

/**
 * Reusable text input component
 * Used for forms, chat inputs, terminal inputs, etc.
 */
export const Input: React.FC<InputProps> = ({
  value,
  onChangeText,
  placeholder,
  multiline = false,
  numberOfLines = 1,
  autoFocus = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  autoCorrect = false,
  style,
  inputStyle,
  label,
  hasError = false,
  errorMessage,
  noGlass = false,
}) => {
  const renderInput = () => {
    // Standard input styles
    const inputStyles = [
      styles.input,
      multiline && styles.multilineInput,
      hasError && styles.errorInput,
      inputStyle,
    ];

    if (isLiquidGlassSupported && !noGlass) {
      // Flatten to get dimensions if needed, or just apply styles
      // LiquidGlassView acts as the container
      return (
        <LiquidGlassView
          style={[
            styles.input, 
            multiline && styles.multilineInput,
            hasError && styles.errorInput,
            { 
              backgroundColor: 'transparent',
              overflow: 'hidden',
              paddingHorizontal: 0, 
              paddingVertical: 0,
            },
            inputStyle && { height: (inputStyle as any).height } // Preserve height if explicitly set
          ]}
          interactive={true}
          effect="clear"
          colorScheme="dark"
        >
          <TextInput
            style={[
              styles.innerInput,
              multiline && styles.multilineInnerInput,
              inputStyle,
              { backgroundColor: 'transparent', borderWidth: 0, marginTop: 0, marginBottom: 0 } // Reset external styles
            ]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            multiline={multiline}
            numberOfLines={numberOfLines}
            autoFocus={autoFocus}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            autoCorrect={autoCorrect}
          />
        </LiquidGlassView>
      );
    }

    return (
      <TextInput
        style={inputStyles}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#666"
        multiline={multiline}
        numberOfLines={numberOfLines}
        autoFocus={autoFocus}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
      />
    );
  };

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      {renderInput()}
      {hasError && errorMessage && (
        <Text style={styles.errorText}>{errorMessage}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  label: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  innerInput: {
    flex: 1,
    width: '100%',
    height: '100%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  multilineInnerInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorInput: {
    borderColor: '#ff4444',
  },
  errorText: {
    fontSize: 12,
    color: '#ff4444',
    marginTop: 4,
  },
});
