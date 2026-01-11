import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { AppColors } from '../../theme/colors';
import { MessageContainer } from './MessageContainer';
import { CollapsibleDetails } from './CollapsibleDetails';
import type {
  ChatMessage,
  ToolMessage,
  ToolResultMessage,
  ThinkingMessage,
  TodoMessage,
  PlanMessage,
  TodoItem,
} from './types';

const colors = AppColors.dark;

// Helper to format timestamp
const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// ==================== ChatMessageComponent ====================

interface ChatMessageComponentProps {
  message: ChatMessage;
}

export function ChatMessageComponent({ message }: ChatMessageComponentProps) {
  const isUser = message.role === 'user';
  const backgroundColor = isUser ? '#2563EB' : colors.backgroundDepth2; // blue-600 : slate-700
  const textColor = isUser ? '#FFFFFF' : colors.textPrimary;

  return (
    <MessageContainer alignment={isUser ? 'right' : 'left'} backgroundColor={backgroundColor}>
      <View style={styles.chatHeader}>
        <Text style={[styles.chatRole, { color: isUser ? '#DBEAFE' : colors.textSecondary }]}>
          {isUser ? 'User' : 'Claude'}
        </Text>
        <Text style={[styles.timestamp, { color: isUser ? '#BFDBFE' : colors.textTertiary }]}>
          {formatTimestamp(message.timestamp)}
        </Text>
      </View>
      <Text style={[styles.chatContent, { color: textColor }]}>{message.content}</Text>
    </MessageContainer>
  );
}

// ==================== ToolMessageComponent ====================

interface ToolMessageComponentProps {
  message: ToolMessage;
}

export function ToolMessageComponent({ message }: ToolMessageComponentProps) {
  return (
    <MessageContainer alignment="left" backgroundColor="rgba(16, 185, 129, 0.15)">
      <View style={styles.toolHeader}>
        <View style={styles.toolIcon}>
          <Text style={styles.toolIconText}>🔧</Text>
        </View>
        <Text style={[styles.toolText, { color: '#059669' }]}>{message.content}</Text>
      </View>
    </MessageContainer>
  );
}

// ==================== ToolResultMessageComponent ====================

interface ToolResultMessageComponentProps {
  message: ToolResultMessage;
}

export function ToolResultMessageComponent({ message }: ToolResultMessageComponentProps) {
  let displayContent = message.content;
  let previewSummary: string | undefined;

  // Handle Edit tool - show file path in summary
  if (message.toolName === 'Edit' && message.toolUseResult?.structuredPatch) {
    previewSummary = `Modified ${message.summary}`;
  }

  // Handle Bash tool - show command in summary
  else if (message.toolName === 'Bash') {
    const stdout = message.toolUseResult?.stdout as string | undefined;
    const stderr = message.toolUseResult?.stderr as string | undefined;
    if (stderr?.trim()) {
      previewSummary = 'Error';
    } else if (stdout) {
      previewSummary = 'Success';
    }
  }

  return (
    <CollapsibleDetails
      label={message.toolName}
      details={displayContent}
      badge={message.summary}
      icon={<Text style={styles.checkIcon}>✓</Text>}
      colorScheme={{
        header: '#059669', // emerald-700
        content: '#047857', // emerald-700
        border: '#A7F3D0', // emerald-200
        bg: 'rgba(16, 185, 129, 0.08)', // emerald-50/80
      }}
      previewSummary={previewSummary}
      maxPreviewLines={5}
      showPreview={['Bash', 'Edit', 'Grep'].includes(message.toolName)}
    />
  );
}

// ==================== ThinkingMessageComponent ====================

interface ThinkingMessageComponentProps {
  message: ThinkingMessage;
}

export function ThinkingMessageComponent({ message }: ThinkingMessageComponentProps) {
  return (
    <CollapsibleDetails
      label="Claude's Reasoning"
      details={message.content}
      badge="thinking"
      icon={<Text style={styles.thinkingIcon}>💭</Text>}
      colorScheme={{
        header: '#7C3AED', // purple-700
        content: '#9333EA', // purple-600
        border: '#DDD6FE', // purple-200
        bg: 'rgba(139, 92, 246, 0.1)', // purple-50/60
      }}
      defaultExpanded={true}
    />
  );
}

// ==================== TodoMessageComponent ====================

interface TodoMessageComponentProps {
  message: TodoMessage;
}

export function TodoMessageComponent({ message }: TodoMessageComponentProps) {
  const getStatusIcon = (status: TodoItem['status']) => {
    switch (status) {
      case 'completed':
        return '✅';
      case 'in_progress':
        return '🔄';
      case 'pending':
      default:
        return '⏳';
    }
  };

  const getStatusColor = (status: TodoItem['status']) => {
    switch (status) {
      case 'completed':
        return '#059669'; // green-700
      case 'in_progress':
        return '#2563EB'; // blue-700
      case 'pending':
      default:
        return colors.textSecondary;
    }
  };

  const completedCount = message.todos.filter((t) => t.status === 'completed').length;

  return (
    <MessageContainer alignment="left" backgroundColor="rgba(245, 158, 11, 0.12)">
      <View style={styles.todoHeader}>
        <View style={styles.todoHeaderLeft}>
          <View style={styles.todoIcon}>
            <Text style={styles.todoIconText}>📋</Text>
          </View>
          <Text style={[styles.todoTitle, { color: '#B45309' }]}>Todo List Updated</Text>
        </View>
        <Text style={[styles.timestamp, { color: '#D97706' }]}>
          {formatTimestamp(message.timestamp)}
        </Text>
      </View>

      <View style={styles.todoList}>
        {message.todos.map((todo, index) => (
          <View key={index} style={styles.todoItem}>
            <Text style={styles.todoStatusIcon}>{getStatusIcon(todo.status)}</Text>
            <View style={styles.todoContent}>
              <Text style={[styles.todoText, { color: getStatusColor(todo.status) }]}>
                {todo.content}
              </Text>
              {todo.status === 'in_progress' && (
                <Text style={[styles.todoActiveForm, { color: '#D97706' }]}>
                  {todo.activeForm}
                </Text>
              )}
            </View>
          </View>
        ))}
      </View>

      <Text style={[styles.todoProgress, { color: '#B45309' }]}>
        {completedCount} of {message.todos.length} completed
      </Text>
    </MessageContainer>
  );
}

// ==================== PlanMessageComponent ====================

interface PlanMessageComponentProps {
  message: PlanMessage;
}

export function PlanMessageComponent({ message }: PlanMessageComponentProps) {
  return (
    <MessageContainer alignment="left" backgroundColor="rgba(59, 130, 246, 0.1)">
      <View style={styles.planHeader}>
        <View style={styles.planHeaderLeft}>
          <View style={styles.planIcon}>
            <Text style={styles.planIconText}>📋</Text>
          </View>
          <Text style={[styles.planTitle, { color: '#1E40AF' }]}>Ready to code?</Text>
        </View>
        <Text style={[styles.timestamp, { color: '#2563EB' }]}>
          {formatTimestamp(message.timestamp)}
        </Text>
      </View>

      <View style={styles.planContent}>
        <Text style={[styles.planLabel, { color: '#1E3A8A' }]}>Here is Claude's plan:</Text>
        <View style={styles.planBox}>
          <Text style={[styles.planText, { color: '#1E3A8A' }]}>{message.plan}</Text>
        </View>
      </View>
    </MessageContainer>
  );
}

// ==================== LoadingComponent ====================

export function LoadingComponent() {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 1000,
        easing: Easing.linear,
      }),
      -1 // Infinite repeat
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value}deg` }],
    };
  });

  return (
    <MessageContainer alignment="left" backgroundColor={colors.backgroundDepth2}>
      <View style={styles.loadingContainer}>
        <Text style={[styles.loadingRole, { color: colors.textSecondary }]}>Claude</Text>
        <View style={styles.loadingContent}>
          <Animated.View style={[styles.spinner, animatedStyle]} />
          <Text style={[styles.loadingText, { color: colors.textPrimary }]}>Thinking...</Text>
        </View>
      </View>
    </MessageContainer>
  );
}

// ==================== Styles ====================

const styles = StyleSheet.create({
  // Chat message styles
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 16,
  },
  chatRole: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.9,
  },
  timestamp: {
    fontSize: 11,
    opacity: 0.7,
  },
  chatContent: {
    fontSize: 13,
    fontFamily: 'Courier',
    lineHeight: 20,
  },

  // Tool message styles
  toolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolIcon: {
    width: 16,
    height: 16,
    backgroundColor: '#10B981',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolIconText: {
    fontSize: 10,
  },
  toolText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Collapsible icons
  checkIcon: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  thinkingIcon: {
    fontSize: 12,
  },

  // Todo message styles
  todoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 16,
  },
  todoHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  todoIcon: {
    width: 16,
    height: 16,
    backgroundColor: '#F59E0B',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todoIconText: {
    fontSize: 10,
  },
  todoTitle: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.9,
  },
  todoList: {
    gap: 4,
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  todoStatusIcon: {
    fontSize: 13,
    marginTop: 2,
  },
  todoContent: {
    flex: 1,
  },
  todoText: {
    fontSize: 13,
  },
  todoActiveForm: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  todoProgress: {
    fontSize: 11,
    marginTop: 12,
  },

  // Plan message styles
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 16,
  },
  planHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planIcon: {
    width: 16,
    height: 16,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planIconText: {
    fontSize: 10,
  },
  planTitle: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.9,
  },
  planContent: {
    gap: 8,
  },
  planLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  planBox: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.3)',
    borderRadius: 8,
    padding: 12,
  },
  planText: {
    fontSize: 13,
    fontFamily: 'Courier',
    lineHeight: 20,
  },

  // Loading styles
  loadingContainer: {
    gap: 8,
  },
  loadingRole: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.9,
  },
  loadingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  spinner: {
    width: 16,
    height: 16,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    borderTopColor: 'transparent',
    borderRadius: 8,
    // Animation handled by reanimated in actual implementation
  },
  loadingText: {
    fontSize: 13,
  },
});
