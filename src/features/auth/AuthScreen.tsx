import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Animated as RNAnimated,
  Modal,
  ScrollView,
  Linking,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { AppColors } from '../../shared/theme/colors';
import { DrapeLogo } from '../../shared/components/icons/DrapeLogo';
import { DevBanner } from '../../shared/components/DevBanner';
import {
  AnimatedGradientBg,
  DateWheelColumn,
  GlassBackButton,
  GlassInputWrapper,
} from './authScreenParts';
import { useAuthForm, padDateValue, formatDateOfBirthValue } from './useAuthForm';
import { styles } from './authScreenStyles';

const TERMS_URL = 'https://www.drape-dev.it/terms-of-service.html';
const PRIVACY_URL = 'https://www.drape-dev.it/privacy-policy.html';

export const AuthScreen = () => {
  const {
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
    verificationPassword,
    insets,
    months,
    years,
    availableDays,
    displayError,
    handleSubmit,
    switchMode,
    openDatePicker,
    confirmDatePicker,
    handleAppleSignIn,
  } = useAuthForm();

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
            <GlassBackButton onPress={() => switchMode('initial')} accessibilityLabel={backLabel} styles={styles} />
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
            <GlassInputWrapper styles={styles}>
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

          <GlassInputWrapper styles={styles}>
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
            <GlassInputWrapper styles={styles}>
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
            <GlassInputWrapper styles={styles}>
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
            <GlassInputWrapper styles={styles}>
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
        {/* Branding -- fills top space */}
        <View style={[styles.content, { paddingTop: insets.top + 40, flex: 1 }]}>
          <Animated.View entering={FadeInDown.delay(200).duration(700)} style={styles.brandingSection}>
            <DrapeLogo size={72} gradient />
            <Text style={styles.brandName}>Drape</Text>
            <Text style={styles.tagline}>{t('auth:tagline')}</Text>
          </Animated.View>
          <DevBanner />
        </View>
        {/* Modal -- sits at bottom, shrinks with keyboard via adjustResize */}
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
        <DevBanner />
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
