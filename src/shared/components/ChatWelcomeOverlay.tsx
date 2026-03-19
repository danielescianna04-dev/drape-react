import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Pressable,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { AppColors } from '../theme/colors';
import {
  useOnboardingStore,
  CHAT_FEATURES,
} from '../../core/onboarding/onboardingStore';
import { tracciaSchermata, tracciaChatBenvenutoChiuso } from '../../core/services/analyticsService';

const CARD_MAX_WIDTH = 400;

export const ChatWelcomeOverlay = () => {
  const { t } = useTranslation(['projects']);
  const { chatWelcomeSeen, dismissChatWelcome, isLoaded } = useOnboardingStore();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const { width: screenW } = useWindowDimensions();

  const isTablet = screenW >= 700;
  const visible = isLoaded && !chatWelcomeSeen;

  useEffect(() => {
    if (visible) {
      tracciaSchermata('Modale tutorial prima registrazione');
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.9);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  const handleDismiss = () => {
    tracciaChatBenvenutoChiuso();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      dismissChatWelcome();
    });
  };

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />

        <Animated.View
          style={[
            styles.card,
            isTablet && { maxWidth: CARD_MAX_WIDTH },
            { transform: [{ scale: scaleAnim }] },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.checkCircle}>
              <Ionicons name="rocket" size={28} color="#fff" />
            </View>
            <Text style={styles.title}>{t('tutorial.chatWelcome')}</Text>
            <Text style={styles.subtitle}>{t('tutorial.chatWelcomeDesc')}</Text>
          </View>

          {/* Feature list */}
          <View style={styles.features}>
            {CHAT_FEATURES.map((feature, i) => (
              <View key={i} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <Ionicons name={feature.icon as any} size={18} color={AppColors.primary} />
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>{t(feature.titleKey)}</Text>
                  <Text style={styles.featureDesc}>{t(feature.descriptionKey)}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* CTA */}
          <TouchableOpacity onPress={handleDismiss} style={styles.ctaButton} activeOpacity={0.8}>
            <Text style={styles.ctaText}>{t('tutorial.gotIt')}</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(24, 24, 28, 0.97)',
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  features: {
    gap: 16,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 18,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AppColors.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
