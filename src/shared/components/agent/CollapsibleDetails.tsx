import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';

interface ColorScheme {
  header: string;
  content: string;
  border: string;
  bg: string;
}

interface CollapsibleDetailsProps {
  label: string;
  details: string;
  colorScheme: ColorScheme;
  icon?: React.ReactNode;
  badge?: string;
  defaultExpanded?: boolean;
  maxPreviewLines?: number;
  showPreview?: boolean;
  previewContent?: string;
  previewSummary?: string;
}

export const CollapsibleDetails: React.FC<CollapsibleDetailsProps> = ({
  label,
  details,
  colorScheme,
  icon,
  badge,
  defaultExpanded = false,
  maxPreviewLines = 5,
  showPreview = true,
  previewContent,
  previewSummary,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const expandAnimation = useSharedValue(defaultExpanded ? 1 : 0);

  const hasDetails = details.trim().length > 0;
  const isCollapsible = hasDetails && !defaultExpanded;

  // Create content preview
  const contentPreview = useMemo(() => {
    const lines = details.split('\n');
    const totalLines = lines.length;

    if (previewContent !== undefined) {
      return {
        preview: previewContent,
        hasMore: true,
        totalLines,
        previewLines: previewContent.split('\n').length,
      };
    }

    if (showPreview && totalLines > maxPreviewLines) {
      const preview = lines.slice(0, maxPreviewLines).join('\n');
      return {
        preview,
        hasMore: true,
        totalLines,
        previewLines: maxPreviewLines,
      };
    }

    return {
      preview: '',
      hasMore: false,
      totalLines,
      previewLines: 0,
    };
  }, [details, maxPreviewLines, previewContent, showPreview]);

  const shouldShowPreview = showPreview && !isExpanded && hasDetails && contentPreview.hasMore;

  useEffect(() => {
    expandAnimation.value = withSpring(isExpanded ? 1 : 0, {
      damping: 20,
      stiffness: 200,
    });
  }, [isExpanded]);

  const expandStyle = useAnimatedStyle(() => {
    const maxHeight = 1000; // Max height when expanded
    const height = interpolate(
      expandAnimation.value,
      [0, 1],
      [0, maxHeight],
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
          rotate: `${interpolate(expandAnimation.value, [0, 1], [0, 90])}deg`,
        },
      ],
    };
  });

  return (
    <View style={[styles.container, { backgroundColor: colorScheme.bg, borderColor: colorScheme.border }]}>
      <TouchableOpacity
        onPress={isCollapsible ? () => setIsExpanded(!isExpanded) : undefined}
        disabled={!isCollapsible}
        activeOpacity={isCollapsible ? 0.7 : 1}
      >
        <View style={styles.header}>
          {icon && <View style={styles.iconContainer}>{icon}</View>}
          <Text style={[styles.label, { color: colorScheme.header }]}>{label}</Text>
          {badge && (
            <Text style={[styles.badge, { color: colorScheme.header }]}>({badge})</Text>
          )}
          {previewSummary && (
            <Text style={[styles.previewSummary, { color: colorScheme.header }]}>
              {previewSummary}
            </Text>
          )}
          {isCollapsible && (
            <Animated.Text style={[styles.chevron, { color: colorScheme.header }, chevronStyle]}>
              ▶
            </Animated.Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Preview (when collapsed and has more content) */}
      {shouldShowPreview && (
        <View style={[styles.previewContainer, { borderLeftColor: colorScheme.border }]}>
          <Text style={[styles.content, { color: colorScheme.content }]}>
            {contentPreview.preview}
          </Text>
          <Text style={[styles.moreIndicator, { color: colorScheme.content }]}>
            ... {contentPreview.totalLines - contentPreview.previewLines} more lines (tap to expand)
          </Text>
        </View>
      )}

      {/* Full content (when expanded) */}
      {hasDetails && isExpanded && (
        <Animated.View style={expandStyle}>
          <View style={[styles.expandedContainer, { borderLeftColor: colorScheme.border }]}>
            <Text style={[styles.content, { color: colorScheme.content }]}>{details}</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconContainer: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  badge: {
    fontSize: 12,
    opacity: 0.8,
  },
  previewSummary: {
    fontSize: 11,
    opacity: 0.6,
    marginLeft: 8,
  },
  chevron: {
    fontSize: 10,
    marginLeft: 4,
    opacity: 0.8,
  },
  previewContainer: {
    marginTop: 8,
    paddingLeft: 24,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
  },
  expandedContainer: {
    paddingLeft: 24,
    borderLeftWidth: 2,
  },
  content: {
    fontSize: 11,
    fontFamily: 'Courier',
    lineHeight: 16,
  },
  moreIndicator: {
    fontSize: 11,
    opacity: 0.6,
    marginTop: 4,
    fontStyle: 'italic',
  },
});
