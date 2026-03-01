import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../theme/colors';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const CONFETTI_COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#F43F5E'];
const CONFETTI_COUNT = 30;

interface ConfettiPiece {
  x: number;
  y: Animated.Value;
  rotate: Animated.Value;
  opacity: Animated.Value;
  color: string;
  size: number;
  delay: number;
}

interface PurchaseCelebrationModalProps {
  visible: boolean;
  planName: string | null;
  onClose: () => void;
}

export const PurchaseCelebrationModal: React.FC<PurchaseCelebrationModalProps> = ({
  visible,
  planName,
  onClose,
}) => {
  const { t } = useTranslation('settings');
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const confettiRef = useRef<ConfettiPiece[]>([]);
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>();

  // Initialize confetti pieces
  if (confettiRef.current.length === 0) {
    confettiRef.current = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      x: Math.random() * SCREEN_WIDTH,
      y: new Animated.Value(-50),
      rotate: new Animated.Value(0),
      opacity: new Animated.Value(1),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 6,
      delay: Math.random() * 800,
    }));
  }

  useEffect(() => {
    if (visible) {
      // Animate card entrance
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();

      // Animate confetti
      confettiRef.current.forEach((piece) => {
        piece.y.setValue(-50);
        piece.rotate.setValue(0);
        piece.opacity.setValue(1);

        Animated.sequence([
          Animated.delay(piece.delay),
          Animated.parallel([
            Animated.timing(piece.y, {
              toValue: SCREEN_HEIGHT + 50,
              duration: 2500 + Math.random() * 1500,
              useNativeDriver: true,
            }),
            Animated.timing(piece.rotate, {
              toValue: 360 * (1 + Math.random() * 2),
              duration: 3000,
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.delay(2000),
              Animated.timing(piece.opacity, {
                toValue: 0,
                duration: 1000,
                useNativeDriver: true,
              }),
            ]),
          ]),
        ]).start();
      });

      // Auto-dismiss
      dismissTimer.current = setTimeout(onClose, 5000);
    } else {
      scaleAnim.setValue(0.5);
      opacityAnim.setValue(0);
    }

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [visible]);

  const displayName = planName
    ? t(`plans.${planName}.name`, { defaultValue: planName.charAt(0).toUpperCase() + planName.slice(1) })
    : '';

  const features: string[] = planName
    ? (t(`plans.${planName}.features`, { returnObjects: true }) as string[]) || []
    : [];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

        {/* Confetti */}
        {confettiRef.current.map((piece, i) => (
          <Animated.View
            key={i}
            style={[
              styles.confetti,
              {
                left: piece.x,
                width: piece.size,
                height: piece.size * 1.5,
                backgroundColor: piece.color,
                borderRadius: piece.size * 0.3,
                opacity: piece.opacity,
                transform: [
                  { translateY: piece.y },
                  {
                    rotate: piece.rotate.interpolate({
                      inputRange: [0, 360],
                      outputRange: ['0deg', '360deg'],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}

        {/* Card */}
        <Animated.View style={{ opacity: opacityAnim, transform: [{ scale: scaleAnim }] }}>
          {isLiquidGlassSupported ? (
            <LiquidGlassView style={styles.card} interactive={true} effect="regular" colorScheme="dark">
              {renderContent()}
            </LiquidGlassView>
          ) : (
            <View style={[styles.card, { backgroundColor: '#1C1C1E' }]}>
              {renderContent()}
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );

  function renderContent() {
    return (
      <View style={styles.inner}>
        <View style={styles.iconCircle}>
          <Ionicons name="diamond" size={32} color="#8B5CF6" />
        </View>

        <Text style={styles.title}>{t('plans.celebration.title', { plan: displayName })}</Text>
        <Text style={styles.subtitle}>{t('plans.celebration.subtitle')}</Text>

        {features.length > 0 && (
          <View style={styles.featuresList}>
            <Text style={styles.featuresLabel}>{t('plans.celebration.featuresUnlocked')}</Text>
            {features.map((feature, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>
        )}

        <LinearGradient colors={[AppColors.primary, AppColors.primaryShade]} style={styles.ctaButton}>
          <TouchableOpacity
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            onPress={onClose}
          >
            <Text style={styles.ctaText}>{t('plans.celebration.startBuilding')}</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  }
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  confetti: { position: 'absolute', top: 0 },
  card: { width: 310, borderRadius: 20, overflow: 'hidden' },
  inner: { padding: 24, alignItems: 'center' },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginBottom: 6, textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  featuresList: { width: '100%', marginBottom: 20 },
  featuresLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  featureText: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  ctaButton: { width: '100%', borderRadius: 14, height: 48 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
