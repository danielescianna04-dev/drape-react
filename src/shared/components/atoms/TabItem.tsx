import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TabItemProps {
  /** Tab label/title */
  label: string;
  /** Whether this tab is currently active */
  isActive?: boolean;
  /** Callback when tab is pressed */
  onPress: () => void;
  /** Callback when close button is pressed */
  onClose?: () => void;
  /** Whether to show the close button */
  showClose?: boolean;
  /** Active tab background color */
  activeColor?: string;
  /** Inactive tab background color */
  inactiveColor?: string;
}

/**
 * Represents a single tab in a tab bar
 * Used for displaying terminal tabs, chat tabs, etc.
 */
export const TabItem: React.FC<TabItemProps> = ({
  label,
  isActive = false,
  onPress,
  onClose,
  showClose = true,
  activeColor = 'rgba(139, 124, 246, 0.2)',
  inactiveColor = 'rgba(255, 255, 255, 0.05)',
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.container,
        { backgroundColor: isActive ? activeColor : inactiveColor },
      ]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
    >
      <Text
        style={[styles.label, isActive && styles.activeLabel]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {showClose && onClose && (
        <TouchableOpacity
          style={styles.closeButton}
          onPress={(e) => {
            e.stopPropagation();
            onClose();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Close tab"
          accessibilityRole="button"
        >
          <Ionicons name="close" size={16} color="#888" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 4,
    minWidth: 80,
    maxWidth: 150,
  },
  label: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
    flex: 1,
  },
  activeLabel: {
    color: '#fff',
  },
  closeButton: {
    marginLeft: 8,
    padding: 2,
  },
});
