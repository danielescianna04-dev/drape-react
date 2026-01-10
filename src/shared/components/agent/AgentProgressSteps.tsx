import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolate,
  FadeIn,
  Layout,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../theme/colors';

const colors = AppColors.dark;

export interface ProgressStep {
  label: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  order: number;
  message?: string;
}

interface AgentProgressStepsProps {
  steps: ProgressStep[];
  isCollapsible?: boolean;
}

export const AgentProgressSteps: React.FC<AgentProgressStepsProps> = ({
  steps,
  isCollapsible = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const expandAnimation = useSharedValue(0);

  // Sort steps by order
  const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

  // Get current step (first non-complete)
  const currentStep = sortedSteps.find(s => s.status !== 'complete') || sortedSteps[sortedSteps.length - 1];

  // Calculate progress
  const completedCount = sortedSteps.filter(s => s.status === 'complete').length;
  const progressPercent = (completedCount / sortedSteps.length) * 100;

  useEffect(() => {
    expandAnimation.value = withSpring(isExpanded ? 1 : 0, {
      damping: 20,
      stiffness: 200,
    });
  }, [isExpanded]);

  const expandStyle = useAnimatedStyle(() => {
    const height = interpolate(
      expandAnimation.value,
      [0, 1],
      [0, sortedSteps.length * 60], // Approximate height per step
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

  if (sortedSteps.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Header - Always Visible */}
      <TouchableOpacity
        onPress={() => isCollapsible && setIsExpanded(!isExpanded)}
        style={styles.header}
        disabled={!isCollapsible}
      >
        <View style={styles.headerLeft}>
          <View style={styles.currentStepIcon}>
            <StepIcon status={currentStep.status} size={16} />
          </View>
          <View style={styles.headerContent}>
            <Text style={styles.currentStepLabel} numberOfLines={1}>
              {currentStep.label}
            </Text>
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBarBg}>
                <Animated.View
                  entering={FadeIn}
                  style={[
                    styles.progressBarFill,
                    { width: `${progressPercent}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {completedCount}/{sortedSteps.length}
              </Text>
            </View>
          </View>
        </View>

        {isCollapsible && (
          <Animated.View style={chevronStyle}>
            <Ionicons
              name="chevron-down"
              size={20}
              color={colors.textSecondary}
            />
          </Animated.View>
        )}
      </TouchableOpacity>

      {/* Expanded Steps List */}
      {isCollapsible && (
        <Animated.View style={expandStyle}>
          <View style={styles.stepsList}>
            {sortedSteps.map((step, index) => (
              <StepItem
                key={`${step.label}-${index}`}
                step={step}
                isLast={index === sortedSteps.length - 1}
              />
            ))}
          </View>
        </Animated.View>
      )}

      {/* Always show all steps if not collapsible */}
      {!isCollapsible && (
        <View style={styles.stepsList}>
          {sortedSteps.map((step, index) => (
            <StepItem
              key={`${step.label}-${index}`}
              step={step}
              isLast={index === sortedSteps.length - 1}
            />
          ))}
        </View>
      )}
    </View>
  );
};

interface StepItemProps {
  step: ProgressStep;
  isLast: boolean;
}

const StepItem: React.FC<StepItemProps> = ({ step, isLast }) => {
  return (
    <Animated.View
      entering={FadeIn.delay(step.order * 100)}
      layout={Layout.springify()}
      style={styles.stepItem}
    >
      <View style={styles.stepIconContainer}>
        <StepIcon status={step.status} />
        {!isLast && <View style={styles.stepConnector} />}
      </View>

      <View style={styles.stepContent}>
        <Text style={styles.stepLabel}>{step.label}</Text>
        {step.message && (
          <Text style={styles.stepMessage} numberOfLines={2}>
            {step.message}
          </Text>
        )}
      </View>
    </Animated.View>
  );
};

interface StepIconProps {
  status: ProgressStep['status'];
  size?: number;
}

const StepIcon: React.FC<StepIconProps> = ({ status, size = 20 }) => {
  const iconName = {
    pending: 'ellipse-outline',
    running: 'reload-circle',
    complete: 'checkmark-circle',
    error: 'close-circle',
  }[status];

  const iconColor = {
    pending: colors.textTertiary,
    running: colors.primary,
    complete: colors.success,
    error: colors.error,
  }[status];

  return <Ionicons name={iconName as any} size={size} color={iconColor} />;
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
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
    padding: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  currentStepIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.backgroundDepth3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContent: {
    flex: 1,
  },
  currentStepLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: colors.backgroundDepth3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    minWidth: 35,
    textAlign: 'right',
  },
  stepsList: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  stepIconContainer: {
    alignItems: 'center',
    position: 'relative',
  },
  stepConnector: {
    position: 'absolute',
    top: 24,
    width: 2,
    height: 40,
    backgroundColor: colors.border,
  },
  stepContent: {
    flex: 1,
    paddingTop: 2,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  stepMessage: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
