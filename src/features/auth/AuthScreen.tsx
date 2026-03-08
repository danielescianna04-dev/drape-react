import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
  Animated as RNAnimated,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { useTranslation } from 'react-i18next';
import { AppColors } from '../../shared/theme/colors';
import { DrapeLogo } from '../../shared/components/icons/DrapeLogo';
import { useAuthStore } from '../../core/auth/authStore';
import * as AppleAuthentication from 'expo-apple-authentication';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type AuthMode = 'initial' | 'login' | 'register' | 'forgot' | 'verify';

// Animated gradient background — two layers moving in different directions
const AnimatedGradientBg = () => {
  const layer1Y = useRef(new RNAnimated.Value(0)).current;
  const layer2X = useRef(new RNAnimated.Value(0)).current;
  const layer2Y = useRef(new RNAnimated.Value(0)).current;
  const layer3X = useRef(new RNAnimated.Value(0)).current;
  const layer3Y = useRef(new RNAnimated.Value(0)).current;
  const pulseOpacity = useRef(new RNAnimated.Value(0.35)).current;

  useEffect(() => {
    // Vertical scroll — faster
    RNAnimated.loop(
      RNAnimated.timing(layer1Y, {
        toValue: -SCREEN_HEIGHT,
        duration: 7000,
        useNativeDriver: true,
        easing: (t: number) => t,
      })
    ).start();

    // Top blob — orbits around
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(layer2X, { toValue: 100, duration: 6000, useNativeDriver: true, easing: (t: number) => t * (2 - t) }),
        RNAnimated.timing(layer2X, { toValue: -80, duration: 7000, useNativeDriver: true, easing: (t: number) => t * (2 - t) }),
      ])
    ).start();
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(layer2Y, { toValue: 80, duration: 8000, useNativeDriver: true, easing: (t: number) => t * (2 - t) }),
        RNAnimated.timing(layer2Y, { toValue: -60, duration: 6000, useNativeDriver: true, easing: (t: number) => t * (2 - t) }),
      ])
    ).start();

    // Bottom blob — orbits opposite
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(layer3X, { toValue: -100, duration: 7000, useNativeDriver: true, easing: (t: number) => t * (2 - t) }),
        RNAnimated.timing(layer3X, { toValue: 90, duration: 6000, useNativeDriver: true, easing: (t: number) => t * (2 - t) }),
      ])
    ).start();
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(layer3Y, { toValue: -70, duration: 6500, useNativeDriver: true, easing: (t: number) => t * (2 - t) }),
        RNAnimated.timing(layer3Y, { toValue: 80, duration: 7500, useNativeDriver: true, easing: (t: number) => t * (2 - t) }),
      ])
    ).start();

    // Pulsing opacity on blobs
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulseOpacity, { toValue: 0.55, duration: 4000, useNativeDriver: true, easing: (t: number) => t * (2 - t) }),
        RNAnimated.timing(pulseOpacity, { toValue: 0.25, duration: 4000, useNativeDriver: true, easing: (t: number) => t * (2 - t) }),
      ])
    ).start();
  }, []);

  return (
    <View style={[StyleSheet.absoluteFillObject, { overflow: 'hidden' }]} pointerEvents="none">
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#08080f' }]} />

      {/* Layer 1 — vertical scroll, very smooth seamless gradient */}
      <RNAnimated.View
        style={{
          position: 'absolute',
          left: -60,
          right: -60,
          height: SCREEN_HEIGHT * 2,
          top: 0,
          transform: [{ translateY: layer1Y }],
        }}
      >
        <LinearGradient
          colors={[
            '#0a0a14', '#0e0920', '#120b2a', '#150d30', '#120b2a', '#0e0920',
            '#0a0a14', '#0e0920', '#120b2a', '#150d30', '#120b2a', '#0e0920', '#0a0a14',
          ]}
          start={{ x: 0.4, y: 0 }}
          end={{ x: 0.6, y: 1 }}
          style={{ width: '100%', height: '100%' }}
        />
      </RNAnimated.View>

      {/* Layer 2 — full-screen color wash that drifts */}
      <RNAnimated.View
        style={{
          ...StyleSheet.absoluteFillObject,
          top: -SCREEN_HEIGHT * 0.5,
          bottom: -SCREEN_HEIGHT * 0.5,
          left: -SCREEN_HEIGHT * 0.5,
          right: -SCREEN_HEIGHT * 0.5,
          opacity: pulseOpacity,
          transform: [{ translateX: layer2X }, { translateY: layer2Y }],
        }}
      >
        <LinearGradient
          colors={['#0a0a14', '#150d32', '#1a1040', '#150d32', '#0a0a14']}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={{ width: '100%', height: '100%' }}
        />
      </RNAnimated.View>

      {/* Layer 3 — another full-screen wash, opposite direction */}
      <RNAnimated.View
        style={{
          ...StyleSheet.absoluteFillObject,
          top: -SCREEN_HEIGHT * 0.5,
          bottom: -SCREEN_HEIGHT * 0.5,
          left: -SCREEN_HEIGHT * 0.5,
          right: -SCREEN_HEIGHT * 0.5,
          opacity: 0.3,
          transform: [{ translateX: layer3X }, { translateY: layer3Y }],
        }}
      >
        <LinearGradient
          colors={['#0a0a14', '#12092e', '#180e38', '#12092e', '#0a0a14']}
          start={{ x: 0.9, y: 0.2 }}
          end={{ x: 0.1, y: 0.8 }}
          style={{ width: '100%', height: '100%' }}
        />
      </RNAnimated.View>
    </View>
  );
};

// Hero top section (new landing visual)
const HeroShowcase = ({ t }: { t: (key: string) => string }) => {
  const pulse = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
        RNAnimated.timing(pulse, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  const nodes = [
    { icon: 'code-slash' as const, label: t('auth:hero.code') },
    { icon: 'sparkles' as const, label: t('auth:hero.ai') },
    { icon: 'eye' as const, label: t('auth:hero.preview') },
  ];

  return (
    <View style={heroStyles.wrapper}>
      <View style={heroStyles.canvas}>
        <View style={heroStyles.pathLine} />

        <View style={heroStyles.nodeRow}>
          {nodes.map((node, idx) => (
            <View key={node.label} style={heroStyles.nodeCluster}>
              {idx === 1 && (
                <RNAnimated.View
                  style={[
                    heroStyles.centerHalo,
                    {
                      opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }),
                      transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
                    },
                  ]}
                />
              )}
              <View style={[heroStyles.node, idx === 1 && heroStyles.nodeActive]}>
                <Ionicons name={node.icon} size={20} color={idx === 1 ? '#DCD4FF' : '#A98FFF'} />
              </View>
              <Text style={[heroStyles.nodeLabel, idx === 1 && heroStyles.nodeLabelActive]}>{node.label}</Text>
            </View>
          ))}
        </View>

        <View style={heroStyles.captionPill}>
          <Text style={heroStyles.captionText}>{t('auth:hero.caption')}</Text>
        </View>
      </View>
    </View>
  );
};

const heroStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    marginTop: 10,
  },
  canvas: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 26,
    paddingBottom: 20,
    backgroundColor: 'rgba(12, 9, 30, 0.56)',
    borderWidth: 1,
    borderColor: 'rgba(145,119,255,0.24)',
    shadowColor: '#5D3BFF',
    shadowOpacity: 0.26,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  nodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginBottom: 26,
  },
  pathLine: {
    position: 'absolute',
    top: 53,
    left: 70,
    right: 70,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(131, 100, 255, 0.34)',
  },
  nodeCluster: {
    width: 84,
    alignItems: 'center',
    position: 'relative',
  },
  centerHalo: {
    position: 'absolute',
    top: -6,
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(126, 94, 255, 0.32)',
  },
  node: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(150, 121, 255, 0.4)',
  },
  nodeActive: {
    backgroundColor: 'rgba(122, 90, 255, 0.34)',
    borderColor: 'rgba(190, 170, 255, 0.8)',
  },
  nodeLabel: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(194, 178, 255, 0.85)',
    letterSpacing: 0.2,
  },
  nodeLabelActive: {
    color: '#EAE2FF',
    fontWeight: '700',
  },
  captionPill: {
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(151, 124, 255, 0.28)',
  },
  captionText: {
    fontSize: 12,
    color: 'rgba(206, 194, 255, 0.9)',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

// Helper component to render input field with or without LiquidGlass
// Defined outside AuthScreen to prevent re-creation on each render (which causes input focus loss)
const GlassInputWrapper = ({ children }: { children: React.ReactNode }) => {
  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView style={styles.glassInputWrapper} interactive={true} effect="clear" colorScheme="dark">
        {children}
      </LiquidGlassView>
    );
  }
  return <View style={styles.inputWrapper}>{children}</View>;
};

// Helper component for glass back button
const GlassBackButton = ({ onPress, accessibilityLabel }: { onPress: () => void; accessibilityLabel: string }) => {
  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView style={styles.glassBackButton} interactive={true} effect="clear" colorScheme="dark">
        <TouchableOpacity
          onPress={onPress}
          style={styles.backButtonInner}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
      </LiquidGlassView>
    );
  }
  return (
    <TouchableOpacity
      style={styles.backButton}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <Ionicons name="arrow-back" size={22} color="#fff" />
    </TouchableOpacity>
  );
};

export const AuthScreen = () => {
  const { t } = useTranslation(['auth', 'common']);
  const [mode, setMode] = useState<AuthMode>('initial');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationPassword, setVerificationPassword] = useState('');
  const [resendSuccess, setResendSuccess] = useState(false);
  const [isAutoLogging, setIsAutoLogging] = useState(false);
  const backLabel = t('common:back');

  const modalHeight = useRef(new RNAnimated.Value(200)).current;
  const modalBottom = useRef(new RNAnimated.Value(90)).current;
  const blurOpacity = useRef(new RNAnimated.Value(0)).current;
  const keyboardHeight = useRef(0);
  const baseMarginBottom = useRef(90);
  const { signIn, signUp, signInWithApple, resetPassword, resendVerificationEmail, checkEmailVerified, isLoading, error, clearError } = useAuthStore();
  const insets = useSafeAreaInsets();

  // Check Apple Auth availability
  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAuthAvailable);
  }, []);

  // Manual keyboard handling to avoid KAV jitter when switching fields
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: any) => {
      keyboardHeight.current = e.endCoordinates.height;
      RNAnimated.timing(modalBottom, {
        toValue: keyboardHeight.current - insets.bottom + 10,
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    };

    const onHide = (e: any) => {
      keyboardHeight.current = 0;
      RNAnimated.timing(modalBottom, {
        toValue: baseMarginBottom.current,
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    };

    const sub1 = Keyboard.addListener(showEvent, onShow);
    const sub2 = Keyboard.addListener(hideEvent, onHide);
    return () => { sub1.remove(); sub2.remove(); };
  }, [insets.bottom]);

  useEffect(() => {
    let targetHeight = 200; // Initial state
    if (mode === 'login') targetHeight = 500; // Added Apple button
    if (mode === 'register') targetHeight = 600; // Added Apple button
    if (mode === 'forgot') targetHeight = 300;
    if (mode === 'verify') targetHeight = 340;

    const showBlur = mode !== 'initial';
    const targetMarginBottom = mode === 'initial' ? 90 : 30;
    baseMarginBottom.current = targetMarginBottom;

    // Only animate bottom if keyboard is NOT open
    const bottomTarget = keyboardHeight.current > 0
      ? keyboardHeight.current - insets.bottom + 10
      : targetMarginBottom;

    // Stop any in-progress animations to prevent stale values
    modalHeight.stopAnimation();
    modalBottom.stopAnimation();
    blurOpacity.stopAnimation();

    // JS-driven animations (height + margin) — separate from native-driven
    RNAnimated.parallel([
      RNAnimated.timing(modalHeight, {
        toValue: targetHeight,
        duration: 300,
        useNativeDriver: false,
      }),
      RNAnimated.timing(modalBottom, {
        toValue: bottomTarget,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start();

    // Native-driven animation (opacity) — must run separately
    RNAnimated.timing(blurOpacity, {
      toValue: showBlur ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [mode]);

  // Poll for email verification when in verify mode
  useEffect(() => {
    if (mode !== 'verify' || !verificationEmail || !verificationPassword) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (cancelled) return;
      try {
        const verified = await checkEmailVerified(verificationEmail, verificationPassword);
        if (cancelled) return;
        if (verified) {
          setIsAutoLogging(true);
          try {
            await signIn(verificationEmail, verificationPassword);
            // signIn sets user in store → App.tsx navigates away from auth screen
          } catch {
            // If signIn fails for some reason, fall back to manual login
            if (!cancelled) {
              setIsAutoLogging(false);
              setMode('login');
              setEmail(verificationEmail);
              setPassword(verificationPassword);
            }
          }
          return; // Stop polling
        }
      } catch {
        // Ignore polling errors
      }
      if (!cancelled) {
        pollTimer = setTimeout(poll, 3000);
      }
    };

    // Start polling after a short initial delay
    pollTimer = setTimeout(poll, 2000);

    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
    };
  }, [mode, verificationEmail, verificationPassword]);

  const handleSubmit = async () => {
    setLocalError(null);
    clearError();

    if (!email.trim()) {
      setLocalError(t('auth:errors.enterEmail'));
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setLocalError(t('auth:errors.invalidEmailFormat'));
      return;
    }

    if (mode !== 'forgot' && !password) {
      setLocalError(t('auth:errors.enterPassword'));
      return;
    }

    if (mode === 'register') {
      if (!displayName.trim()) {
        setLocalError(t('auth:errors.enterName'));
        return;
      }
      if (password !== confirmPassword) {
        setLocalError(t('auth:errors.passwordMismatch'));
        return;
      }
      if (password.length < 6) {
        setLocalError(t('auth:errors.weakPassword'));
        return;
      }
    }

    try {
      if (mode === 'login') {
        await signIn(email.trim(), password);
      } else if (mode === 'register') {
        await signUp(email.trim(), password, displayName.trim());
        // Registration successful — switch to verify mode
        setVerificationEmail(email.trim());
        setVerificationPassword(password);
        setMode('verify');
        setResendSuccess(false);
        return;
      } else if (mode === 'forgot') {
        await resetPassword(email.trim());
        Alert.alert(
          t('auth:forgotPassword.sent'),
          t('auth:forgotPassword.sentMessage'),
          [{ text: t('common:ok'), onPress: () => setMode('login') }]
        );
      }
    } catch (err) {
      // Error handled by store
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setLocalError(null);
    clearError();
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setDisplayName('');
  };

  const handleAppleSignIn = async () => {
    try {
      setLocalError(null);
      clearError();
      await signInWithApple();
    } catch (err: any) {
      if (err.message !== t('auth:errors.appleLoginCancelled')) {
        setLocalError(err.message || t('auth:errors.appleLoginError'));
      }
    }
  };

  const displayError = localError || error;

  const renderModalContent = () => (
    <>
      <View style={styles.modalHandle} />

      {/* Initial State */}
      {mode === 'initial' && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.initialButtons}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => switchMode('register')}
            activeOpacity={0.9}
            accessibilityLabel={t('auth:startFree')}
            accessibilityRole="button"
            accessibilityHint={t('auth:a11y.openRegister')}
          >
            <LinearGradient
              colors={[AppColors.primary, '#8B5CF6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryButtonGradient}
            >
              <Text style={styles.primaryButtonText}>{t('auth:startFree')}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => switchMode('login')}
            activeOpacity={0.8}
            accessibilityLabel={t('auth:alreadyHaveAccount')}
            accessibilityRole="button"
            accessibilityHint={t('auth:a11y.openLogin')}
          >
            <Text style={styles.secondaryButtonText}>{t('auth:alreadyHaveAccount')}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Email Verification State */}
      {mode === 'verify' && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.formContent}>
          {isAutoLogging ? (
            <View style={styles.verifyContainer}>
              <View style={[styles.verifyIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Ionicons name="checkmark-circle" size={36} color="#10B981" />
              </View>
              <Text style={styles.verifyTitle}>{t('auth:emailVerification.verified')}</Text>
              <ActivityIndicator color={AppColors.primary} style={{ marginTop: 16 }} />
            </View>
          ) : (
            <>
              <View style={styles.verifyContainer}>
                <View style={styles.verifyIconContainer}>
                  <Ionicons name="mail-outline" size={36} color={AppColors.primary} />
                </View>
                <Text style={styles.verifyTitle}>{t('auth:emailVerification.title')}</Text>
                <Text style={styles.verifyMessage}>
                  {t('auth:emailVerification.message', { email: verificationEmail })}
                </Text>
                <View style={styles.checkingRow}>
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
                  <Text style={styles.checkingText}>{t('auth:emailVerification.checking')}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.resendButton, resendSuccess && styles.resendButtonSuccess]}
                onPress={async () => {
                  try {
                    setLocalError(null);
                    setResendSuccess(false);
                    await resendVerificationEmail(verificationEmail, verificationPassword);
                    setResendSuccess(true);
                  } catch (err: any) {
                    setLocalError(err?.message || t('auth:errors.errorSendingVerificationEmail'));
                  }
                }}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={resendSuccess ? 'checkmark-circle' : 'refresh-outline'}
                  size={18}
                  color={resendSuccess ? '#10B981' : 'rgba(255,255,255,0.8)'}
                />
                <Text style={[styles.resendButtonText, resendSuccess && { color: '#10B981' }]}>
                  {resendSuccess ? t('auth:emailVerification.resent') : t('auth:emailVerification.resend')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.switchMode}
                onPress={() => switchMode('login')}
              >
                <Text style={[styles.switchModeText, { color: AppColors.primary }]}>
                  {t('auth:emailVerification.backToLogin')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      )}

      {/* Form State */}
      {mode !== 'initial' && mode !== 'verify' && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.formContent}>
          <View style={styles.formHeader}>
            <GlassBackButton onPress={() => switchMode('initial')} accessibilityLabel={backLabel} />
            <Text style={styles.formTitle}>
              {mode === 'login' && t('auth:login.title')}
              {mode === 'register' && t('auth:register.title')}
              {mode === 'forgot' && t('auth:resetPassword')}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {displayError && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color="#EF4444" />
              <Text style={styles.errorText}>{displayError}</Text>
            </View>
          )}

          {mode === 'register' && (
            <GlassInputWrapper>
              <Ionicons name="person-outline" size={18} color="rgba(255,255,255,0.4)" />
              <TextInput
                style={styles.input}
                placeholder={t('auth:register.name')}
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                accessibilityLabel={t('auth:register.name')}
                accessibilityHint={t('auth:a11y.enterName')}
              />
            </GlassInputWrapper>
          )}

          <GlassInputWrapper>
            <Ionicons name="mail-outline" size={18} color="rgba(255,255,255,0.4)" />
            <TextInput
              style={styles.input}
              placeholder={t('auth:login.email')}
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              accessibilityLabel={t('auth:login.email')}
              accessibilityHint={t('auth:a11y.enterEmail')}
            />
          </GlassInputWrapper>

          {mode !== 'forgot' && (
            <GlassInputWrapper>
              <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.4)" />
              <TextInput
                style={styles.input}
                placeholder={t('auth:login.password')}
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                accessibilityLabel={t('auth:login.password')}
                accessibilityHint={t('auth:a11y.enterPassword')}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                accessibilityLabel={showPassword ? t('auth:a11y.hidePassword') : t('auth:a11y.showPassword')}
                accessibilityRole="button"
              >
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={18}
                  color="rgba(255,255,255,0.4)"
                />
              </TouchableOpacity>
            </GlassInputWrapper>
          )}

          {mode === 'register' && (
            <GlassInputWrapper>
              <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.4)" />
              <TextInput
                style={styles.input}
                placeholder={t('auth:register.confirmPassword')}
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                accessibilityLabel={t('auth:register.confirmPassword')}
                accessibilityHint={t('auth:a11y.enterConfirmPassword')}
              />
            </GlassInputWrapper>
          )}

          {mode === 'login' && (
            <TouchableOpacity
              style={styles.forgotLink}
              onPress={() => switchMode('forgot')}
              accessibilityLabel={t('auth:login.forgotPassword')}
              accessibilityRole="button"
              accessibilityHint={t('auth:a11y.openPasswordReset')}
            >
              <Text style={styles.forgotLinkText}>{t('auth:login.forgotPassword')}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.9}
            accessibilityLabel={
              mode === 'login' ? t('auth:login.loginButton') :
              mode === 'register' ? t('auth:createAccount') :
              t('auth:sendEmail')
            }
            accessibilityRole="button"
            accessibilityState={{ disabled: isLoading, busy: isLoading }}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {mode === 'login' && t('auth:login.loginButton')}
                {mode === 'register' && t('auth:createAccount')}
                {mode === 'forgot' && t('auth:sendEmail')}
              </Text>
            )}
          </TouchableOpacity>

          {mode === 'login' && (
            <TouchableOpacity
              onPress={() => switchMode('register')}
              style={styles.switchMode}
              accessibilityLabel={t('auth:a11y.noAccount')}
              accessibilityRole="button"
            >
              <Text style={styles.switchModeText}>
                {t('auth:login.noAccount')} <Text style={styles.switchModeLink}>{t('auth:login.signUp')}</Text>
              </Text>
            </TouchableOpacity>
          )}
          {mode === 'register' && (
            <TouchableOpacity
              onPress={() => switchMode('login')}
              style={styles.switchMode}
              accessibilityLabel={t('auth:a11y.haveAccount')}
              accessibilityRole="button"
            >
              <Text style={styles.switchModeText}>
                {t('auth:register.haveAccount')} <Text style={styles.switchModeLink}>{t('auth:register.login')}</Text>
              </Text>
            </TouchableOpacity>
          )}

          {appleAuthAvailable && (mode === 'login' || mode === 'register') && (
            <>
              <View style={styles.dividerRowSmall}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('auth:login.or')}</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={styles.appleButton}
                onPress={handleAppleSignIn}
                activeOpacity={0.8}
                disabled={isLoading}
                accessibilityLabel={t('auth:continueWithApple')}
                accessibilityRole="button"
                accessibilityState={{ disabled: isLoading }}
              >
                <Ionicons name="logo-apple" size={20} color="#fff" />
                <Text style={styles.appleButtonText}>{t('auth:continueWithApple')}</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      {/* Animated Gradient Background */}
      <AnimatedGradientBg />

      {/* Content */}
      <View style={[styles.content, { paddingTop: insets.top + 40 }]}>
        {/* Logo + Branding */}
        <Animated.View entering={FadeInDown.delay(200).duration(700)} style={styles.brandingSection}>
          <DrapeLogo size={72} gradient />
          <Text style={styles.brandName}>Drape</Text>
          <Text style={styles.tagline}>{t('auth:tagline')}</Text>
        </Animated.View>
      </View>

      {/* Blur Overlay when modal expanded */}
      <RNAnimated.View
        style={[styles.blurOverlay, { opacity: blurOpacity }]}
        pointerEvents={mode !== 'initial' ? 'auto' : 'none'}
      >
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFillObject} />
      </RNAnimated.View>

      {/* Bottom Modal */}
      <View style={styles.modalContainer}>
        <RNAnimated.View style={[styles.modal, { height: modalHeight, marginBottom: modalBottom, overflow: 'hidden' }]}>
          {isLiquidGlassSupported ? (
            <LiquidGlassView style={styles.liquidGlassModal} interactive={true} effect="clear" colorScheme="dark">
              <View style={styles.modalContent}>
                {renderModalContent()}
              </View>
            </LiquidGlassView>
          ) : (
            <BlurView intensity={60} tint="dark" style={styles.modalBlur}>
              <View style={styles.modalContent}>
                {renderModalContent()}
              </View>
            </BlurView>
          )}
        </RNAnimated.View>
      </View>

      {/* Footer - only show in initial mode */}
      {mode === 'initial' && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
          <Text style={styles.footerText}>
            {t('auth:termsFooter')}{' '}
            <Text style={styles.footerLink} onPress={() => Linking.openURL('https://www.drape-dev.it/terms-of-service.html')}>{t('auth:terms')}</Text>
            {' & '}
            <Text style={styles.footerLink} onPress={() => Linking.openURL('https://www.drape-dev.it/privacy-policy.html')}>{t('auth:privacy')}</Text>
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  // Branding
  brandingSection: {
    alignItems: 'center',
    marginTop: 40,
  },
  brandName: {
    fontSize: 54,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -1.6,
    marginTop: 16,
  },
  tagline: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  // Modal
  modalContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  modal: {
    marginHorizontal: 16,
    marginBottom: 90,
    borderRadius: 28,
    overflow: 'hidden',
  },
  modalBlur: {
    flex: 1,
    borderRadius: 28,
  },
  liquidGlassModal: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
  },
  modalContent: {
    flex: 1,
    padding: 24,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  initialButtons: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  primaryButton: {
    borderRadius: 28,
    overflow: 'hidden',
  },
  primaryButtonGradient: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  secondaryButton: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  formContent: {
    flex: 1,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  backButtonInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 25,
    paddingHorizontal: 18,
    marginBottom: 12,
    height: 50,
    overflow: 'hidden',
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#EF4444',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 25,
    paddingHorizontal: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 15,
    color: '#fff',
    marginLeft: 10,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginBottom: 16,
    marginTop: 4,
  },
  forgotLinkText: {
    fontSize: 13,
    color: AppColors.primary,
    fontWeight: '500',
  },
  submitButton: {
    height: 52,
    borderRadius: 26,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  switchMode: {
    alignItems: 'center',
    marginTop: 16,
  },
  switchModeText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  switchModeLink: {
    color: AppColors.primary,
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: 12,
    zIndex: 10,
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
  },
  footerLink: {
    color: AppColors.primary,
  },
  // Apple Sign In & Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 4,
  },
  dividerRowSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dividerText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginHorizontal: 12,
  },
  appleButton: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    gap: 10,
  },
  appleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  appleButtonSmall: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    gap: 8,
  },
  appleButtonTextSmall: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  verifyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  verifyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  verifyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  verifyMessage: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  checkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  checkingText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  resendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 8,
  },
  resendButtonSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  resendButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
});
