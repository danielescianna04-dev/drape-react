import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';

interface MessageBubbleProps {
  /** Message content */
  content: string;
  /** Whether this is a user message or AI message */
  isUser?: boolean;
  /** Background color for user messages */
  userColor?: string;
  /** Background color for AI messages */
  aiColor?: string;
  /** Optional timestamp */
  timestamp?: string;
}

/**
 * Displays a chat message bubble
 * Used in chat interfaces to show user and AI messages
 */
export const MessageBubble: React.FC<MessageBubbleProps> = ({
  content,
  isUser = false,
  userColor = 'rgba(139, 124, 246, 0.2)',
  aiColor = 'rgba(255, 255, 255, 0.05)',
  timestamp,
}) => {
  const renderContent = () => (
    <>
      <Text style={styles.content}>{content}</Text>
      {timestamp && <Text style={styles.timestamp}>{timestamp}</Text>}
    </>
  );

  return (
    <View style={[styles.container, isUser && styles.userContainer]}>
      {isLiquidGlassSupported ? (
        <LiquidGlassView
          style={[
            styles.bubble,
            { backgroundColor: isUser ? userColor : aiColor, overflow: 'hidden', padding: 0 }
          ]}
          interactive={true}
          effect="clear"
          colorScheme="dark"
        >
          <View style={{ padding: 12 }}>
            {renderContent()}
          </View>
        </LiquidGlassView>
      ) : (
        <View
          style={[
            styles.bubble,
            { backgroundColor: isUser ? userColor : aiColor },
          ]}
        >
          {renderContent()}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'flex-start',
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  bubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: '80%',
  },
  content: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
});
