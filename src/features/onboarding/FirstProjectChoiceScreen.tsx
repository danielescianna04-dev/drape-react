import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../shared/theme/colors';
import { tracciaSchermata, tracciaOnboardingSceltaProgetto, tracciaNavigazioneIndietro } from '../../core/services/analyticsService';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

interface Props {
  onBack: () => void;
  onCreate: () => void;
  onClone: () => void;
  onSkip?: () => void;
}

export const FirstProjectChoiceScreen: React.FC<Props> = ({ onBack, onCreate, onClone, onSkip }) => {
  const { t } = useTranslation('projects');
  const insets = useSafeAreaInsets();
  const bgMove = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(bgMove, {
        toValue: 1,
        duration: 6000,
        useNativeDriver: true,
      })
    ).start();
  }, [bgMove]);

  const bgShift1 = bgMove.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 14, 0] });
  const bgShift2 = bgMove.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -10, 0] });

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <AnimatedLinearGradient
          colors={['#0C0816', '#1a0a2e', '#2d0845', '#0C0816']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { transform: [{ translateY: bgShift1 }], scaleX: 1.15, scaleY: 1.15 }]}
        />
        <AnimatedLinearGradient
          colors={['#0C0816', '#1E1040', '#0C0816']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.7, transform: [{ translateY: bgShift2 }], scaleX: 1.15, scaleY: 1.15 }]}
        />
      </View>

      <View style={[styles.headerRow, { marginTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={[styles.backBtn, isLiquidGlassSupported && styles.backBtnGlass]}
          onPress={() => { tracciaNavigazioneIndietro('Onboarding'); onBack(); }}
          activeOpacity={0.7}
        >
          {isLiquidGlassSupported ? (
            <LiquidGlassView
              style={styles.backBtnLiquid}
              interactive={true}
              effect="clear"
              colorScheme="dark"
            >
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </LiquidGlassView>
          ) : (
            <Ionicons name="chevron-back" size={28} color="#fff" />
          )}
        </TouchableOpacity>
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: '71%' }]} />
          </View>
        </View>
      </View>

      <View style={styles.contentWrap}>
        <View style={styles.heroWrap}>
          {isLiquidGlassSupported ? (
            <LiquidGlassView
              style={styles.heroIconLiquid}
              interactive={true}
              effect="clear"
              colorScheme="dark"
            >
              <Ionicons name="rocket-outline" size={34} color={AppColors.primaryLight} />
            </LiquidGlassView>
          ) : (
            <View style={styles.heroIcon}>
              <Ionicons name="rocket-outline" size={34} color={AppColors.primaryLight} />
            </View>
          )}
          <Text style={styles.title}>{t('onboardingFlow.projectChoice.title', 'Come vuoi iniziare?')}</Text>
          <Text style={styles.subtitle}>
            {t(
              'onboardingFlow.projectChoice.subtitle',
              'Puoi creare un progetto da zero oppure clonare una repository esistente.'
            )}
          </Text>
        </View>

        <View style={styles.optionsList}>
          <TouchableOpacity
            style={[styles.optionCard, isLiquidGlassSupported && styles.optionCardGlass]}
            onPress={() => { tracciaOnboardingSceltaProgetto('crea_nuovo'); onCreate(); }}
            activeOpacity={0.8}
          >
            {isLiquidGlassSupported ? (
              <LiquidGlassView
                style={styles.optionCardLiquid}
                interactive={true}
                effect="clear"
                colorScheme="dark"
              >
                <View style={styles.optionInner}>
                  <View style={styles.optionIcon}>
                    <Ionicons name="add-circle-outline" size={28} color={AppColors.primaryLight} />
                  </View>
                  <View style={styles.optionTextWrap}>
                    <Text style={styles.optionTitle}>{t('onboardingFlow.projectChoice.createTitle', 'Crea un progetto')}</Text>
                    <Text style={styles.optionDescription}>
                      {t(
                        'onboardingFlow.projectChoice.createDescription',
                        'Parti da un’idea e lascia che Drape ti aiuti a costruirla.'
                      )}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />
                </View>
              </LiquidGlassView>
            ) : (
              <>
                <View style={styles.optionIcon}>
                  <Ionicons name="add-circle-outline" size={28} color={AppColors.primaryLight} />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle}>{t('onboardingFlow.projectChoice.createTitle', 'Crea un progetto')}</Text>
                  <Text style={styles.optionDescription}>
                    {t(
                      'onboardingFlow.projectChoice.createDescription',
                      'Parti da un’idea e lascia che Drape ti aiuti a costruirla.'
                    )}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionCard, isLiquidGlassSupported && styles.optionCardGlass]}
            onPress={() => { tracciaOnboardingSceltaProgetto('clona_github'); onClone(); }}
            activeOpacity={0.8}
          >
            {isLiquidGlassSupported ? (
              <LiquidGlassView
                style={styles.optionCardLiquid}
                interactive={true}
                effect="clear"
                colorScheme="dark"
              >
                <View style={styles.optionInner}>
                  <View style={styles.optionIcon}>
                    <Ionicons name="git-branch-outline" size={28} color={AppColors.primaryLight} />
                  </View>
                  <View style={styles.optionTextWrap}>
                    <Text style={styles.optionTitle}>{t('onboardingFlow.projectChoice.cloneTitle', 'Clona un progetto')}</Text>
                    <Text style={styles.optionDescription}>
                      {t(
                        'onboardingFlow.projectChoice.cloneDescription',
                        'Importa una repository GitHub e continua a lavorarci dentro Drape.'
                      )}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />
                </View>
              </LiquidGlassView>
            ) : (
              <>
                <View style={styles.optionIcon}>
                  <Ionicons name="git-branch-outline" size={28} color={AppColors.primaryLight} />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle}>{t('onboardingFlow.projectChoice.cloneTitle', 'Clona un progetto')}</Text>
                  <Text style={styles.optionDescription}>
                    {t(
                      'onboardingFlow.projectChoice.cloneDescription',
                      'Importa una repository GitHub e continua a lavorarci dentro Drape.'
                    )}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />
              </>
            )}
          </TouchableOpacity>
        </View>

        {onSkip ? (
          <TouchableOpacity
            style={[styles.skipBtn, { marginBottom: insets.bottom + 12 }]}
            onPress={() => { tracciaOnboardingSceltaProgetto('salta'); onSkip(); }}
            activeOpacity={0.7}
          >
            <Text style={styles.skipText}>{t('onboardingFlow.projectChoice.skip', 'Salta e vai alla home')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 36,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnGlass: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
    borderRadius: 18,
  },
  backBtnLiquid: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  progressWrap: {
    flex: 1,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  contentWrap: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
  },
  heroWrap: {
    alignItems: 'center',
    marginBottom: 40,
  },
  heroIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(109, 76, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  heroIconLiquid: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 10,
    fontSize: 17,
    lineHeight: 26,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    maxWidth: 320,
  },
  optionsList: {
    gap: 16,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(124, 92, 255, 0.22)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    gap: 16,
  },
  optionCardGlass: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 0,
  },
  optionCardLiquid: {
    width: '100%',
    borderRadius: 28,
    overflow: 'hidden',
  },
  optionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 16,
  },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(109, 76, 255, 0.12)',
  },
  optionTextWrap: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.45)',
  },
  skipBtn: {
    marginTop: 28,
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
  },
});
