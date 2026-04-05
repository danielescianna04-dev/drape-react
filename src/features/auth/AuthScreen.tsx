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
  Modal,
  ScrollView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
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
import { tracciaLogin, tracciaRegistrazione, tracciaResetPassword, tracciaErrore, tracciaErroreLogin, tracciaErroreRegistrazione } from '../../core/services/analyticsService';

const TERMS_URL = 'https://www.drape-dev.it/terms-of-service.html';
const PRIVACY_URL = 'https://www.drape-dev.it/privacy-policy.html';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type AuthMode = 'initial' | 'login' | 'register' | 'forgot' | 'verify';

const padDateValue = (value: number) => value.toString().padStart(2, '0');
const formatDateOfBirthValue = (day: number, month: number, year: number) =>
  `${padDateValue(day)}/${padDateValue(month)}/${year}`;
const DATE_WHEEL_ITEM_HEIGHT = 44;
const DATE_WHEEL_VISIBLE_ITEMS = 5;
const DATE_WHEEL_PADDING = (DATE_WHEEL_ITEM_HEIGHT * (DATE_WHEEL_VISIBLE_ITEMS - 1)) / 2;

const parseDateOfBirthValue = (value: string) => {
  const parts = value.trim().split('/');
  if (parts.length !== 3) return null;
  const [dayStr, monthStr, yearStr] = parts;
  const day = parseInt(dayStr, 10);
  const month = parseInt(monthStr, 10);
  const year = parseInt(yearStr, 10);
  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null;
  return { day, month, year };
};

const getDaysInMonth = (month: number, year: number) => new Date(year, month, 0).getDate();

type DateWheelOption = {
  value: number;
  label: string;
};

const DateWheelColumn = ({
  label,
  options,
  selectedValue,
  onChange,
  visible,
}: {
  label: string;
  options: DateWheelOption[];
  selectedValue: number;
  onChange: (value: number) => void;
  visible: boolean;
}) => {
  const scrollRef = useRef<ScrollView>(null);
  const isProgrammaticScrollRef = useRef(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === selectedValue)
  );

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      isProgrammaticScrollRef.current = true;
      scrollRef.current?.scrollTo({
        y: selectedIndex * DATE_WHEEL_ITEM_HEIGHT,
        animated: false,
      });
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [visible, selectedIndex]);

  const snapToIndex = (index: number, animated: boolean) => {
    const clampedIndex = Math.max(0, Math.min(options.length - 1, index));
    const nextValue = options[clampedIndex]?.value;
    if (nextValue == null) return;
    if (nextValue !== selectedValue) {
      onChange(nextValue);
    }
    isProgrammaticScrollRef.current = true;
    scrollRef.current?.scrollTo({
      y: clampedIndex * DATE_WHEEL_ITEM_HEIGHT,
      animated,
    });
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
    });
  };

  const handleMomentumEnd = (offsetY: number) => {
    if (isProgrammaticScrollRef.current) return;
    const nextIndex = Math.round(offsetY / DATE_WHEEL_ITEM_HEIGHT);
    snapToIndex(nextIndex, false);
  };

  return (
    <View style={styles.dateWheelColumn}>
      <Text style={styles.dateWheelLabel}>{label}</Text>
      <View style={styles.dateWheelFrame}>
        <View pointerEvents="none" style={styles.dateWheelSelectionBand} />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(21, 16, 38, 0.98)', 'rgba(21, 16, 38, 0.78)', 'transparent']}
          style={styles.dateWheelFadeTop}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(21, 16, 38, 0.78)', 'rgba(21, 16, 38, 0.98)']}
          style={styles.dateWheelFadeBottom}
        />
        <ScrollView
          ref={scrollRef}
          style={styles.dateWheelScroll}
          contentContainerStyle={styles.dateWheelContent}
          showsVerticalScrollIndicator={false}
          snapToInterval={DATE_WHEEL_ITEM_HEIGHT}
          decelerationRate="fast"
          bounces={false}
          onMomentumScrollEnd={(event) => handleMomentumEnd(event.nativeEvent.contentOffset.y)}
        >
          {options.map((option, index) => (
            <TouchableOpacity
              key={`${label}-${option.value}`}
              style={styles.dateWheelItem}
              activeOpacity={0.8}
              onPress={() => snapToIndex(index, true)}
            >
              <Text
                style={[
                  styles.dateWheelItemText,
                  option.value === selectedValue && styles.dateWheelItemTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

// Animated gradient background — same as Create screen
const AnimatedGradientBg = () => {
  const bgMove = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    RNAnimated.loop(
      RNAnimated.timing(bgMove, {
        toValue: 1,
        duration: 6000,
        useNativeDriver: true,
        easing: (t: number) => t,
      })
    ).start();
  }, []);

  const bgShift1 = bgMove.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 15, 0] });
  const bgShift2 = bgMove.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -15, 0] });
  const bgScale1 = bgMove.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1.2, 1.25, 1.2] });
  const bgScale2 = bgMove.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1.22, 1.18, 1.22] });

  return (
    <View style={[StyleSheet.absoluteFillObject, { overflow: 'hidden' }]} pointerEvents="none">
      <RNAnimated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: bgShift1 }, { scale: bgScale1 }] }]}>
        <LinearGradient
          colors={['#1a0a2e', '#2d0845', AppColors.primary, '#0A0A0F']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.45 }]}
        />
      </RNAnimated.View>
      <RNAnimated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: bgShift2 }, { scale: bgScale2 }] }]}>
        <LinearGradient
          colors={['#0A0A0F', '#4c1d95', '#1a0a2e', '#0A0A0F']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.4 }]}
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
  const [tosAccepted, setTosAccepted] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerDay, setPickerDay] = useState(1);
  const [pickerMonth, setPickerMonth] = useState(1);
  const [pickerYear, setPickerYear] = useState(2000);
  const [showParentalNotice, setShowParentalNotice] = useState(false);
  const backLabel = t('common:back');

  const modalHeight = useRef(new RNAnimated.Value(200)).current;
  const modalBottom = useRef(new RNAnimated.Value(90)).current;
  const blurOpacity = useRef(new RNAnimated.Value(0)).current;
  const keyboardHeight = useRef(0);
  const baseMarginBottom = useRef(90);
  const baseModalHeight = useRef(200);
  const { signIn, signUp, signInWithApple, resetPassword, resendVerificationEmail, checkEmailVerified, isLoading, error, clearError } = useAuthStore();
  const insets = useSafeAreaInsets();
  const currentYear = new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, index) => ({
    value: index + 1,
    label: padDateValue(index + 1),
  }));
  const years = Array.from({ length: currentYear - 1899 }, (_, index) => currentYear - index);
  const availableDays = Array.from(
    { length: getDaysInMonth(pickerMonth, pickerYear) },
    (_, index) => index + 1
  );

  useEffect(() => {
    const maxDay = getDaysInMonth(pickerMonth, pickerYear);
    setPickerDay((current) => Math.min(current, maxDay));
  }, [pickerMonth, pickerYear]);

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
      const screenH = Dimensions.get('window').height;
      const idealBottom = keyboardHeight.current - insets.bottom + 10;
      // Shrink modal to fit between status bar and keyboard
      const availableH = screenH - keyboardHeight.current - insets.top - 20;
      const currentTargetH = (modalHeight as any)._value || 500;
      const fitHeight = Math.min(currentTargetH, availableH);

      RNAnimated.parallel([
        RNAnimated.timing(modalBottom, {
          toValue: idealBottom,
          duration: e.duration || 250,
          useNativeDriver: false,
        }),
        RNAnimated.timing(modalHeight, {
          toValue: fitHeight,
          duration: e.duration || 250,
          useNativeDriver: false,
        }),
      ]).start();
    };

    const onHide = (e: any) => {
      keyboardHeight.current = 0;
      RNAnimated.parallel([
        RNAnimated.timing(modalBottom, {
          toValue: baseMarginBottom.current,
          duration: e.duration || 250,
          useNativeDriver: false,
        }),
        RNAnimated.timing(modalHeight, {
          toValue: baseModalHeight.current,
          duration: e.duration || 250,
          useNativeDriver: false,
        }),
      ]).start();
    };

    const sub1 = Keyboard.addListener(showEvent, onShow);
    const sub2 = Keyboard.addListener(hideEvent, onHide);
    return () => { sub1.remove(); sub2.remove(); };
  }, [insets.bottom]);

  useEffect(() => {
    let targetHeight = 200; // Initial state
    if (mode === 'login') targetHeight = 500; // Added Apple button
    if (mode === 'register') targetHeight = 700; // ToS checkbox + DOB + Apple button
    if (mode === 'forgot') targetHeight = 300;
    if (mode === 'verify') targetHeight = 340;

    const showBlur = mode !== 'initial';
    const targetMarginBottom = mode === 'initial' ? 90 : 30;
    baseMarginBottom.current = targetMarginBottom;
    baseModalHeight.current = targetHeight;

    // When returning to initial, reset keyboard state to avoid race conditions
    if (mode === 'initial') {
      keyboardHeight.current = 0;
    }

    const bottomTarget = keyboardHeight.current > 0
      ? keyboardHeight.current - insets.bottom + 10
      : targetMarginBottom;

    // Stop any in-progress animations to prevent stale values
    modalHeight.stopAnimation();
    modalBottom.stopAnimation();
    blurOpacity.stopAnimation();

    // Small delay to let keyboard dismiss animation finish before we animate
    const delay = mode === 'initial' ? 50 : 0;
    setTimeout(() => {
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
    }, delay);

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
      // GDPR Point 7: ToS acceptance required
      if (!tosAccepted) {
        setLocalError(t('auth:gdpr.tosRequired'));
        return;
      }
      // GDPR Point 20: Age gate validation
      if (!dateOfBirth.trim()) {
        setLocalError(t('auth:gdpr.ageRequired'));
        return;
      }
      const parsedDob = parseDateOfBirthValue(dateOfBirth);
      if (!parsedDob) {
        setLocalError(t('auth:gdpr.ageInvalidFormat'));
        return;
      }
      const { day, month, year } = parsedDob;
      if (isNaN(day) || isNaN(month) || isNaN(year) || day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > new Date().getFullYear()) {
        setLocalError(t('auth:gdpr.ageInvalidFormat'));
        return;
      }
      const birthDate = new Date(year, month - 1, day);
      const now = new Date();
      let age = now.getFullYear() - birthDate.getFullYear();
      const monthDiff = now.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
        age--;
      }
      if (age < 13) {
        setLocalError(t('auth:gdpr.underAge'));
        return;
      }
      if (age >= 13 && age < 16) {
        setShowParentalNotice(true);
      }
    }

    try {
      if (mode === 'login') {
        await signIn(email.trim(), password);
        tracciaLogin('email');
      } else if (mode === 'register') {
        await signUp(email.trim(), password, displayName.trim());
        tracciaRegistrazione();
        // GDPR Point 7 + 20: tosAcceptedAt and ageConfirmedAt are saved
        // in authStore.signUp as part of the initial user document creation.
        // Registration successful
        const skipVerification = process.env.EXPO_PUBLIC_ENV === 'development' || process.env.EXPO_PUBLIC_ENV === 'preview';
        if (!skipVerification) {
          setVerificationEmail(email.trim());
          setVerificationPassword(password);
          setMode('verify');
          setResendSuccess(false);
          return;
        }
        // Dev: user is already signed in from signUp, no verify needed
      } else if (mode === 'forgot') {
        await resetPassword(email.trim());
        tracciaResetPassword();
        Alert.alert(
          t('auth:forgotPassword.sent'),
          t('auth:forgotPassword.sentMessage'),
          [{ text: t('common:ok'), onPress: () => setMode('login') }]
        );
      }
    } catch (err: any) {
      tracciaErrore(err?.message || 'Auth error', mode);
      if (mode === 'login') {
        tracciaErroreLogin('email', err?.message || 'Unknown error');
      } else if (mode === 'register') {
        tracciaErroreRegistrazione(err?.message || 'Unknown error');
      }
    }
  };

  const switchMode = (newMode: AuthMode) => {
    Keyboard.dismiss();
    setMode(newMode);
    setLocalError(null);
    clearError();
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setDisplayName('');
    setTosAccepted(false);
    setDateOfBirth('');
    setShowDatePicker(false);
    setPickerDay(1);
    setPickerMonth(1);
    setPickerYear(2000);
    setShowParentalNotice(false);
  };

  const openDatePicker = () => {
    Keyboard.dismiss();
    const parsed = parseDateOfBirthValue(dateOfBirth);
    if (parsed) {
      setPickerDay(parsed.day);
      setPickerMonth(parsed.month);
      setPickerYear(parsed.year);
    } else {
      setPickerDay(1);
      setPickerMonth(1);
      setPickerYear(2000);
    }
    setShowDatePicker(true);
  };

  const confirmDatePicker = () => {
    setDateOfBirth(formatDateOfBirthValue(pickerDay, pickerMonth, pickerYear));
    setShowDatePicker(false);
  };

  const handleAppleSignIn = async () => {
    try {
      setLocalError(null);
      clearError();
      await signInWithApple();
      tracciaLogin('apple');
    } catch (err: any) {
      if (err.message !== t('auth:errors.appleLoginCancelled')) {
        setLocalError(err.message || t('auth:errors.appleLoginError'));
        tracciaErrore(err.message || 'Apple login error', 'apple_sign_in');
        tracciaErroreLogin('apple', err.message || 'Unknown error');
      }
    }
  };

  const displayError = localError || error;

  const renderModalContent = () => (
    <>
      <View style={styles.modalHandle} />

      {/* Initial State */}
      {mode === 'initial' && (
        <Animated.View entering={FadeIn.duration(300)} style={Platform.OS === 'android' ? { gap: 12 } : styles.initialButtons}>
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
        <Animated.View entering={FadeIn.duration(300)} style={[styles.formContent, styles.verifyFlow]}>
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
              <View style={styles.verifyContentBlock}>
                <View style={styles.verifyIconContainer}>
                  <Ionicons name="mail-outline" size={36} color={AppColors.primary} />
                </View>
                <Text style={styles.verifyTitle}>{t('auth:emailVerification.title')}</Text>
                <Text style={styles.verifyMessage}>
                  {t('auth:emailVerification.message', { email: verificationEmail })}
                </Text>
                <View style={styles.verifyStatusRow}>
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.45)" />
                  <Text style={styles.verifyStatusText}>{t('auth:emailVerification.checking')}</Text>
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
        <Animated.View entering={FadeIn.duration(300)} style={Platform.OS === 'android' ? {} : styles.formContent}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
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
                textContentType={mode === 'login' ? 'password' : 'none'}
                autoComplete={mode === 'login' ? 'password' : 'off'}
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
                textContentType="none"
                autoComplete="off"
                accessibilityLabel={t('auth:register.confirmPassword')}
                accessibilityHint={t('auth:a11y.enterConfirmPassword')}
              />
            </GlassInputWrapper>
          )}

          {/* GDPR Point 20: Date of Birth / Age Gate */}
          {mode === 'register' && (
            <GlassInputWrapper>
              <Ionicons name="calendar-outline" size={18} color="rgba(255,255,255,0.4)" />
              <TouchableOpacity
                style={styles.datePickerTrigger}
                onPress={openDatePicker}
                activeOpacity={0.8}
                accessibilityLabel={t('auth:gdpr.dateOfBirth')}
                accessibilityRole="button"
              >
                <Text style={[styles.datePickerText, !dateOfBirth && styles.datePickerPlaceholder]}>
                  {dateOfBirth || t('auth:gdpr.dateOfBirthPlaceholder')}
                </Text>
                <Ionicons name="chevron-down" size={18} color="rgba(255,255,255,0.35)" />
              </TouchableOpacity>
            </GlassInputWrapper>
          )}

          {/* GDPR Point 20: Parental consent notice for 13-16 */}
          {mode === 'register' && showParentalNotice && (
            <View style={styles.parentalNotice}>
              <Ionicons name="information-circle" size={16} color="#F59E0B" />
              <Text style={styles.parentalNoticeText}>{t('auth:gdpr.parentalConsent')}</Text>
            </View>
          )}

          {/* GDPR Point 7: ToS / Privacy checkbox */}
          {mode === 'register' && (
            <TouchableOpacity
              style={styles.tosRow}
              onPress={() => setTosAccepted(!tosAccepted)}
              activeOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: tosAccepted }}
            >
              <View style={[styles.tosCheckbox, tosAccepted && styles.tosCheckboxChecked]}>
                {tosAccepted && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={styles.tosText}>
                {t('auth:gdpr.tosCheckbox')}{' '}
                <Text style={styles.tosLink} onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}>{t('auth:gdpr.tosLink')}</Text>
                {' '}{t('auth:gdpr.tosAnd')}{' '}
                <Text style={styles.tosLink} onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}>{t('auth:gdpr.privacyLink')}</Text>
              </Text>
            </TouchableOpacity>
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
            style={[styles.submitButton, (isLoading || (mode === 'register' && !tosAccepted)) && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading || (mode === 'register' && !tosAccepted)}
            activeOpacity={0.9}
            accessibilityLabel={
              mode === 'login' ? t('auth:login.loginButton') :
              mode === 'register' ? t('auth:createAccount') :
              t('auth:sendEmail')
            }
            accessibilityRole="button"
            accessibilityState={{ disabled: isLoading || (mode === 'register' && !tosAccepted), busy: isLoading }}
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
          </ScrollView>
        </Animated.View>
      )}
    </>
  );

  // Android: flex layout so adjustResize naturally pushes modal above keyboard
  if (Platform.OS === 'android') {
    return (
      <View style={styles.container}>
        <AnimatedGradientBg />
        {/* Branding — fills top space */}
        <View style={[styles.content, { paddingTop: insets.top + 40, flex: 1 }]}>
          <Animated.View entering={FadeInDown.delay(200).duration(700)} style={styles.brandingSection}>
            <DrapeLogo size={72} gradient />
            <Text style={styles.brandName}>Drape</Text>
            <Text style={styles.tagline}>{t('auth:tagline')}</Text>
          </Animated.View>
        </View>
        {/* Modal — sits at bottom, shrinks with keyboard via adjustResize */}
        <View style={{ marginHorizontal: 16, paddingBottom: 16 }}>
          <View style={{
            borderRadius: 28,
            backgroundColor: 'rgba(18, 14, 35, 0.95)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            padding: 24,
          }}>
            {renderModalContent()}
          </View>
          {mode === 'initial' && (
            <View style={{ alignItems: 'center', marginTop: 12 }}>
              <Text style={styles.footerText}>
                {t('auth:termsFooter')}{' '}
                <Text style={styles.footerLink} onPress={() => Linking.openURL('https://www.drape-dev.it/terms-of-service.html')}>{t('auth:terms')}</Text>
                {' & '}
                <Text style={styles.footerLink} onPress={() => Linking.openURL('https://www.drape-dev.it/privacy-policy.html')}>{t('auth:privacy')}</Text>
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // iOS: original layout with absolute modal + blur + keyboard animation
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
            <Text style={styles.footerLink} onPress={() => WebBrowser.openBrowserAsync('https://www.drape-dev.it/terms-of-service.html')}>{t('auth:terms')}</Text>
            {' & '}
            <Text style={styles.footerLink} onPress={() => WebBrowser.openBrowserAsync('https://www.drape-dev.it/privacy-policy.html')}>{t('auth:privacy')}</Text>
          </Text>
        </View>
      )}

      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={styles.datePickerOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setShowDatePicker(false)} />
          <View style={styles.datePickerSheet}>
            <View style={styles.datePickerToolbar}>
              <TouchableOpacity
                style={styles.datePickerToolbarButton}
                onPress={() => setShowDatePicker(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.datePickerToolbarSecondaryText}>{t('common:cancel')}</Text>
              </TouchableOpacity>
              <Text style={styles.datePickerTitle}>{t('auth:gdpr.dateOfBirth')}</Text>
              <TouchableOpacity
                style={styles.datePickerToolbarButton}
                onPress={confirmDatePicker}
                activeOpacity={0.8}
              >
                <Text style={styles.datePickerToolbarPrimaryText}>{t('common:confirm')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.datePickerPreview}>
              {formatDateOfBirthValue(pickerDay, pickerMonth, pickerYear)}
            </Text>

            <View style={styles.datePickerColumns}>
              <DateWheelColumn
                label="GG"
                options={availableDays.map((day) => ({ value: day, label: padDateValue(day) }))}
                selectedValue={pickerDay}
                onChange={setPickerDay}
                visible={showDatePicker}
              />
              <DateWheelColumn
                label="MM"
                options={months}
                selectedValue={pickerMonth}
                onChange={setPickerMonth}
                visible={showDatePicker}
              />
              <DateWheelColumn
                label="AAAA"
                options={years.map((year) => ({ value: year, label: year.toString() }))}
                selectedValue={pickerYear}
                onChange={setPickerYear}
                visible={showDatePicker}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
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
  androidModalBg: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: 'rgba(18, 14, 35, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
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
  datePickerTrigger: {
    flex: 1,
    height: 50,
    marginLeft: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  datePickerText: {
    fontSize: 15,
    color: '#fff',
  },
  datePickerPlaceholder: {
    color: 'rgba(255,255,255,0.3)',
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
  verifyFlow: {
    justifyContent: 'center',
    transform: [{ translateY: -18 }],
  },
  verifyContentBlock: {
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 18,
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
    marginBottom: 12,
  },
  verifyStatusText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
  verifyStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    marginBottom: 14,
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
  // GDPR: ToS checkbox styles
  tosRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  tosCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  tosCheckboxChecked: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  tosText: {
    flex: 1,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 18,
  },
  tosLink: {
    color: AppColors.primary,
    textDecorationLine: 'underline' as const,
  },
  // GDPR: Parental notice styles
  parentalNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  parentalNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#F59E0B',
    lineHeight: 17,
  },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  datePickerSheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: 'rgba(21, 16, 38, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(145,119,255,0.22)',
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  datePickerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    flex: 1,
  },
  datePickerToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  datePickerToolbarButton: {
    minWidth: 70,
    paddingVertical: 10,
  },
  datePickerToolbarSecondaryText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.68)',
    fontWeight: '500',
  },
  datePickerToolbarPrimaryText: {
    fontSize: 16,
    color: AppColors.primary,
    fontWeight: '700',
    textAlign: 'right',
  },
  datePickerColumns: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  dateWheelColumn: {
    flex: 1,
  },
  dateWheelLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.42)',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.8,
  },
  dateWheelFrame: {
    height: DATE_WHEEL_ITEM_HEIGHT * DATE_WHEEL_VISIBLE_ITEMS,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    position: 'relative',
  },
  dateWheelSelectionBand: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: DATE_WHEEL_PADDING,
    height: DATE_WHEEL_ITEM_HEIGHT,
    borderRadius: 16,
    backgroundColor: 'rgba(109, 76, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(139,111,255,0.38)',
    zIndex: 2,
  },
  dateWheelFadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: DATE_WHEEL_PADDING,
    zIndex: 3,
  },
  dateWheelFadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: DATE_WHEEL_PADDING,
    zIndex: 3,
  },
  dateWheelScroll: {
    flex: 1,
  },
  dateWheelContent: {
    paddingVertical: DATE_WHEEL_PADDING,
  },
  dateWheelItem: {
    height: DATE_WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  dateWheelItemText: {
    fontSize: 20,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
  },
  dateWheelItemTextActive: {
    color: '#fff',
  },
  datePickerPreview: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 18,
    letterSpacing: 0.6,
  },
});
