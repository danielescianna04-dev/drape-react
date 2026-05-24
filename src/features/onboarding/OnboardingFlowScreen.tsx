import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../shared/theme/colors';
import { BynotLogo } from '../../shared/components/icons/BynotLogo';
import { supabase } from '../../lib/supabase/client';
import {
  tracciaSchermata,
  tracciaOnboardingStepCompletato,
  tracciaOnboardingEsperienzaScelta,
  tracciaOnboardingScopertaScelta,
  tracciaOnboardingCompletato,
  tracciaOnboardingIndietro,
} from '../../core/services/analyticsService';
import { pushNotificationService } from '../../core/services/pushNotificationService';
import { useAuthStore } from '../../core/auth/authStore';
import { ConsentBanner } from '../../core/components/ConsentBanner';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

type Step = 'welcome' | 'consent' | 'experience' | 'referral';

interface Props {
  userId: string;
  onComplete: () => void;
  initialStep?: 'welcome' | 'consent' | 'experience' | 'referral';
  experienceLevel: string | null;
  referralSource: string | null;
  onExperienceLevelChange: (value: string | null) => void;
  onReferralSourceChange: (value: string | null) => void;
}

export const OnboardingFlowScreen: React.FC<Props> = ({
  userId,
  onComplete,
  initialStep = 'welcome',
  experienceLevel,
  referralSource,
  onExperienceLevelChange,
  onReferralSourceChange,
}) => {
  const { t } = useTranslation('projects');
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>(initialStep);

  // Content animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  // When coming back from Create (initialStep='referral'), start at 67 (Create's position) and animate to 50
  const progressStartValue =
    initialStep === 'welcome' ? 14 :
    initialStep === 'consent' ? 29 :
    initialStep === 'experience' ? 43 :
    57;
  const progressAnim = useRef(new Animated.Value(progressStartValue)).current;

  // Welcome staggered
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const logoFade = useRef(new Animated.Value(0)).current;
  const titleFade = useRef(new Animated.Value(0)).current;
  const titleSlide = useRef(new Animated.Value(16)).current;
  const feat1Fade = useRef(new Animated.Value(0)).current;
  const feat2Fade = useRef(new Animated.Value(0)).current;
  const feat3Fade = useRef(new Animated.Value(0)).current;
  const feat4Fade = useRef(new Animated.Value(0)).current;
  const feat1Slide = useRef(new Animated.Value(16)).current;
  const feat2Slide = useRef(new Animated.Value(16)).current;
  const feat3Slide = useRef(new Animated.Value(16)).current;
  const feat4Slide = useRef(new Animated.Value(16)).current;
  const btnFade = useRef(new Animated.Value(0)).current;

  // Background drift
  const bgMove = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(bgMove, { toValue: 1, duration: 6000, useNativeDriver: true, easing: (v: number) => v })
    ).start();
  }, []);
  const bgShift1 = bgMove.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 15, 0] });
  const bgShift2 = bgMove.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -12, 0] });

  // Welcome entrance
  useEffect(() => {
    const anim = (node: Animated.Value, to: number, dur: number) =>
      Animated.timing(node, { toValue: to, duration: dur, useNativeDriver: true });

    Animated.sequence([
      // Logo
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 50, friction: 9, useNativeDriver: true }),
        anim(logoFade, 1, 600),
      ]),
      // Title + subtitle
      Animated.parallel([
        anim(titleFade, 1, 400),
        anim(titleSlide, 0, 400),
      ]),
      // Features stagger
      Animated.stagger(100, [
        Animated.parallel([anim(feat1Fade, 1, 300), anim(feat1Slide, 0, 300)]),
        Animated.parallel([anim(feat2Fade, 1, 300), anim(feat2Slide, 0, 300)]),
        Animated.parallel([anim(feat3Fade, 1, 300), anim(feat3Slide, 0, 300)]),
        Animated.parallel([anim(feat4Fade, 1, 300), anim(feat4Slide, 0, 300)]),
      ]),
      // Button
      anim(btnFade, 1, 300),
    ]).start();
  }, []);

  // Step transitions — track each step with a clear Italian name
  const stepScreenNames: Record<Step, string> = {
    welcome: 'Benvenuto',
    consent: 'Privacy e Consenso',
    experience: 'Livello Esperienza',
    referral: 'Come ci hai trovato',
  };
  useEffect(() => {
    tracciaSchermata(stepScreenNames[step]);
    const targetPct =
      step === 'welcome' ? 14 :
      step === 'consent' ? 29 :
      step === 'experience' ? 43 :
      57;
    Animated.timing(progressAnim, { toValue: targetPct, duration: 300, useNativeDriver: false }).start();
    if (step !== 'welcome') {
      slideAnim.setValue(24);
      Animated.timing(slideAnim, { toValue: 0, duration: 350, useNativeDriver: true }).start();
    }
  }, [step]);

  const handleNext = async () => {
    if (step === 'welcome') {
      tracciaOnboardingStepCompletato('Ha premuto Continua');
      setStep('consent');
    } else if (step === 'consent') {
      // consent is handled by ConsentBanner onResolved
      setStep('experience');
    } else if (step === 'experience' && experienceLevel) {
      tracciaOnboardingEsperienzaScelta(experienceLevel);
      setStep('referral');
    } else if (step === 'referral' && referralSource) {
      tracciaOnboardingScopertaScelta(referralSource);
      // Save onboarding answers — retry once on failure to prevent silent data loss
      const onboardingData = {
        experienceLevel,
        referralSource,
        onboardingCompleted: true,
        onboardingCompletedAt: new Date().toISOString(),
      };
      const saveOnboarding = async () => {
        // Merge in preferences JSONB of user_configs
        const { data: existing } = await supabase
          .from('user_configs')
          .select('preferences')
          .eq('user_id', userId)
          .maybeSingle();
        const mergedPreferences = {
          ...((existing?.preferences as Record<string, unknown>) ?? {}),
          ...onboardingData,
        };
        const { error } = await supabase
          .from('user_configs')
          .upsert({ user_id: userId, preferences: mergedPreferences as any });
        if (error) throw error;
      };
      try {
        await saveOnboarding();
        tracciaOnboardingCompletato();
      } catch (e) {
        console.warn('[Onboarding] First save failed, retrying...', e);
        try {
          await saveOnboarding();
          tracciaOnboardingCompletato();
        } catch (e2) {
          console.error('[Onboarding] Save failed after retry:', e2);
        }
      }
      // Consent has just been resolved in-flow, so now we can safely start
      // consent-gated services like push permission and presence tracking.
      // Fire-and-forget — push permission dialog can hang indefinitely on iOS sim
      // and must not block navigation.
      useAuthStore.getState().refreshConsentAwareServices().catch(() => {});
      onComplete();
    }
  };

  const canContinue =
    step === 'welcome' ||
    (step === 'experience' && !!experienceLevel) ||
    (step === 'referral' && !!referralSource);

  const features = [
    { icon: 'sparkles' as const, titleKey: 'onboardingFlow.welcome.feature1Title', descKey: 'onboardingFlow.welcome.feature1Desc' },
    { icon: 'git-branch-outline' as const, titleKey: 'onboardingFlow.welcome.feature2Title', descKey: 'onboardingFlow.welcome.feature2Desc' },
    { icon: 'eye' as const, titleKey: 'onboardingFlow.welcome.feature3Title', descKey: 'onboardingFlow.welcome.feature3Desc' },
    { icon: 'code-slash' as const, titleKey: 'onboardingFlow.welcome.feature4Title', descKey: 'onboardingFlow.welcome.feature4Desc' },
  ];
  const featAnims = [
    { fade: feat1Fade, slide: feat1Slide },
    { fade: feat2Fade, slide: feat2Slide },
    { fade: feat3Fade, slide: feat3Slide },
    { fade: feat4Fade, slide: feat4Slide },
  ];

  const renderWelcome = () => (
    <View style={styles.welcomeContainer}>
      {/* Logo */}
      <Animated.View style={[styles.logoWrap, { opacity: logoFade, transform: [{ scale: logoScale }] }]}>
        <View style={styles.logoRing}>
          <BynotLogo size={96} />
        </View>
      </Animated.View>

      {/* Title */}
      <Animated.View style={{ opacity: titleFade, transform: [{ translateY: titleSlide }], alignItems: 'center' }}>
        <Text style={styles.title}>{t('onboardingFlow.welcome.title')}</Text>
        <Text style={styles.subtitle}>{t('onboardingFlow.welcome.subtitle')}</Text>
      </Animated.View>

      {/* Features */}
      <View style={styles.featuresList}>
        {features.map((f, i) => (
          <Animated.View key={i} style={[styles.featureRow, { opacity: featAnims[i].fade, transform: [{ translateY: featAnims[i].slide }] }]}>
            <View style={styles.featureIcon}>
              <Ionicons name={f.icon} size={20} color={AppColors.primaryLight} />
            </View>
            <View style={styles.featureTextWrap}>
              <Text style={styles.featureTitle}>{t(f.titleKey)}</Text>
              <Text style={styles.featureDesc}>{t(f.descKey)}</Text>
            </View>
          </Animated.View>
        ))}
      </View>
    </View>
  );

  const renderExperience = () => {
    const options = [
      { id: 'never_coded', icon: 'leaf-outline' as const, labelKey: 'onboardingFlow.experience.neverCoded', descKey: 'onboardingFlow.experience.neverCodedDesc' },
      { id: 'no_code', icon: 'construct-outline' as const, labelKey: 'onboardingFlow.experience.noCode', descKey: 'onboardingFlow.experience.noCodeDesc' },
      { id: 'developer', icon: 'terminal-outline' as const, labelKey: 'onboardingFlow.experience.developer', descKey: 'onboardingFlow.experience.developerDesc' },
    ];

    const renderCardContent = (opt: typeof options[0], sel: boolean) => (
      <>
        <View style={[styles.optionIcon, sel && styles.optionIconSel]}>
          <Ionicons name={opt.icon} size={22} color={sel ? AppColors.primaryLight : 'rgba(255,255,255,0.5)'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.optionLabel}>{t(opt.labelKey)}</Text>
          <Text style={styles.optionDesc}>{t(opt.descKey)}</Text>
        </View>
        {sel && <Ionicons name="checkmark-circle" size={22} color={AppColors.primaryLight} />}
      </>
    );

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>{t('onboardingFlow.experience.title')}</Text>
        <View style={styles.optionsContainer}>
          {options.map(opt => {
            const sel = experienceLevel === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.optionCard,
                  isLiquidGlassSupported && styles.optionCardGlass,
                  sel && !isLiquidGlassSupported && styles.optionCardSel,
                ]}
                onPress={() => onExperienceLevelChange(opt.id)}
                activeOpacity={0.7}
              >
                {isLiquidGlassSupported ? (
                  <LiquidGlassView
                    style={[
                      styles.optionCardLiquid,
                      sel && { borderColor: 'rgba(124, 92, 255, 0.5)', borderWidth: 1.5 },
                    ]}
                    interactive={true}
                    effect="clear"
                    colorScheme="dark"
                  >
                    {renderCardContent(opt, sel)}
                  </LiquidGlassView>
                ) : (
                  renderCardContent(opt, sel)
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderConsent = () => (
    <View style={styles.consentWrap}>
      <ConsentBanner
        mode="step"
        forceShow
        onResolved={() => {
          tracciaOnboardingStepCompletato('Ha accettato i consensi');
          setStep('experience');
        }}
      />
    </View>
  );

  const renderReferral = () => {
    const sources = [
      { id: 'tiktok', icon: 'logo-tiktok' as const, labelKey: 'onboardingFlow.referral.tiktok' },
      { id: 'instagram', icon: 'logo-instagram' as const, labelKey: 'onboardingFlow.referral.instagram' },
      { id: 'youtube', icon: 'logo-youtube' as const, labelKey: 'onboardingFlow.referral.youtube' },
      { id: 'friend', icon: 'people-outline' as const, labelKey: 'onboardingFlow.referral.friend' },
      { id: 'appstore', icon: 'phone-portrait-outline' as const, labelKey: 'onboardingFlow.referral.appStore' },
      { id: 'other', icon: 'ellipsis-horizontal' as const, labelKey: 'onboardingFlow.referral.other' },
    ];

    const renderChipContent = (src: typeof sources[0], sel: boolean) => (
      <>
        <Ionicons name={src.icon} size={20} color={sel ? '#fff' : 'rgba(255,255,255,0.45)'} />
        <Text style={[styles.referralLabel, sel && styles.referralLabelSel]}>{t(src.labelKey)}</Text>
      </>
    );

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>{t('onboardingFlow.referral.title')}</Text>
        <View style={styles.referralGrid}>
          {sources.map(src => {
            const sel = referralSource === src.id;
            return (
              <TouchableOpacity
                key={src.id}
                style={[
                  styles.referralChip,
                  isLiquidGlassSupported && styles.referralChipGlass,
                  sel && !isLiquidGlassSupported && styles.referralChipSel,
                ]}
                onPress={() => onReferralSourceChange(src.id)}
                activeOpacity={0.7}
              >
                {isLiquidGlassSupported ? (
                  <LiquidGlassView
                    style={[
                      styles.referralChipLiquid,
                      sel && { borderColor: 'rgba(124, 92, 255, 0.5)', borderWidth: 1.5 },
                    ]}
                    interactive={true}
                    effect="clear"
                    colorScheme="dark"
                  >
                    {renderChipContent(src, sel)}
                  </LiquidGlassView>
                ) : (
                  renderChipContent(src, sel)
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  // For welcome, the button fades in separately; for other steps it's always visible
  const buttonOpacity = step === 'welcome' ? btnFade : (canContinue ? new Animated.Value(1) : new Animated.Value(1));

  return (
    <View style={styles.container}>
      {/* Background */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <AnimatedLinearGradient
          colors={['#0C0816', '#1a0a2e', '#2d0845', '#0C0816']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { transform: [{ translateY: bgShift1 }], scaleX: 1.15, scaleY: 1.15 }]}
        />
        <AnimatedLinearGradient
          colors={['#0C0816', '#1E1040', '#0C0816']}
          start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.7, transform: [{ translateY: bgShift2 }], scaleX: 1.15, scaleY: 1.15 }]}
        />
      </View>

      {/* Header: back button + progress bar */}
      <View style={[styles.headerRow, { marginTop: insets.top + 12 }]}>
        {step !== 'welcome' ? (
          <TouchableOpacity
            style={[styles.backBtn, isLiquidGlassSupported && styles.backBtnGlass]}
            onPress={() => {
              tracciaOnboardingIndietro(stepScreenNames[step]);
              setStep(
                step === 'referral' ? 'experience' :
                step === 'experience' ? 'consent' :
                'welcome'
              );
            }}
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
        ) : null}
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, {
              width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            }]} />
          </View>
        </View>
      </View>

      {/* Content — NO opacity on parent, kills LiquidGlass */}
      {step === 'welcome' ? (
        <View style={styles.contentWrap}>
          {renderWelcome()}
        </View>
      ) : (
        <Animated.View style={[styles.contentWrap, { transform: [{ translateY: slideAnim }] }]}>
          {step === 'consent' && renderConsent()}
          {step === 'experience' && renderExperience()}
          {step === 'referral' && renderReferral()}
        </Animated.View>
      )}

      {/* Button */}
      {step !== 'consent' && (
        <Animated.View style={[styles.bottomWrap, { paddingBottom: insets.bottom + 20, opacity: buttonOpacity }]}>
          <TouchableOpacity
            style={styles.btn}
            onPress={handleNext}
            disabled={!canContinue}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={canContinue ? ['#6D4CFF', '#8B6FFF'] : ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.06)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.btnGrad}
            >
              <Text style={[styles.btnText, !canContinue && { color: 'rgba(255,255,255,0.25)' }]}>
                {t('onboardingFlow.continue')}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0816' },

  // Header
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
    overflow: 'hidden' as const,
    borderRadius: 18,
  },
  backBtnLiquid: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  },
  backBtnSpacer: {
    width: 36,
  },
  // Progress
  progressWrap: { flex: 1 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: '#fff' },

  // Content
  contentWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  stepContent: { alignItems: 'center' },
  consentWrap: { width: '100%' },

  // Welcome
  welcomeContainer: { alignItems: 'center' },
  logoWrap: { marginBottom: 28 },
  logoRing: {
    width: 96,
    height: 96,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 8,
    textAlign: 'center',
  },

  // Features
  featuresList: { marginTop: 40, width: '100%', gap: 22 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(109, 76, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextWrap: { flex: 1 },
  featureTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  featureDesc: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 2, lineHeight: 19 },

  // Experience
  stepTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 32,
    letterSpacing: -0.5,
  },
  optionsContainer: { width: '100%', gap: 14 },
  optionCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 18,
    gap: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  optionCardGlass: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    padding: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    overflow: 'hidden' as const,
  },
  optionCardLiquid: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: 20,
    overflow: 'hidden' as const,
    paddingVertical: 20,
    paddingHorizontal: 18,
    gap: 16,
  },
  optionCardSel: {
    backgroundColor: 'rgba(109, 76, 255, 0.1)',
    borderColor: 'rgba(124, 92, 255, 0.35)',
  },
  optionIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconSel: { backgroundColor: 'rgba(109, 76, 255, 0.2)' },
  optionLabel: { fontSize: 17, fontWeight: '600', color: '#fff' },
  optionDesc: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 3 },

  // Referral
  referralGrid: { flexDirection: 'column', gap: 10, width: '100%' },
  referralChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  referralChipGlass: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    padding: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: 'hidden' as const,
  },
  referralChipLiquid: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: 16,
    overflow: 'hidden' as const,
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
  },
  referralChipSel: {
    backgroundColor: 'rgba(109, 76, 255, 0.1)',
    borderColor: 'rgba(124, 92, 255, 0.3)',
  },
  referralLabel: { fontSize: 15, fontWeight: '500', color: 'rgba(255,255,255,0.5)' },
  referralLabelSel: { color: '#fff' },

  // Button
  bottomWrap: { paddingHorizontal: 32 },
  btn: { borderRadius: 28, overflow: 'hidden' },
  btnGrad: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 28,
  },
  btnText: { fontSize: 17, fontWeight: '600', color: '#fff', letterSpacing: -0.2 },
});
