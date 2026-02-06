/**
 * Keyboard Shortcuts Configuration
 *
 * Central location for all keyboard shortcut definitions.
 * Used for documentation, UI hints, and actual shortcut registration.
 */

export interface ShortcutDefinition {
  id: string;
  name: string;
  description: string;
  keys: {
    ios: string;
    android?: string;
  };
  category: 'chat' | 'navigation' | 'editing' | 'system';
  implemented: boolean;
  priority: 'high' | 'medium' | 'low';
}

/**
 * All keyboard shortcuts available in the app
 */
export const KEYBOARD_SHORTCUTS: ShortcutDefinition[] = [
  // Chat shortcuts
  {
    id: 'send_message',
    name: 'Send Message',
    description: 'Send the current message',
    keys: {
      ios: '⌘ ↵',
      android: 'Ctrl+Enter',
    },
    category: 'chat',
    implemented: false,
    priority: 'high',
  },
  {
    id: 'new_line',
    name: 'New Line',
    description: 'Insert a new line without sending',
    keys: {
      ios: '⇧ ↵',
      android: 'Shift+Enter',
    },
    category: 'chat',
    implemented: true,
    priority: 'high',
  },
  {
    id: 'toggle_mode',
    name: 'Toggle Mode',
    description: 'Switch between Terminal and AI mode',
    keys: {
      ios: '⌘ /',
      android: 'Ctrl+/',
    },
    category: 'chat',
    implemented: false,
    priority: 'medium',
  },

  // Navigation shortcuts
  {
    id: 'focus_search',
    name: 'Focus Search',
    description: 'Jump to search or command palette',
    keys: {
      ios: '⌘ K',
      android: 'Ctrl+K',
    },
    category: 'navigation',
    implemented: false,
    priority: 'medium',
  },
  {
    id: 'new_conversation',
    name: 'New Conversation',
    description: 'Start a new conversation',
    keys: {
      ios: '⌘ N',
      android: 'Ctrl+N',
    },
    category: 'navigation',
    implemented: false,
    priority: 'low',
  },
  {
    id: 'open_settings',
    name: 'Settings',
    description: 'Open settings screen',
    keys: {
      ios: '⌘ ,',
      android: 'Ctrl+,',
    },
    category: 'navigation',
    implemented: false,
    priority: 'low',
  },

  // Editing shortcuts
  {
    id: 'undo',
    name: 'Undo',
    description: 'Undo last change',
    keys: {
      ios: '⌘ Z',
      android: 'Ctrl+Z',
    },
    category: 'editing',
    implemented: false,
    priority: 'medium',
  },
  {
    id: 'redo',
    name: 'Redo',
    description: 'Redo last undone change',
    keys: {
      ios: '⌘ ⇧ Z',
      android: 'Ctrl+Shift+Z',
    },
    category: 'editing',
    implemented: false,
    priority: 'medium',
  },

  // System shortcuts
  {
    id: 'dismiss_keyboard',
    name: 'Dismiss Keyboard',
    description: 'Hide the on-screen keyboard',
    keys: {
      ios: 'esc',
      android: 'Esc',
    },
    category: 'system',
    implemented: true,
    priority: 'high',
  },
  {
    id: 'close_modal',
    name: 'Close Modal',
    description: 'Close the current modal or sheet',
    keys: {
      ios: 'esc',
      android: 'Esc',
    },
    category: 'system',
    implemented: false,
    priority: 'medium',
  },
];

/**
 * Get shortcuts by category
 */
export function getShortcutsByCategory(category: ShortcutDefinition['category']): ShortcutDefinition[] {
  return KEYBOARD_SHORTCUTS.filter(s => s.category === category);
}

/**
 * Get only implemented shortcuts
 */
export function getImplementedShortcuts(): ShortcutDefinition[] {
  return KEYBOARD_SHORTCUTS.filter(s => s.implemented);
}

/**
 * Get shortcuts by priority
 */
export function getShortcutsByPriority(priority: ShortcutDefinition['priority']): ShortcutDefinition[] {
  return KEYBOARD_SHORTCUTS.filter(s => s.priority === priority);
}

/**
 * Find shortcut by ID
 */
export function getShortcutById(id: string): ShortcutDefinition | undefined {
  return KEYBOARD_SHORTCUTS.find(s => s.id === id);
}
