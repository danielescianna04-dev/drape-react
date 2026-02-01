import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../shared/theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  displayName: string;
  isNewUser?: boolean;
  onSelectPlan: (plan: 'free' | 'go') => void;
}

export const OnboardingPlansScreen: React.FC<Props> = ({ displayName, isNewUser = false, onSelectPlan }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const cardFade1 = useRef(new Animated.Value(0)).current;
  const cardFade2 = useRef(new Animated.Value(0)).current;
  const cardSlide1 = useRef(new Animated.Value(40)).current;
  const cardSlide2 = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    // Staggered entrance animations
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(cardFade1, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(cardSlide1, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(cardFade2, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(cardSlide2, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const firstName = displayName?.split(' ')[0] || 'Ciao';

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A0F', '#0F0A1A', '#0A0A0F']} style={StyleSheet.absoluteFill} />

      {/* Background orbs */}
      <View style={styles.orbTop} />
      <View style={styles.orbBottom} />

      {/* Header */}
      <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.welcomeIconWrapper}>
          <LinearGradient
            colors={[AppColors.primary, '#9333EA']}
            style={styles.welcomeIconGradient}
          >
            <Ionicons name="sparkles" size={28} color="#fff" />
          </LinearGradient>
        </View>
        <Text style={styles.welcomeTitle}>
          {isNewUser ? `Benvenuto, ${firstName}!` : `Ciao, ${firstName}!`}
        </Text>
        <Text style={styles.welcomeSubtitle}>
          {isNewUser
            ? 'Scegli il piano che fa per te per iniziare a creare.'
            : 'Sblocca più potenza per i tuoi progetti.'}
        </Text>
      </Animated.View>

      {/* Plans */}
      <View style={styles.plansContainer}>
        {/* Go Plan - Featured */}
        <Animated.View style={[styles.planCardWrapper, { opacity: cardFade1, transform: [{ translateY: cardSlide1 }] }]}>
          <View style={styles.popularBadge}>
            <LinearGradient
              colors={[AppColors.primary, '#9333EA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.popularBadgeGradient}
            >
              <Ionicons name="star" size={10} color="#fff" />
              <Text style={styles.popularBadgeText}>Consigliato</Text>
            </LinearGradient>
          </View>
          <TouchableOpacity
            style={[styles.planCard, styles.planCardFeatured]}
            activeOpacity={0.85}
            onPress={() => onSelectPlan('go')}
          >
            <LinearGradient
              colors={['rgba(139, 92, 246, 0.08)', 'rgba(99, 102, 241, 0.03)', 'transparent']}
              style={styles.planCardGlow}
            />
            <View style={styles.planHeader}>
              <Text style={styles.planName}>Go</Text>
              <View style={styles.planPriceRow}>
                <Text style={styles.planPrice}>€9.99</Text>
                <Text style={styles.planPricePeriod}>/mese</Text>
              </View>
            </View>

            <View style={styles.planFeatures}>
              {[
                { icon: 'folder-open', text: '5 progetti + 3 clonati' },
                { icon: 'eye', text: '20 preview al mese' },
                { icon: 'sparkles', text: 'Budget AI raddoppiato (€5)' },
                { icon: 'cloud-upload', text: '2GB Storage Cloud' },
                { icon: 'mail', text: 'Supporto email' },
              ].map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <LinearGradient
                    colors={[AppColors.primary, '#9333EA']}
                    style={styles.featureIconBg}
                  >
                    <Ionicons name={f.icon as any} size={12} color="#fff" />
                  </LinearGradient>
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>

            <LinearGradient
              colors={[AppColors.primary, '#9333EA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.planCta}
            >
              <Text style={styles.planCtaText}>Inizia con Go</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Free Plan */}
        <Animated.View style={[styles.planCardWrapper, { opacity: cardFade2, transform: [{ translateY: cardSlide2 }] }]}>
          <TouchableOpacity
            style={styles.planCard}
            activeOpacity={0.85}
            onPress={() => onSelectPlan('free')}
          >
            <View style={styles.planHeader}>
              <Text style={styles.planName}>Free</Text>
              <View style={styles.planPriceRow}>
                <Text style={styles.planPrice}>€0</Text>
                <Text style={styles.planPricePeriod}>/mese</Text>
              </View>
            </View>

            <View style={styles.planFeatures}>
              {[
                { icon: 'folder-open', text: '2 progetti + 1 clonato' },
                { icon: 'eye', text: '5 preview al mese' },
                { icon: 'sparkles', text: 'Budget AI base (€2.50)' },
                { icon: 'cloud-upload', text: '500MB Storage' },
              ].map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <View style={styles.featureIconBgFree}>
                    <Ionicons name={f.icon as any} size={12} color="rgba(255,255,255,0.5)" />
                  </View>
                  <Text style={[styles.featureText, { color: 'rgba(255,255,255,0.5)' }]}>{f.text}</Text>
                </View>
              ))}
            </View>

            <View style={styles.planCtaFree}>
              <Text style={styles.planCtaFreeText}>Continua gratis</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  orbTop: {
    position: 'absolute',
    top: -100,
    right: -60,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(139, 92, 246, 0.06)',
  },
  orbBottom: {
    position: 'absolute',
    bottom: -80,
    left: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(99, 102, 241, 0.04)',
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  welcomeIconWrapper: {
    marginBottom: 16,
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  welcomeIconGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    lineHeight: 22,
  },

  // Plans
  plansContainer: {
    gap: 16,
  },
  planCardWrapper: {
    position: 'relative',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    zIndex: 10,
  },
  popularBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  popularBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  planCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  planCardFeatured: {
    borderColor: 'rgba(139, 92, 246, 0.3)',
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
  },
  planCardGlow: {
    position: 'absolute',
    top: -40,
    left: -40,
    right: -40,
    height: 160,
    borderRadius: 80,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  planName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  planPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  planPrice: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  planPricePeriod: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.4)',
    marginLeft: 2,
  },

  // Features
  planFeatures: {
    gap: 10,
    marginBottom: 18,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureIconBg: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureIconBgFree: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '500',
  },

  // CTAs
  planCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  planCtaText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  planCtaFree: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  planCtaFreeText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.4)',
  },
});
