import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions } from 'react-native';
import Svg, { Rect, Defs, Mask, Rect as MaskRect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { AppColors } from '../theme/colors';
import { useOnboardingStore, ONBOARDING_STEPS } from '../../core/onboarding/onboardingStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SPOTLIGHT_PADDING = 8;
const TOOLTIP_OFFSET = 16;

export const SpotlightOverlay = () => {
  const { t } = useTranslation(['projects']);
  const { isActive, currentStep, targetRect, advanceStep, skipOnboarding } = useOnboardingStore();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const step = ONBOARDING_STEPS[currentStep];

  useEffect(() => {
    if (isActive && targetRect) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [isActive, targetRect, currentStep]);

  if (!isActive || !targetRect || !step) return null;

  // Calculate spotlight cutout
  const cutX = targetRect.x - SPOTLIGHT_PADDING;
  const cutY = targetRect.y - SPOTLIGHT_PADDING;
  const cutW = targetRect.width + SPOTLIGHT_PADDING * 2;
  const cutH = targetRect.height + SPOTLIGHT_PADDING * 2;
  const cutR = 16;

  // Tooltip position — below or above the spotlight
  const spaceBelow = SCREEN_HEIGHT - (targetRect.y + targetRect.height);
  const showBelow = spaceBelow > 200;
  const tooltipTop = showBelow
    ? targetRect.y + targetRect.height + TOOLTIP_OFFSET + SPOTLIGHT_PADDING
    : targetRect.y - SPOTLIGHT_PADDING - TOOLTIP_OFFSET - 160;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]} pointerEvents="box-none">
      {/* SVG overlay with spotlight cutout */}
      <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} style={StyleSheet.absoluteFill}>
        <Defs>
          <Mask id="spotlight-mask">
            {/* White = visible (dark overlay) */}
            <Rect x={0} y={0} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} fill="white" />
            {/* Black = transparent (cutout) */}
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
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          fill="rgba(0,0,0,0.75)"
          mask="url(#spotlight-mask)"
        />
      </Svg>

      {/* Tooltip card */}
      <View style={[styles.tooltip, { top: tooltipTop }]}>
        <View style={styles.tooltipHeader}>
          <View style={styles.iconWrap}>
            <Ionicons name={step.icon as any} size={22} color="#fff" />
          </View>
          <View style={styles.tooltipContent}>
            <Text style={styles.tooltipTitle}>{t(step.titleKey)}</Text>
            <Text style={styles.tooltipDesc}>{t(step.descriptionKey)}</Text>
          </View>
        </View>

        {/* Step dots */}
        <View style={styles.dotsRow}>
          {ONBOARDING_STEPS.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentStep && styles.dotActive]}
            />
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity onPress={skipOnboarding} style={styles.skipButton}>
            <Text style={styles.skipText}>{t('tutorial.skip')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={advanceStep} style={styles.nextButton}>
            <Text style={styles.nextText}>
              {currentStep === ONBOARDING_STEPS.length - 1 ? t('tutorial.start') : t('tutorial.next')}
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  tooltip: {
    position: 'absolute',
    left: 24,
    right: 24,
    backgroundColor: 'rgba(28, 28, 30, 0.96)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 24,
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
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
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 18,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 14,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: {
    backgroundColor: AppColors.primary,
    width: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  skipText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: AppColors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  nextText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
