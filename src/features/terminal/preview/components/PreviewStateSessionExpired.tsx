/**
 * PreviewStateSessionExpired — Session expired with retry CTA.
 * Pure component: no hooks that fetch data, no direct store access.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppColors } from '../../../../shared/theme/colors';

// ── Props ──────────────────────────────────────────────────

export interface PreviewStateSessionExpiredProps {
  message: string;
  onRestart: () => void;
  t: (key: string) => string;
}

// ── Component ──────────────────────────────────────────────

export const PreviewStateSessionExpired: React.FC<PreviewStateSessionExpiredProps> = ({
  message,
  onRestart,
  t,
}) => {
  const displayMessage = message || t('terminal:preview.sessionExpired');

  return (
    <Reanimated.View style={s.root} entering={FadeIn.duration(300)}>
      <LinearGradient
        colors={['#13052A', '#090518', '#06050F', '#080719', '#13052A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.orbA} />
      <View style={s.orbB} />
      <View style={s.orbC} />

      <View style={s.card}>
        <View style={s.cardGlow} />

        {/* Badge */}
        <View style={s.header}>
          <View style={s.badge}>
            <Ionicons name="time-outline" size={14} color="#FDBA74" />
            <Text style={s.badgeText}>{t('terminal:preview.sessionBadge')}</Text>
          </View>
        </View>

        {/* Icon */}
        <View style={s.iconOuter}>
          <View style={s.iconRing} />
          <LinearGradient
            colors={['#F59E0B', '#EA580C']}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={s.iconInner}
          >
            <Ionicons name="hourglass-outline" size={32} color="#FFFFFF" />
          </LinearGradient>
        </View>

        <Text style={s.title}>{t('terminal:preview.sessionExpiredTitle')}</Text>
        <Text style={s.message}>{displayMessage}</Text>

        {/* Info chips */}
        <View style={s.infoRow}>
          <View style={s.infoChip}>
            <Ionicons name="save-outline" size={14} color={AppColors.primaryTint} />
            <Text style={s.infoText}>{t('terminal:preview.sessionStatePreserved')}</Text>
          </View>
          <View style={s.infoChip}>
            <Ionicons name="flash-outline" size={14} color={AppColors.primaryTint} />
            <Text style={s.infoText}>{t('terminal:preview.sessionFastRestart')}</Text>
          </View>
        </View>

        {/* CTA */}
        <TouchableOpacity style={s.cta} onPress={onRestart} activeOpacity={0.9}>
          <LinearGradient
            colors={['#9B8AFF', '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.ctaGradient}
          >
            <Ionicons name="refresh" size={18} color="#FFFFFF" />
            <Text style={s.ctaText}>{t('terminal:preview.sessionRestartCta')}</Text>
          </LinearGradient>
        </TouchableOpacity>
        <Text style={s.hint}>{t('terminal:preview.tapToRestart')}</Text>
      </View>
    </Reanimated.View>
  );
};

// ── Styles ──────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  orbA: {
    position: 'absolute', top: '12%', left: '-16%',
    width: 280, height: 280, borderRadius: 140,
    backgroundColor: 'rgba(139, 92, 246, 0.26)',
  },
  orbB: {
    position: 'absolute', top: '6%', right: '-10%',
    width: 250, height: 250, borderRadius: 125,
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
  },
  orbC: {
    position: 'absolute', bottom: '10%', left: '8%',
    width: 320, height: 320, borderRadius: 160,
    backgroundColor: 'rgba(99, 102, 241, 0.16)',
  },
  card: {
    width: '90%', maxWidth: 390, borderRadius: 26,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(12, 10, 24, 0.8)',
    paddingHorizontal: 22, paddingVertical: 24,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5, shadowRadius: 30, elevation: 22,
    overflow: 'hidden',
  },
  cardGlow: {
    position: 'absolute', top: -80, right: -50,
    width: 210, height: 210, borderRadius: 105,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  header: { width: '100%', alignItems: 'center', marginBottom: 18 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderWidth: 1, borderColor: 'rgba(251, 191, 36, 0.26)',
  },
  badgeText: { color: '#FED7AA', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  iconOuter: { width: 148, height: 148, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  iconRing: {
    position: 'absolute', width: 148, height: 148, borderRadius: 74,
    borderWidth: 1, borderColor: 'rgba(251, 191, 36, 0.22)',
    backgroundColor: 'rgba(251, 191, 36, 0.06)',
  },
  iconInner: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#EA580C', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 10,
  },
  title: {
    fontSize: 30, lineHeight: 34, fontWeight: '800',
    color: '#FFFFFF', letterSpacing: -0.6,
    textAlign: 'center', marginBottom: 10,
  },
  message: {
    fontSize: 15, lineHeight: 21, color: 'rgba(255,255,255,0.72)',
    textAlign: 'center', marginBottom: 16,
  },
  infoRow: { width: '100%', gap: 8, marginBottom: 20 },
  infoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  infoText: { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '600' },
  cta: {
    width: '100%', borderRadius: 14, overflow: 'hidden', marginBottom: 12,
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.32, shadowRadius: 16,
    elevation: 10,
  },
  ctaGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52,
  },
  ctaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  hint: { color: 'rgba(255,255,255,0.48)', fontSize: 12, fontWeight: '500', textAlign: 'center' },
});
