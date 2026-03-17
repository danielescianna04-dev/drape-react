import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';

interface TerminalAccessoryBarProps {
  onKeyPress: (data: string) => void;
}

const FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const SPECIAL_KEYS: { label: string; data: string }[] = [
  { label: 'Esc', data: '\x1b' },
  { label: 'Tab', data: '\t' },
];

const ARROW_KEYS: { label: string; data: string }[] = [
  { label: '\u2191', data: '\x1b[A' },
  { label: '\u2193', data: '\x1b[B' },
  { label: '\u2190', data: '\x1b[D' },
  { label: '\u2192', data: '\x1b[C' },
];

const CHAR_KEYS: { label: string; data: string }[] = [
  { label: '|', data: '|' },
  { label: '/', data: '/' },
  { label: '-', data: '-' },
  { label: '~', data: '~' },
  { label: '_', data: '_' },
];

/**
 * Compute the ctrl code for a given character.
 * Ctrl+A = 0x01, Ctrl+B = 0x02, ..., Ctrl+Z = 0x1A
 */
const ctrlCode = (char: string): string => {
  const upper = char.toUpperCase();
  const code = upper.charCodeAt(0);
  if (code >= 0x41 && code <= 0x5a) {
    return String.fromCharCode(code - 0x40);
  }
  return char;
};

export const TerminalAccessoryBar = React.memo(({ onKeyPress }: TerminalAccessoryBarProps) => {
  const [ctrlActive, setCtrlActive] = useState(false);

  const handleCtrlToggle = useCallback(() => {
    setCtrlActive((prev) => !prev);
  }, []);

  const handleKeyPress = useCallback(
    (data: string) => {
      if (ctrlActive) {
        onKeyPress(ctrlCode(data));
        setCtrlActive(false);
      } else {
        onKeyPress(data);
      }
    },
    [ctrlActive, onKeyPress],
  );

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.scrollContent}
      >
        {/* Special keys: Esc, Tab */}
        {SPECIAL_KEYS.map((key) => (
          <TouchableOpacity
            key={key.label}
            style={styles.key}
            activeOpacity={0.5}
            onPress={() => handleKeyPress(key.data)}
          >
            <Text style={styles.keyText}>{key.label}</Text>
          </TouchableOpacity>
        ))}

        {/* Ctrl modifier toggle */}
        <TouchableOpacity
          style={[styles.key, ctrlActive && styles.keyCtrlActive]}
          activeOpacity={0.5}
          onPress={handleCtrlToggle}
        >
          <Text style={[styles.keyText, ctrlActive && styles.keyTextCtrlActive]}>Ctrl</Text>
        </TouchableOpacity>

        {/* Separator */}
        <View style={styles.separator} />

        {/* Arrow keys */}
        {ARROW_KEYS.map((key) => (
          <TouchableOpacity
            key={key.label}
            style={styles.key}
            activeOpacity={0.5}
            onPress={() => handleKeyPress(key.data)}
          >
            <Text style={styles.keyText}>{key.label}</Text>
          </TouchableOpacity>
        ))}

        {/* Separator */}
        <View style={styles.separator} />

        {/* Common terminal characters */}
        {CHAR_KEYS.map((key) => (
          <TouchableOpacity
            key={key.label}
            style={styles.key}
            activeOpacity={0.5}
            onPress={() => handleKeyPress(key.data)}
          >
            <Text style={styles.keyText}>{key.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    height: 44,
    backgroundColor: '#1A1A1E',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  key: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#2A2A2E',
    borderRadius: 6,
    margin: 4,
  },
  keyText: {
    fontFamily: FONT,
    fontSize: 14,
    color: '#E0E0E0',
  },
  keyCtrlActive: {
    backgroundColor: '#7C3AED',
  },
  keyTextCtrlActive: {
    color: '#FFFFFF',
  },
  separator: {
    width: 1,
    height: 24,
    backgroundColor: '#333',
    marginHorizontal: 4,
  },
});
