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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { useTranslation } from 'react-i18next';
import { AppColors } from '../../shared/theme/colors';
import { useAuthStore } from '../../core/auth/authStore';
import * as AppleAuthentication from 'expo-apple-authentication';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type AuthMode = 'initial' | 'login' | 'register' | 'forgot';

// Animated glow orb component
const AnimatedGlow = ({ style, durationY = 5000, durationX = 6000 }: { style: any; durationY?: number; durationX?: number }) => {
  const translateY = useRef(new RNAnimated.Value(-25)).current;
  const translateX = useRef(new RNAnimated.Value(-20)).current;

  useEffect(() => {
    // Floating animation Y
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(translateY, {
          toValue: 25,
          duration: durationY,
          useNativeDriver: true,
          easing: (t) => Math.sin(t * Math.PI),
        }),
        RNAnimated.timing(translateY, {
          toValue: -25,
          duration: durationY,
          useNativeDriver: true,
          easing: (t) => Math.sin(t * Math.PI),
        }),
      ])
    ).start();

    // Floating animation X
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(translateX, {
          toValue: 20,
          duration: durationX,
          useNativeDriver: true,
          easing: (t) => Math.sin(t * Math.PI),
        }),
        RNAnimated.timing(translateX, {
          toValue: -20,
          duration: durationX,
          useNativeDriver: true,
          easing: (t) => Math.sin(t * Math.PI),
        }),
      ])
    ).start();
  }, []);

  return (
    <RNAnimated.View
      style={[
        styles.glowOrb,
        style,
        {
          transform: [
            { translateY },
            { translateX },
          ],
        },
      ]}
    />
  );
};

// Terminal typing animation component
const TerminalTyping = () => {
  const [lines, setLines] = useState<{ text: string; isTyping: boolean; color?: string }[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);

  const codeLines = [
    { text: '$ npm create drape-app', color: '#10B981' },
    { text: '', color: '#fff' },
    { text: 'Creating your project...', color: '#6B7280' },
    { text: '', color: '#fff' },
    { text: 'import { AI } from "@drape/core"', color: '#C084FC' },
    { text: 'import { Preview } from "@drape/live"', color: '#C084FC' },
    { text: '', color: '#fff' },
    { text: 'const app = new AI({', color: '#F472B6' },
    { text: '  model: "claude-sonnet",', color: '#60A5FA' },
    { text: '  preview: true,', color: '#60A5FA' },
    { text: '})', color: '#F472B6' },
    { text: '', color: '#fff' },
    { text: 'await app.generate("Build me an app")', color: '#34D399' },
    { text: '', color: '#fff' },
    { text: '✓ App generated successfully!', color: '#10B981' },
  ];

  useEffect(() => {
    if (currentLineIndex >= codeLines.length) {
      // Animation complete - stay as is, don't reset
      return;
    }

    const currentLine = codeLines[currentLineIndex];

    if (currentCharIndex === 0) {
      // Start new line
      setLines(prev => [...prev, { text: '', isTyping: true, color: currentLine.color }]);
    }

    if (currentCharIndex < currentLine.text.length) {
      // Type next character
      const timeout = setTimeout(() => {
        setLines(prev => {
          const newLines = [...prev];
          const lastIndex = newLines.length - 1;
          newLines[lastIndex] = {
            ...newLines[lastIndex],
            text: currentLine.text.substring(0, currentCharIndex + 1),
          };
          return newLines;
        });
        setCurrentCharIndex(prev => prev + 1);
      }, 30 + Math.random() * 40); // Random typing speed
      return () => clearTimeout(timeout);
    } else {
      // Line complete, move to next
      const timeout = setTimeout(() => {
        setLines(prev => {
          const newLines = [...prev];
          const lastIndex = newLines.length - 1;
          newLines[lastIndex] = { ...newLines[lastIndex], isTyping: false };
          return newLines;
        });
        setCurrentLineIndex(prev => prev + 1);
        setCurrentCharIndex(0);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [currentLineIndex, currentCharIndex]);

  return (
    <View style={styles.terminalWindow}>
      {/* Terminal Header */}
      <View style={styles.terminalHeader}>
        <View style={styles.terminalButtons}>
          <View style={[styles.terminalBtn, { backgroundColor: '#FF5F56' }]} />
          <View style={[styles.terminalBtn, { backgroundColor: '#FFBD2E' }]} />
          <View style={[styles.terminalBtn, { backgroundColor: '#27CA40' }]} />
        </View>
        <Text style={styles.terminalTitle}>drape — zsh</Text>
        <View style={{ width: 52 }} />
      </View>

      {/* Terminal Content */}
      <View style={styles.terminalContent}>
        {lines.map((line, index) => (
          <View key={index} style={styles.terminalLine}>
            <Text style={[styles.terminalText, { color: line.color || '#fff' }]}>
              {line.text}
              {line.isTyping && <Text style={styles.cursor}>▋</Text>}
            </Text>
          </View>
        ))}
        {lines.length === 0 && (
          <View style={styles.terminalLine}>
            <Text style={[styles.terminalText, { color: '#10B981' }]}>
              $ <Text style={styles.cursor}>▋</Text>
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

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
const GlassBackButton = ({ onPress }: { onPress: () => void }) => {
  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView style={styles.glassBackButton} interactive={true} effect="clear" colorScheme="dark">
        <TouchableOpacity onPress={onPress} style={styles.backButtonInner}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
      </LiquidGlassView>
    );
  }
  return (
    <TouchableOpacity style={styles.backButton} onPress={onPress}>
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

  const modalHeight = useRef(new RNAnimated.Value(200)).current;
  const modalBottom = useRef(new RNAnimated.Value(90)).current;
  const blurOpacity = useRef(new RNAnimated.Value(0)).current;
  const keyboardHeight = useRef(0);
  const baseMarginBottom = useRef(90);
  const { signIn, signUp, signInWithApple, resetPassword, isLoading, error, clearError } = useAuthStore();
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

    const showBlur = mode !== 'initial';
    const targetMarginBottom = mode === 'initial' ? 90 : 30;
    baseMarginBottom.current = targetMarginBottom;

    // Only animate bottom if keyboard is NOT open
    const bottomTarget = keyboardHeight.current > 0
      ? keyboardHeight.current - insets.bottom + 10
      : targetMarginBottom;

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
      RNAnimated.timing(blurOpacity, {
        toValue: showBlur ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [mode]);

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
      setLocalError(t('auth:errors.invalidEmail') || 'Please enter a valid email address');
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
          >
            <Text style={styles.secondaryButtonText}>{t('auth:alreadyHaveAccount')}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Form State */}
      {mode !== 'initial' && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.formContent}>
          <View style={styles.formHeader}>
            <GlassBackButton onPress={() => switchMode('initial')} />
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
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
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
              />
            </GlassInputWrapper>
          )}

          {mode === 'login' && (
            <TouchableOpacity
              style={styles.forgotLink}
              onPress={() => switchMode('forgot')}
            >
              <Text style={styles.forgotLinkText}>{t('auth:login.forgotPassword')}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isLoading}
            activeOpacity={0.9}
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
            <TouchableOpacity onPress={() => switchMode('register')} style={styles.switchMode}>
              <Text style={styles.switchModeText}>
                {t('auth:login.noAccount')} <Text style={styles.switchModeLink}>{t('auth:login.signUp')}</Text>
              </Text>
            </TouchableOpacity>
          )}
          {mode === 'register' && (
            <TouchableOpacity onPress={() => switchMode('login')} style={styles.switchMode}>
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
      {/* Background */}
      <LinearGradient
        colors={['#0a0a0f', '#0f0f18', '#0a0a0f']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Background Glow Effects */}
      <View style={styles.glowContainer}>
        <AnimatedGlow style={styles.glowOrb1} durationY={5000} durationX={6000} />
        <AnimatedGlow style={styles.glowOrb2} durationY={6000} durationX={5000} />
      </View>

      {/* Content */}
      <View style={[styles.content, { paddingTop: insets.top + 20 }]}>
        {/* Terminal Animation */}
        <Animated.View entering={FadeInDown.delay(200).duration(800)} style={styles.terminalContainer}>
          <TerminalTyping />
        </Animated.View>

        {/* Branding */}
        <Animated.View entering={FadeInDown.delay(400).duration(600)} style={styles.brandingSection}>
          <Text style={styles.brandName}>Drape</Text>
          <Text style={styles.tagline}>Code with AI</Text>
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
            {t('auth:termsFooter')} <Text style={styles.footerLink}>{t('auth:terms')}</Text> & <Text style={styles.footerLink}>{t('auth:privacy')}</Text>
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
  glowContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  glowOrb: {
    position: 'absolute',
    borderRadius: 999,
  },
  glowOrb1: {
    width: 400,
    height: 400,
    top: 60,
    right: -120,
    backgroundColor: '#7C3AED',
    opacity: 0.2,
  },
  glowOrb2: {
    width: 150,
    height: 150,
    bottom: 180,
    left: -40,
    backgroundColor: '#7C3AED',
    opacity: 0.18,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  // Terminal Styles
  terminalContainer: {
    marginTop: 20,
  },
  terminalWindow: {
    backgroundColor: '#1a1a24',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2a2a36',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  terminalButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  terminalBtn: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  terminalTitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  terminalContent: {
    padding: 16,
    height: 260,
    overflow: 'hidden',
  },
  terminalLine: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  terminalText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  cursor: {
    color: '#10B981',
    opacity: 1,
  },
  // Branding
  brandingSection: {
    alignItems: 'center',
    marginTop: 32,
  },
  brandName: {
    fontSize: 42,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 6,
    fontWeight: '500',
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
});
