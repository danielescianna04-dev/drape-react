import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../theme/colors';

interface ShortcutItem {
  keys: string;
  description: string;
  available: boolean;
}

/**
 * Component that displays available keyboard shortcuts for iPad users
 * Can be integrated into Settings, Help, or displayed as a modal
 */
export const KeyboardShortcutsInfo: React.FC = () => {
  // Only relevant on iOS (iPad with keyboard)
  if (Platform.OS !== 'ios') {
    return null;
  }

  const shortcuts: ShortcutItem[] = [
    {
      keys: '⌘ ↵',
      description: 'Send message',
      available: false, // Coming soon
    },
    {
      keys: '⇧ ↵',
      description: 'New line',
      available: true,
    },
    {
      keys: '⌘ /',
      description: 'Toggle terminal/AI mode',
      available: false, // Coming soon
    },
    {
      keys: '⌘ K',
      description: 'Focus search',
      available: false, // Coming soon
    },
    {
      keys: 'esc',
      description: 'Dismiss keyboard',
      available: true,
    },
  ];

  const availableShortcuts = shortcuts.filter(s => s.available);
  const comingSoonShortcuts = shortcuts.filter(s => !s.available);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="keyboard-outline" size={24} color={AppColors.primary} />
        <Text style={styles.title}>Keyboard Shortcuts</Text>
      </View>

      {availableShortcuts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available</Text>
          {availableShortcuts.map((shortcut, index) => (
            <ShortcutRow
              key={index}
              keys={shortcut.keys}
              description={shortcut.description}
              available={true}
            />
          ))}
        </View>
      )}

      {comingSoonShortcuts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Coming Soon</Text>
          {comingSoonShortcuts.map((shortcut, index) => (
            <ShortcutRow
              key={index}
              keys={shortcut.keys}
              description={shortcut.description}
              available={false}
            />
          ))}
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Full keyboard shortcut support requires additional native integration.
          More shortcuts will be available in future updates.
        </Text>
      </View>
    </View>
  );
};

interface ShortcutRowProps {
  keys: string;
  description: string;
  available: boolean;
}

const ShortcutRow: React.FC<ShortcutRowProps> = ({ keys, description, available }) => (
  <View style={[styles.shortcutRow, !available && styles.shortcutRowDisabled]}>
    <View style={styles.keyBadge}>
      <Text style={[styles.keyText, !available && styles.keyTextDisabled]}>{keys}</Text>
    </View>
    <Text style={[styles.descriptionText, !available && styles.descriptionTextDisabled]}>
      {description}
    </Text>
    {!available && (
      <View style={styles.comingSoonBadge}>
        <Text style={styles.comingSoonText}>Soon</Text>
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(20, 20, 25, 0.95)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F0F0F0',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  shortcutRowDisabled: {
    opacity: 0.5,
  },
  keyBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    minWidth: 60,
    alignItems: 'center',
  },
  keyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F0F0F0',
    fontFamily: Platform.select({
      ios: 'Menlo',
      default: 'monospace',
    }),
  },
  keyTextDisabled: {
    color: 'rgba(255, 255, 255, 0.4)',
  },
  descriptionText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginLeft: 16,
  },
  descriptionTextDisabled: {
    color: 'rgba(255, 255, 255, 0.4)',
  },
  comingSoonBadge: {
    backgroundColor: 'rgba(139, 124, 246, 0.15)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.3)',
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: '700',
    color: AppColors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  footer: {
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    lineHeight: 18,
    textAlign: 'center',
  },
});
