import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors } from '../../theme/colors';
import { KEYBOARD_SHORTCUTS, getShortcutsByCategory } from '../../../constants/keyboardShortcuts';

interface KeyboardShortcutsModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Modal that displays all available keyboard shortcuts
 * Shows shortcuts organized by category with visual badges
 */
export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  visible,
  onClose,
}) => {
  const insets = useSafeAreaInsets();

  // Only show on iOS where keyboard shortcuts are more common
  if (Platform.OS !== 'ios') {
    return null;
  }

  const categories = [
    { id: 'chat', name: 'Chat', icon: 'chatbubbles' },
    { id: 'navigation', name: 'Navigation', icon: 'compass' },
    { id: 'editing', name: 'Editing', icon: 'create' },
    { id: 'system', name: 'System', icon: 'settings' },
  ] as const;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <BlurView intensity={100} tint="dark" style={styles.container}>
        <View style={[styles.content, { paddingTop: insets.top + 20 }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="keyboard-outline" size={28} color={AppColors.primary} />
              <Text style={styles.title}>Keyboard Shortcuts</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color="rgba(255, 255, 255, 0.7)" />
            </TouchableOpacity>
          </View>

          {/* Shortcuts by category */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + 20 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {categories.map((category) => {
              const shortcuts = getShortcutsByCategory(category.id);
              if (shortcuts.length === 0) return null;

              return (
                <View key={category.id} style={styles.category}>
                  <View style={styles.categoryHeader}>
                    <Ionicons
                      name={category.icon as any}
                      size={18}
                      color={AppColors.primary}
                    />
                    <Text style={styles.categoryName}>{category.name}</Text>
                  </View>

                  <View style={styles.shortcutsList}>
                    {shortcuts.map((shortcut) => (
                      <View key={shortcut.id} style={styles.shortcutRow}>
                        <View style={styles.shortcutInfo}>
                          <Text style={styles.shortcutName}>{shortcut.name}</Text>
                          <Text style={styles.shortcutDescription}>
                            {shortcut.description}
                          </Text>
                        </View>

                        <View style={styles.shortcutKeys}>
                          {!shortcut.implemented && (
                            <View style={styles.comingSoonBadge}>
                              <Text style={styles.comingSoonText}>Soon</Text>
                            </View>
                          )}
                          <View
                            style={[
                              styles.keyBadge,
                              !shortcut.implemented && styles.keyBadgeDisabled,
                            ]}
                          >
                            <Text
                              style={[
                                styles.keyText,
                                !shortcut.implemented && styles.keyTextDisabled,
                              ]}
                            >
                              {shortcut.keys.ios}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}

            {/* Info footer */}
            <View style={styles.footer}>
              <Ionicons
                name="information-circle-outline"
                size={16}
                color="rgba(255, 255, 255, 0.5)"
              />
              <Text style={styles.footerText}>
                Keyboard shortcuts work best with a physical keyboard on iPad.
                More shortcuts will be added in future updates.
              </Text>
            </View>
          </ScrollView>
        </View>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F0F0F0',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  category: {
    marginBottom: 32,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F0F0F0',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  shortcutsList: {
    gap: 12,
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  shortcutInfo: {
    flex: 1,
    marginRight: 12,
  },
  shortcutName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F0F0F0',
    marginBottom: 4,
  },
  shortcutDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 18,
  },
  shortcutKeys: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  keyBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    minWidth: 60,
    alignItems: 'center',
  },
  keyBadgeDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  keyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F0F0F0',
    fontFamily: Platform.select({
      ios: 'Menlo',
      default: 'monospace',
    }),
  },
  keyTextDisabled: {
    color: 'rgba(255, 255, 255, 0.3)',
  },
  comingSoonBadge: {
    backgroundColor: 'rgba(139, 124, 246, 0.2)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.4)',
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: '700',
    color: AppColors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 16,
    backgroundColor: 'rgba(139, 124, 246, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 124, 246, 0.2)',
    marginTop: 12,
  },
  footerText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 18,
  },
});
