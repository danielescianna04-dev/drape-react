import { useEffect } from 'react';
import { Platform } from 'react-native';

type ShortcutHandler = () => void;

interface KeyboardShortcut {
  key: string;
  metaKey?: boolean;  // Cmd on Mac/iPad
  ctrlKey?: boolean;  // Ctrl on Windows/Android
  shiftKey?: boolean;
  altKey?: boolean;
  handler: ShortcutHandler;
  description?: string;
}

/**
 * Hook for handling physical keyboard shortcuts on iPad and Mac Catalyst
 *
 * Note: React Native has limited support for physical keyboard events.
 * For comprehensive keyboard shortcut support, consider using:
 * - react-native-keyevent
 * - react-native-key-command
 *
 * Currently, this hook provides a foundation for future keyboard shortcut
 * implementations. For now, shortcuts are primarily handled within TextInput
 * components using onKeyPress events.
 *
 * Common shortcuts to implement:
 * - Cmd/Ctrl + Enter: Send message
 * - Cmd/Ctrl + K: Focus search/command palette
 * - Cmd/Ctrl + /: Toggle terminal/AI mode
 * - Esc: Dismiss keyboard/close modals
 *
 * @param shortcuts Array of keyboard shortcut configurations
 * @param enabled Whether shortcuts are currently active (default: true)
 */
export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  enabled: boolean = true
) {
  useEffect(() => {
    // Only relevant on iOS (iPad with keyboard) and potentially macOS Catalyst
    if (Platform.OS !== 'ios' && Platform.OS !== 'macos') {
      return;
    }

    if (!enabled) {
      return;
    }

    // Future implementation: Register keyboard event listeners
    // This would require a native module or third-party library
    // For now, this serves as a placeholder for future enhancement

    console.log('[KeyboardShortcuts] Registered shortcuts:', shortcuts.map(s =>
      `${s.metaKey ? 'Cmd+' : ''}${s.ctrlKey ? 'Ctrl+' : ''}${s.shiftKey ? 'Shift+' : ''}${s.key}`
    ));

    return () => {
      // Cleanup: Unregister keyboard event listeners
      console.log('[KeyboardShortcuts] Unregistered shortcuts');
    };
  }, [shortcuts, enabled]);
}

/**
 * Helper to format keyboard shortcut for display
 * Example: formatShortcut({ key: 'Enter', metaKey: true }) => "⌘ Enter"
 */
export function formatShortcut(shortcut: Omit<KeyboardShortcut, 'handler'>): string {
  const parts: string[] = [];

  if (Platform.OS === 'ios' || Platform.OS === 'macos') {
    if (shortcut.metaKey) parts.push('⌘');
    if (shortcut.ctrlKey) parts.push('⌃');
    if (shortcut.shiftKey) parts.push('⇧');
    if (shortcut.altKey) parts.push('⌥');
  } else {
    if (shortcut.metaKey || shortcut.ctrlKey) parts.push('Ctrl');
    if (shortcut.shiftKey) parts.push('Shift');
    if (shortcut.altKey) parts.push('Alt');
  }

  parts.push(shortcut.key);

  return parts.join(Platform.OS === 'ios' || Platform.OS === 'macos' ? ' ' : '+');
}

/**
 * Common keyboard shortcuts used throughout the app
 */
export const COMMON_SHORTCUTS = {
  SEND_MESSAGE: { key: 'Enter', metaKey: true, description: 'Send message' },
  NEW_LINE: { key: 'Enter', shiftKey: true, description: 'New line' },
  DISMISS_KEYBOARD: { key: 'Escape', description: 'Dismiss keyboard' },
  TOGGLE_MODE: { key: '/', metaKey: true, description: 'Toggle terminal/AI mode' },
  FOCUS_SEARCH: { key: 'k', metaKey: true, description: 'Focus search' },
} as const;
