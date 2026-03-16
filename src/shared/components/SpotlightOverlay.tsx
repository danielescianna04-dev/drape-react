import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Animated,
  useWindowDimensions,
} from 'react-native';
import Svg, { Rect, Defs, Mask } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { AppColors } from '../theme/colors';
import {
  useOnboardingStore,
  ONBOARDING_STEPS,
} from '../../core/onboarding/onboardingStore';
import { trackScreenView, trackTutorialStepAdvance, trackTutorialSkip } from '../../core/services/analyticsService';

const SPOTLIGHT_PADDING = 10;
const TOOLTIP_OFFSET = 20;
const ARROW_SIZE = 12;
const TABLET_BREAKPOINT = 700;
const TOOLTIP_MAX_WIDTH_TABLET = 440;

export const SpotlightOverlay = () => {
  const { t } = useTranslation(['projects']);
  const {
    isActive,
    currentStepIndex,
    targetRect,
    advanceStep,
    skipOnboarding,
  } = useOnboardingStore();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const tooltipAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const { width: screenW, height: screenH } = useWindowDimensions();

  const step = ONBOARDING_STEPS[currentStepIndex];
  const isTablet = screenW >= TABLET_BREAKPOINT;
  const isLastStep = currentStepIndex === ONBOARDING_STEPS.length - 1;
  const progress = (currentStepIndex + 1) / ONBOARDING_STEPS.length;

  useEffect(() => {
    if (isActive && targetRect) {
      fadeAnim.setValue(0);
      tooltipAnim.setValue(0);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(tooltipAnim, {
          toValue: 1,
          tension: 65,
          friction: 9,
          useNativeDriver: true,
        }),
      ]).start();

      pulseAnim.setValue(0);
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      fadeAnim.setValue(0);
      tooltipAnim.setValue(0);
    }

    return () => {
      pulseAnim.stopAnimation();
    };
  }, [isActive, targetRect, currentStepIndex]);

  if (!isActive || !targetRect || !step) return null;

  // Spotlight cutout dimensions
  const cutX = targetRect.x - SPOTLIGHT_PADDING;
  const cutY = targetRect.y - SPOTLIGHT_PADDING;
  const cutW = targetRect.width + SPOTLIGHT_PADDING * 2;
  const cutH = targetRect.height + SPOTLIGHT_PADDING * 2;
  const cutR = 16;

  // Target center for arrow positioning
  const targetCenterX = targetRect.x + targetRect.width / 2;

  // Decide tooltip position: below or above
  const spaceBelow = screenH - (targetRect.y + targetRect.height);
  const showBelow = spaceBelow > 240;

  const tooltipTop = showBelow
    ? targetRect.y + targetRect.height + SPOTLIGHT_PADDING + TOOLTIP_OFFSET + ARROW_SIZE
    : undefined;
  const tooltipBottom = !showBelow
    ? screenH - targetRect.y + SPOTLIGHT_PADDING + TOOLTIP_OFFSET + ARROW_SIZE
    : undefined;

  // Horizontal positioning
  let tooltipLeft: number;
  let tooltipRight: number | undefined;

  if (isTablet) {
    const idealLeft = targetCenterX - TOOLTIP_MAX_WIDTH_TABLET / 2;
    const margin = 24;
    tooltipLeft = Math.max(
      margin,
      Math.min(idealLeft, screenW - TOOLTIP_MAX_WIDTH_TABLET - margin),
    );
    tooltipRight = undefined;
  } else {
    tooltipLeft = 20;
    tooltipRight = 20;
  }

  // Arrow horizontal position relative to tooltip
  const tooltipWidth = isTablet ? TOOLTIP_MAX_WIDTH_TABLET : screenW - 40;
  const arrowLeftInTooltip = targetCenterX - tooltipLeft - ARROW_SIZE;
  const clampedArrowLeft = Math.max(
    24,
    Math.min(arrowLeftInTooltip, tooltipWidth - 48),
  );

  // Animated values
  const glowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.9],
  });

  const tooltipScale = tooltipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
  });

  const tooltipTranslateY = tooltipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [showBelow ? 16 : -16, 0],
  });

  useEffect(() => {
    if (isActive && step) {
      trackScreenView(`tutorial_step_${currentStepIndex}`);
    }
  }, [isActive, currentStepIndex]);

  const handleAdvance = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackTutorialStepAdvance(String(currentStepIndex), step?.titleKey || '');
    advanceStep();
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackTutorialSkip(String(currentStepIndex));
    skipOnboarding();
  };

  return (
    <Animated.View
      style={[styles.container, { opacity: fadeAnim }]}
      pointerEvents="box-none"
    >
      {/* Backdrop tap to dismiss */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleSkip} />

      {/* SVG overlay with spotlight cutout */}
      <Svg
        width={screenW}
        height={screenH}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Defs>
          <Mask id="spotlight-mask">
            <Rect x={0} y={0} width={screenW} height={screenH} fill="white" />
            <Rect
              x={cutX}
              y={cutY}
              width={cutW}
              height={cutH}
              rx={cutR}
              ry={cutR}
              fill="black"
            />
          </Mask>
        </Defs>
        <Rect
          x={0}
          y={0}
          width={screenW}
          height={screenH}
          fill="rgba(0,0,0,0.78)"
          mask="url(#spotlight-mask)"
        />
        {/* Glow border around spotlight */}
        <Rect
          x={cutX}
          y={cutY}
          width={cutW}
          height={cutH}
          rx={cutR}
          ry={cutR}
          fill="none"
          stroke={AppColors.primary}
          strokeWidth={2}
          opacity={0.6}
        />
      </Svg>

      {/* Pulsing glow ring */}
      <Animated.View
        style={[
          styles.glowRing,
          {
            left: cutX - 3,
            top: cutY - 3,
            width: cutW + 6,
            height: cutH + 6,
            borderRadius: cutR + 3,
            opacity: glowOpacity,
          },
        ]}
        pointerEvents="none"
      />

      {/* Tooltip card with arrow */}
      <Animated.View
        style={[
          styles.tooltip,
          {
            left: tooltipLeft,
            ...(tooltipRight !== undefined ? { right: tooltipRight } : {}),
            ...(isTablet ? { width: TOOLTIP_MAX_WIDTH_TABLET } : {}),
            ...(tooltipTop !== undefined ? { top: tooltipTop } : {}),
            ...(tooltipBottom !== undefined ? { bottom: tooltipBottom } : {}),
            transform: [
              { scale: tooltipScale },
              { translateY: tooltipTranslateY },
            ],
          },
        ]}
      >
        {/* Arrow pointing to target */}
        <View
          style={[
            styles.arrowContainer,
            showBelow
              ? { top: -ARROW_SIZE, left: clampedArrowLeft }
              : { bottom: -ARROW_SIZE, left: clampedArrowLeft },
          ]}
        >
          <View
            style={[
              styles.arrow,
              showBelow ? styles.arrowUp : styles.arrowDown,
            ]}
          />
        </View>

        {/* Section label + step counter */}
        <View style={styles.topRow}>
          <Text style={styles.sectionLabel}>{t('tutorial.discover')}</Text>
          <Text style={styles.stepCounterText}>
            {currentStepIndex + 1}/{ONBOARDING_STEPS.length}
          </Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        <View style={styles.tooltipHeader}>
          <View style={styles.iconWrap}>
            <Ionicons name={step.icon as any} size={22} color="#fff" />
          </View>
          <View style={styles.tooltipContent}>
            <Text style={styles.tooltipTitle}>{t(step.titleKey)}</Text>
            <Text style={styles.tooltipDesc}>{t(step.descriptionKey)}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity onPress={handleSkip} style={styles.skipButton} activeOpacity={0.6}>
            <Text style={styles.skipText}>{t('tutorial.skip')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleAdvance} style={styles.nextButton} activeOpacity={0.8}>
            <Text style={styles.nextText}>
              {isLastStep ? t('tutorial.start') : t('tutorial.next')}
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  glowRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: AppColors.primary,
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: 'rgba(24, 24, 28, 0.97)',
    borderRadius: 18,
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 24,
  },
  arrowContainer: {
    position: 'absolute',
    width: ARROW_SIZE * 2,
    height: ARROW_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  arrowUp: {
    borderBottomWidth: ARROW_SIZE,
    borderBottomColor: 'rgba(24, 24, 28, 0.97)',
  },
  arrowDown: {
    borderTopWidth: ARROW_SIZE,
    borderTopColor: 'rgba(24, 24, 28, 0.97)',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  stepCounterText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.3)',
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: AppColors.primary,
    borderRadius: 2,
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 16,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltipContent: {
    flex: 1,
  },
  tooltipTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  tooltipDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 19,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  skipText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: AppColors.primary,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  nextText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
