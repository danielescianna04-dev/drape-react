import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { AppColors } from '../../shared/theme/colors';
import { useAuthStore } from '../../core/auth/authStore';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';

// Enable auth session completion
WebBrowser.maybeCompleteAuthSession();

// Google OAuth client IDs - these need to be configured in Firebase Console
const GOOGLE_CLIENT_ID_IOS = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || '';
const GOOGLE_CLIENT_ID_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID || '';
const GOOGLE_CLIENT_ID_WEB = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB || '';

type AuthMode = 'login' | 'register' | 'forgot';

export const AuthScreen = () => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);

  const { signIn, signUp, signInWithGoogle, signInWithApple, resetPassword, isLoading, error, clearError } = useAuthStore();
  const insets = useSafeAreaInsets();

  // Google Auth hook
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: GOOGLE_CLIENT_ID_IOS,
    androidClientId: GOOGLE_CLIENT_ID_ANDROID,
    webClientId: GOOGLE_CLIENT_ID_WEB,
  });

  // Check Apple Sign In availability (iOS only)
  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setIsAppleAvailable);
    }
  }, []);

  // Handle Google auth response
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      if (id_token) {
        signInWithGoogle(id_token).catch(() => {
          // Error handled by store
        });
      }
    }
  }, [response]);

  const handleGoogleSignIn = async () => {
    setLocalError(null);
    clearError();
    try {
      await promptAsync();
    } catch (err) {
      setLocalError('Errore durante l\'accesso con Google');
    }
  };

  const handleAppleSignIn = async () => {
    setLocalError(null);
    clearError();
    try {
      await signInWithApple();
    } catch (err) {
      // Error handled by store
    }
  };

  const handleSubmit = async () => {
    setLocalError(null);
    clearError();

    // Validation
    if (!email.trim()) {
      setLocalError('Inserisci la tua email');
      return;
    }

    if (mode !== 'forgot' && !password) {
      setLocalError('Inserisci la password');
      return;
    }

    if (mode === 'register') {
      if (!displayName.trim()) {
        setLocalError('Inserisci il tuo nome');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('Le password non corrispondono');
        return;
      }
      if (password.length < 6) {
        setLocalError('La password deve avere almeno 6 caratteri');
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
          'Email inviata',
          'Controlla la tua casella email per il link di reset della password.',
          [{ text: 'OK', onPress: () => setMode('login') }]
        );
      }
    } catch (err) {
      // Error is handled by the store
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setLocalError(null);
    clearError();
  };

  const displayError = localError || error;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={['#0a0a0a', '#121212', '#0f0f0f']}
        style={StyleSheet.absoluteFillObject}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>D</Text>
            </View>
            <Text style={styles.appName}>Drape</Text>
            <Text style={styles.tagline}>Code with AI</Text>
          </Animated.View>

          {/* Form */}
          <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.formContainer}>
            {/* Title */}
            <Text style={styles.title}>
              {mode === 'login' && 'Bentornato'}
              {mode === 'register' && 'Crea un account'}
              {mode === 'forgot' && 'Reset password'}
            </Text>
            <Text style={styles.subtitle}>
              {mode === 'login' && 'Accedi per continuare'}
              {mode === 'register' && 'Inizia a programmare con l\'AI'}
              {mode === 'forgot' && 'Ti invieremo un link per reimpostare la password'}
            </Text>

            {/* Error */}
            {displayError && (
              <Animated.View entering={FadeIn.duration(200)} style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={18} color={AppColors.error} />
                <Text style={styles.errorText}>{displayError}</Text>
              </Animated.View>
            )}

            {/* Name input (register only) */}
            {mode === 'register' && (
              <Animated.View entering={FadeIn.duration(300)} style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color={AppColors.white.w40} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Nome"
                  placeholderTextColor={AppColors.white.w35}
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                  autoComplete="name"
                />
              </Animated.View>
            )}

            {/* Email input */}
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color={AppColors.white.w40} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={AppColors.white.w35}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            {/* Password input */}
            {mode !== 'forgot' && (
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color={AppColors.white.w40} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor={AppColors.white.w35}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={20}
                    color={AppColors.white.w40}
                  />
                </TouchableOpacity>
              </View>
            )}

            {/* Confirm Password (register only) */}
            {mode === 'register' && (
              <Animated.View entering={FadeIn.duration(300)} style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color={AppColors.white.w40} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Conferma password"
                  placeholderTextColor={AppColors.white.w35}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
              </Animated.View>
            )}

            {/* Forgot Password Link */}
            {mode === 'login' && (
              <TouchableOpacity
                style={styles.forgotButton}
                onPress={() => switchMode('forgot')}
              >
                <Text style={styles.forgotText}>Password dimenticata?</Text>
              </TouchableOpacity>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {mode === 'login' && 'Accedi'}
                  {mode === 'register' && 'Registrati'}
                  {mode === 'forgot' && 'Invia email'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Social Login Divider - only on login/register */}
            {mode !== 'forgot' && (
              <Animated.View entering={FadeIn.delay(300).duration(400)} style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>oppure</Text>
                <View style={styles.dividerLine} />
              </Animated.View>
            )}

            {/* Social Login Buttons - only on login/register */}
            {mode !== 'forgot' && (
              <Animated.View entering={FadeIn.delay(400).duration(400)} style={styles.socialContainer}>
                {/* Google Sign In */}
                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={handleGoogleSignIn}
                  disabled={isLoading || !request}
                  activeOpacity={0.8}
                >
                  <View style={styles.socialIconContainer}>
                    <Ionicons name="logo-google" size={20} color="#DB4437" />
                  </View>
                  <Text style={styles.socialButtonText}>
                    {mode === 'login' ? 'Accedi con Google' : 'Registrati con Google'}
                  </Text>
                </TouchableOpacity>

                {/* Apple Sign In - iOS only */}
                {Platform.OS === 'ios' && isAppleAvailable && (
                  <TouchableOpacity
                    style={[styles.socialButton, styles.appleButton]}
                    onPress={handleAppleSignIn}
                    disabled={isLoading}
                    activeOpacity={0.8}
                  >
                    <View style={styles.socialIconContainer}>
                      <Ionicons name="logo-apple" size={22} color="#fff" />
                    </View>
                    <Text style={[styles.socialButtonText, styles.appleButtonText]}>
                      {mode === 'login' ? 'Accedi con Apple' : 'Registrati con Apple'}
                    </Text>
                  </TouchableOpacity>
                )}
              </Animated.View>
            )}

            {/* Switch Mode */}
            <View style={styles.switchContainer}>
              {mode === 'login' && (
                <>
                  <Text style={styles.switchText}>Non hai un account?</Text>
                  <TouchableOpacity onPress={() => switchMode('register')}>
                    <Text style={styles.switchLink}>Registrati</Text>
                  </TouchableOpacity>
                </>
              )}
              {mode === 'register' && (
                <>
                  <Text style={styles.switchText}>Hai gia un account?</Text>
                  <TouchableOpacity onPress={() => switchMode('login')}>
                    <Text style={styles.switchLink}>Accedi</Text>
                  </TouchableOpacity>
                </>
              )}
              {mode === 'forgot' && (
                <>
                  <Text style={styles.switchText}>Ricordi la password?</Text>
                  <TouchableOpacity onPress={() => switchMode('login')}>
                    <Text style={styles.switchLink}>Torna al login</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Animated.View>

          {/* Footer */}
          <Animated.View entering={FadeInDown.delay(400).duration(600)} style={styles.footer}>
            <Text style={styles.footerText}>
              Continuando, accetti i nostri{' '}
              <Text style={styles.footerLink}>Termini di Servizio</Text>
              {' '}e la{' '}
              <Text style={styles.footerLink}>Privacy Policy</Text>
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  logoText: {
    fontSize: 40,
    fontWeight: '700',
    color: '#fff',
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 14,
    color: AppColors.white.w50,
    marginTop: 4,
  },
  formContainer: {
    backgroundColor: AppColors.white.w04,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: AppColors.white.w08,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: AppColors.white.w50,
    marginBottom: 24,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.errorAlpha.a15,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: AppColors.error,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.white.w06,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: AppColors.white.w08,
  },
  inputIcon: {
    marginLeft: 14,
  },
  input: {
    flex: 1,
    height: 52,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#fff',
  },
  eyeButton: {
    padding: 14,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: 20,
    marginTop: 4,
  },
  forgotText: {
    fontSize: 13,
    color: AppColors.primary,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: AppColors.primary,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    gap: 6,
  },
  switchText: {
    fontSize: 14,
    color: AppColors.white.w50,
  },
  switchLink: {
    fontSize: 14,
    color: AppColors.primary,
    fontWeight: '600',
  },
  footer: {
    marginTop: 32,
    paddingHorizontal: 20,
  },
  footerText: {
    fontSize: 12,
    color: AppColors.white.w35,
    textAlign: 'center',
    lineHeight: 18,
  },
  footerLink: {
    color: AppColors.primary,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: AppColors.white.w15,
  },
  dividerText: {
    fontSize: 13,
    color: AppColors.white.w40,
    marginHorizontal: 16,
  },
  socialContainer: {
    gap: 12,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 14,
    backgroundColor: AppColors.white.w06,
    borderWidth: 1,
    borderColor: AppColors.white.w10,
  },
  socialIconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  socialButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  appleButton: {
    backgroundColor: '#000',
    borderColor: AppColors.white.w25,
  },
  appleButtonText: {
    color: '#fff',
  },
});
