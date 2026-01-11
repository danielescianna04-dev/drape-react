import React from 'react';
import { View, StyleSheet } from 'react-native';

interface MessageContainerProps {
  alignment: 'left' | 'right' | 'center';
  backgroundColor: string;
  children: React.ReactNode;
}

export const MessageContainer: React.FC<MessageContainerProps> = ({
  alignment,
  backgroundColor,
  children,
}) => {
  const alignmentStyle =
    alignment === 'right'
      ? styles.alignRight
      : alignment === 'center'
      ? styles.alignCenter
      : styles.alignLeft;

  return (
    <View style={[styles.container, alignmentStyle]}>
      <View style={[styles.bubble, { backgroundColor }]}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    flexDirection: 'row',
  },
  alignLeft: {
    justifyContent: 'flex-start',
  },
  alignRight: {
    justifyContent: 'flex-end',
  },
  alignCenter: {
    justifyContent: 'center',
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
