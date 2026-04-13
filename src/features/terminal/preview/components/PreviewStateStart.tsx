/**
 * PreviewStateStart — "Start preview" screen with project info + start button.
 * Pure component: no hooks that fetch data, no direct store access.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../../shared/theme/colors';
import { techMaps } from './techMaps';

// ── Props ──────────────────────────────────────────────────

export interface PreviewStateStartProps {
  projectName?: string;
  technology?: string;
  language?: string;
  projectId?: string;
  isStartTransitioning: boolean;
  startTransitionAnim: Animated.Value;
  onStart: () => void;
  /** Custom start command widget — rendered inside the info card */
  customCommandSlot?: React.ReactNode;
  t: (key: string) => string;
}

// ── Component ──────────────────────────────────────────────

export const PreviewStateStart: React.FC<PreviewStateStartProps> = ({
  projectName,
  technology,
  language,
  isStartTransitioning,
  startTransitionAnim,
  onStart,
  customCommandSlot,
  t,
}) => {
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const winW = Math.min(screenW * 0.85, 340);
  const winH = 420;
  const maxX = (screenW - winW) / 2;
  const maxY = (screenH - winH) / 2;

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);

  const clamp = (val: number, min: number, max: number) => {
    'worklet';
    return Math.min(Math.max(val, min), max);
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      offsetX.value = translateX.value;
      offsetY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = clamp(offsetX.value + e.translationX, -maxX, maxX);
      translateY.value = clamp(offsetY.value + e.translationY, -maxY, maxY);
    })
    .onEnd(() => {
      if (Math.abs(translateX.value) < 20 && Math.abs(translateY.value) < 20) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const dragStyle = useAnimatedStyle(
    () =>
      ({
        transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
      }) as any,
  );

  const tech = technology || language;

  return (
    <View style={s.root}>
      <LinearGradient
        colors={AppColors.gradient.dark as unknown as [string, string, string, string]}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Reanimated.View style={[dragStyle, { width: '85%', maxWidth: 340, alignSelf: 'center' }]}>
        <Animated.View
          style={[
            s.window,
            {
              opacity: startTransitionAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.5, 0] }),
              transform: [
                { scale: startTransitionAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] }) },
                { translateY: startTransitionAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) },
              ],
            },
          ]}
        >
          <GestureDetector gesture={panGesture}>
            <Reanimated.View style={s.titleBar}>
              <View style={s.dots}>
                <View style={[s.dot, { backgroundColor: '#FF5F57' }]} />
                <View style={[s.dot, { backgroundColor: '#FEBC2E' }]} />
                <View style={[s.dot, { backgroundColor: '#28C840' }]} />
              </View>
              <Text style={s.titleText}>
                {projectName || t('terminal:preview.project')} — preview
              </Text>
              <View style={{ width: 44 }} />
            </Reanimated.View>
          </GestureDetector>

          <View style={s.content}>
            <View style={s.projectHeader}>
              <View style={s.projectIcon}>
                <Ionicons name={techMaps.icon(tech)} size={24} color={techMaps.color(tech)} />
              </View>
              <Text style={s.projectName} numberOfLines={1}>
                {projectName || t('terminal:preview.project')}
              </Text>
              <View style={s.statusRow}>
                <View style={s.techBadge}>
                  <Text style={s.techBadgeText}>{tech || 'web'}</Text>
                </View>
                <View style={s.dotSeparator} />
                <View style={s.statusBadge}>
                  <View style={[s.statusDot, isStartTransitioning && { backgroundColor: '#FBBF24' }]} />
                  <Text style={s.statusText}>
                    {isStartTransitioning ? t('terminal:preview.starting') : t('terminal:preview.readyShort')}
                  </Text>
                </View>
              </View>
            </View>

            <View style={s.infoCard}>
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>{t('terminal:preview.technology')}</Text>
                <Text style={s.infoValue}>{techMaps.displayName(technology)}</Text>
              </View>
              <View style={s.infoDivider} />
              <View style={s.infoRow}>
                <Text style={s.infoLabel}>{t('terminal:preview.environment')}</Text>
                <View style={s.envBadge}>
                  <Text style={s.envBadgeText}>{t('terminal:preview.dock.development')}</Text>
                </View>
              </View>
              {customCommandSlot && (
                <>
                  <View style={s.infoDivider} />
                  {customCommandSlot}
                </>
              )}
            </View>

            <TouchableOpacity style={s.startBtn} onPress={onStart} activeOpacity={0.85} disabled={isStartTransitioning}>
              <LinearGradient
                colors={isStartTransitioning ? ['#4C1D95', '#4C1D95'] : [AppColors.primary, '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.startBtnGradient}
              >
                {isStartTransitioning ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
                    <Text style={s.startBtnText}>{t('terminal:preview.startPreview')}</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Reanimated.View>
    </View>
  );
};

// ── Styles ──────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  window: {
    borderRadius: 12,
    backgroundColor: 'rgba(30, 30, 30, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  dots: { flexDirection: 'row', gap: 7, marginRight: 12 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  titleText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
  },
  content: { padding: 24, alignItems: 'center' },
  projectHeader: { alignItems: 'center', marginBottom: 32 },
  projectIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  projectName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
    marginBottom: 10,
    textAlign: 'center',
    maxWidth: '90%',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  techBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  techBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'lowercase',
  },
  dotSeparator: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.2)' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  statusText: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.5)' },
  infoCard: {
    width: '100%',
    maxWidth: 280,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoLabel: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.35)' },
  infoValue: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  infoDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.04)', marginHorizontal: 16 },
  envBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  envBadgeText: { fontSize: 11, fontWeight: '600', color: '#22C55E' },
  startBtn: {
    width: '100%',
    maxWidth: 280,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    marginTop: 20,
    marginBottom: 32,
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  startBtnGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  startBtnText: { fontSize: 15, fontWeight: '600', color: '#fff', letterSpacing: 0.2 },
});
