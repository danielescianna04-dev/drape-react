import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppColors } from '../theme/colors';

interface KeyboardShortcutHintProps {
  shortcut: string;
  description?: string;
  style?: any;
}

/**
 * Visual component to display keyboard shortcut hints
 * Example: <KeyboardShortcutHint shortcut="⌘ Enter" description="Send" />
 */
export const KeyboardShortcutHint: React.FC<KeyboardShortcutHintProps> = ({
  shortcut,
  description,
  style,
}) => {
  // Only show on iOS/macOS where keyboard shortcuts are common
  if (Platform.OS !== 'ios' && Platform.OS !== 'macos') {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      <View style={styles.shortcutBadge}>
        <Text style={styles.shortcutText}>{shortcut}</Text>
      </View>
      {description && (
        <Text style={styles.descriptionText}>{description}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shortcutBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  shortcutText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    fontFamily: Platform.select({
      ios: 'Menlo',
      default: 'monospace',
    }),
  },
  descriptionText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
  },
});

/**
 * Pre-defined keyboard shortcut hints for common actions
 */
export const KeyboardShortcuts = {
  Send: () => {
    const { t } = useTranslation('terminal');
    return <KeyboardShortcutHint shortcut="⌘ ↵" description={t('keyboardShortcuts.shortcuts.send_message.name')} />;
  },
  NewLine: () => {
    const { t } = useTranslation('terminal');
    return <KeyboardShortcutHint shortcut="⇧ ↵" description={t('keyboardShortcuts.shortcuts.new_line.name')} />;
  },
  ToggleMode: () => {
    const { t } = useTranslation('terminal');
    return <KeyboardShortcutHint shortcut="⌘ /" description={t('keyboardShortcuts.shortcuts.toggle_mode.name')} />;
  },
  Search: () => {
    const { t } = useTranslation('terminal');
    return <KeyboardShortcutHint shortcut="⌘ K" description={t('keyboardShortcuts.shortcuts.focus_search.name')} />;
  },
  Escape: () => {
    const { t } = useTranslation('terminal');
    return <KeyboardShortcutHint shortcut="esc" description={t('keyboardShortcuts.shortcuts.close_modal.name')} />;
  },
};
