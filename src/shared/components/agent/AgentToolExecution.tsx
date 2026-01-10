import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../theme/colors';
import SyntaxHighlighter from 'react-native-syntax-highlighter';
import { atomOneDark, atomOneLight } from 'react-syntax-highlighter/styles/hljs';

const colors = AppColors.dark;

interface ToolCall {
  id: string;
  tool: string;
  args: any;
  result?: any;
  status: 'pending' | 'running' | 'success' | 'error';
  description?: string;
}

interface AgentToolExecutionProps {
  toolCalls: ToolCall[];
  isThinking?: boolean;
}

export const AgentToolExecution: React.FC<AgentToolExecutionProps> = ({
  toolCalls,
  isThinking = false,
}) => {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const completedCount = toolCalls.filter(t => t.status === 'success').length;
  const hasResults = completedCount > 0;

  if (toolCalls.length === 0 && !isThinking) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="construct" size={18} color={colors.textSecondary} />
          <Text style={styles.headerTitle}>
            Tool Invocations
          </Text>
          {hasResults && (
            <Text style={styles.headerSubtitle}>
              ({completedCount} tool{completedCount !== 1 ? 's' : ''} used)
            </Text>
          )}
        </View>
      </View>

      {/* Tool Cards */}
      <View style={styles.toolsList}>
        {toolCalls.map((tool) => (
          <ToolCallCard
            key={tool.id}
            tool={tool}
            isExpanded={expandedTools.has(tool.id)}
            onToggle={() => {
              const newSet = new Set(expandedTools);
              if (newSet.has(tool.id)) {
                newSet.delete(tool.id);
              } else {
                newSet.add(tool.id);
              }
              setExpandedTools(newSet);
            }}
          />
        ))}
      </View>
    </View>
  );
};

interface ToolCallCardProps {
  tool: ToolCall;
  isExpanded: boolean;
  onToggle: () => void;
}

const ToolCallCard: React.FC<ToolCallCardProps> = ({ tool, isExpanded, onToggle }) => {
  const expandAnimation = useSharedValue(0);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (isExpanded) {
      setShowDetails(true);
      expandAnimation.value = withSpring(1, {
        damping: 20,
        stiffness: 300,
      });
    } else {
      expandAnimation.value = withTiming(0, { duration: 200 }, () => {
        setShowDetails(false);
      });
    }
  }, [isExpanded]);

  const expandStyle = useAnimatedStyle(() => {
    const height = interpolate(
      expandAnimation.value,
      [0, 1],
      [0, 500], // Max height for details
      Extrapolate.CLAMP
    );

    return {
      height,
      opacity: expandAnimation.value,
      overflow: 'hidden',
    };
  });

  const chevronStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          rotate: `${interpolate(expandAnimation.value, [0, 1], [0, 180])}deg`,
        },
      ],
    };
  });

  const getStatusIcon = () => {
    switch (tool.status) {
      case 'success':
        return <Ionicons name="checkmark-circle" size={20} color={colors.success} />;
      case 'error':
        return <Ionicons name="close-circle" size={20} color={colors.error} />;
      case 'running':
        return <Ionicons name="reload-circle" size={20} color={colors.primary} />;
      default:
        return <Ionicons name="ellipse-outline" size={20} color={colors.textTertiary} />;
    }
  };

  const getStatusColor = () => {
    switch (tool.status) {
      case 'success':
        return colors.success;
      case 'error':
        return colors.error;
      case 'running':
        return colors.primary;
      default:
        return colors.textTertiary;
    }
  };

  return (
    <View style={styles.toolCard}>
      {/* Tool Header - Always Visible */}
      <Pressable
        onPress={onToggle}
        style={styles.toolHeader}
      >
        <View style={styles.toolHeaderLeft}>
          {getStatusIcon()}
          <View style={styles.toolInfo}>
            <Text style={styles.toolName}>{tool.tool}</Text>
            {tool.description && (
              <Text style={styles.toolDescription} numberOfLines={1}>
                {tool.description}
              </Text>
            )}
          </View>
        </View>

        <Animated.View style={chevronStyle}>
          <Ionicons
            name="chevron-down"
            size={20}
            color={colors.textSecondary}
          />
        </Animated.View>
      </Pressable>

      {/* Tool Details - Collapsible */}
      {showDetails && (
        <Animated.View style={[styles.toolDetails, expandStyle]}>
          {/* Parameters Section */}
          <View style={styles.detailSection}>
            <Text style={styles.sectionLabel}>Parameters:</Text>
            <View style={styles.codeBlock}>
              <SyntaxHighlighter
                language="json"
                style={atomOneDark}
                customStyle={{
                  backgroundColor: 'transparent',
                  padding: 0,
                  margin: 0,
                  fontSize: 12,
                }}
                highlighter="hljs"
              >
                {JSON.stringify(tool.args, null, 2)}
              </SyntaxHighlighter>
            </View>
          </View>

          {/* Result Section */}
          {tool.result !== undefined && (
            <View style={styles.detailSection}>
              <Text style={styles.sectionLabel}>Result:</Text>
              <View style={styles.codeBlock}>
                <SyntaxHighlighter
                  language="json"
                  style={atomOneDark}
                  customStyle={{
                    backgroundColor: 'transparent',
                    padding: 0,
                    margin: 0,
                    fontSize: 12,
                  }}
                  highlighter="hljs"
                >
                  {typeof tool.result === 'string'
                    ? tool.result
                    : JSON.stringify(tool.result, null, 2)}
                </SyntaxHighlighter>
              </View>
            </View>
          )}

          {/* Status Badge */}
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {tool.status.toUpperCase()}
            </Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundDepth2,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.backgroundDepth3,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  toolsList: {
    padding: 12,
    gap: 8,
  },
  toolCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundDepth1,
    overflow: 'hidden',
  },
  toolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  toolHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  toolInfo: {
    flex: 1,
  },
  toolName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  toolDescription: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  toolDetails: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  detailSection: {
    marginTop: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  codeBlock: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderStyle: 'dashed',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
