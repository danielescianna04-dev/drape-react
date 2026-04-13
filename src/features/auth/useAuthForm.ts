import { useState, useEffect, useRef } from 'react';
import {
  Keyboard,
  Platform,
  Dimensions,
  Alert,
  Animated as RNAnimated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../core/auth/authStore';
import * as AppleAuthentication from 'expo-apple-authentication';
import { tracciaLogin, tracciaRegistrazione, tracciaResetPassword, tracciaErrore, tracciaErroreLogin, tracciaErroreRegistrazione } from '../../core/services/analyticsService';

export type AuthMode = 'initial' | 'login' | 'register' | 'forgot' | 'verify';

const padDateValue = (value: number) => value.toString().padStart(2, '0');
const formatDateOfBirthValue = (day: number, month: number, year: number) =>
  `${padDateValue(day)}/${padDateValue(month)}/${year}`;

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

export { padDateValue, formatDateOfBirthValue, parseDateOfBirthValue, getDaysInMonth };

export const useAuthForm = () => {
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
      // JS-driven animations (height + margin) -- separate from native-driven
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

    // Native-driven animation (opacity) -- must run separately
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
            // signIn sets user in store -> App.tsx navigates away from auth screen
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

  return {
    t,
    mode,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    displayName,
    setDisplayName,
    showPassword,
    setShowPassword,
    localError,
    setLocalError,
    appleAuthAvailable,
    verificationEmail,
    verificationPassword,
    resendSuccess,
    setResendSuccess,
    isAutoLogging,
    tosAccepted,
    setTosAccepted,
    dateOfBirth,
    showDatePicker,
    setShowDatePicker,
    pickerDay,
    setPickerDay,
    pickerMonth,
    setPickerMonth,
    pickerYear,
    setPickerYear,
    showParentalNotice,
    backLabel,
    modalHeight,
    modalBottom,
    blurOpacity,
    isLoading,
    resendVerificationEmail,
    insets,
    currentYear,
    months,
    years,
    availableDays,
    displayError,
    handleSubmit,
    switchMode,
    openDatePicker,
    confirmDatePicker,
    handleAppleSignIn,
  };
};
