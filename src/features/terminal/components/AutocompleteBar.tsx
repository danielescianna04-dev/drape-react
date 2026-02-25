import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import type { Suggestion } from '../hooks/useAutocomplete';

interface AutocompleteBarProps {
  suggestions: Suggestion[];
  onSelect: (suggestion: Suggestion) => void;
}

const FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const TYPE_CONFIG: Record<Suggestion['type'], { label: string; color: string; bg: string }> = {
  keyword:  { label: 'K', color: '#569cd6', bg: 'rgba(86, 156, 214, 0.15)' },
  snippet:  { label: 'S', color: '#c586c0', bg: 'rgba(197, 134, 192, 0.15)' },
  variable: { label: 'V', color: '#4ec9b0', bg: 'rgba(78, 201, 176, 0.15)' },
  method:   { label: 'M', color: '#dcdcaa', bg: 'rgba(220, 220, 170, 0.15)' },
};

export const AutocompleteBar = React.memo(({ suggestions, onSelect }: AutocompleteBarProps) => {
  if (suggestions.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.scrollContent}
      >
        {suggestions.map((suggestion, idx) => {
          const config = TYPE_CONFIG[suggestion.type];
          return (
            <TouchableOpacity
              key={`${suggestion.type}-${suggestion.text}-${idx}`}
              style={styles.pill}
              activeOpacity={0.5}
              onPress={() => onSelect(suggestion)}
            >
              <View style={[styles.badge, { backgroundColor: config.bg }]}>
                <Text style={[styles.badgeText, { color: config.color }]}>{config.label}</Text>
              </View>
              <Text style={styles.pillText} numberOfLines={1}>{suggestion.text}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    height: 44,
    backgroundColor: '#0d0d0d',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  badge: {
    width: 18,
    height: 18,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: FONT,
    fontSize: 10,
    fontWeight: '700',
  },
  pillText: {
    fontFamily: FONT,
    fontSize: 13,
    color: '#d4d4d4',
    maxWidth: 160,
  },
});
