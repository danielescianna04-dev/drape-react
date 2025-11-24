import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface StatusBadgeProps {
  /** Status text to display */
  status: string;
  /** Whether status is active/running */
  isActive?: boolean;
  /** Active status color */
  activeColor?: string;
  /** Inactive status color */
  inactiveColor?: string;
}

/**
 * Displays a status indicator with a dot and text
 * Used for showing running/ready states, connection status, etc.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  isActive = false,
  activeColor = '#00D084',
  inactiveColor = '#666',
}) => {
  return (
    <View style={styles.container}>
      <View
        style={[
          styles.dot,
          { backgroundColor: isActive ? activeColor : inactiveColor },
        ]}
      />
      <Text style={styles.text}>{status}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  text: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
});
