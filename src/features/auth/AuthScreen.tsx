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
import { DrapeLogo } from '../../shared/components/icons/DrapeLogo';
import { DevBanner } from '../../shared/components/DevBanner';
import {
  AnimatedGradientBg,
} from './authScreenParts';
import { AuthDatePickerModal, AuthFooterLinks, AuthModalContent } from './AuthModalContent';
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
            <AuthModalContent
              t={t}
              mode={mode}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              displayName={displayName}
              setDisplayName={setDisplayName}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              localError={localError}
              setLocalError={setLocalError}
              appleAuthAvailable={appleAuthAvailable}
              verificationEmail={verificationEmail}
              resendSuccess={resendSuccess}
              setResendSuccess={setResendSuccess}
              isAutoLogging={isAutoLogging}
              tosAccepted={tosAccepted}
              setTosAccepted={setTosAccepted}
              dateOfBirth={dateOfBirth}
              showParentalNotice={showParentalNotice}
              backLabel={backLabel}
              isLoading={isLoading}
              resendVerificationEmail={resendVerificationEmail}
              verificationPassword={verificationPassword}
              displayError={displayError}
              handleSubmit={handleSubmit}
              switchMode={switchMode}
              openDatePicker={openDatePicker}
              handleAppleSignIn={handleAppleSignIn}
              styles={styles}
              termsUrl={TERMS_URL}
              privacyUrl={PRIVACY_URL}
            />
          </View>
          {mode === 'initial' && (
            <AuthFooterLinks
              t={t}
              termsUrl={TERMS_URL}
              privacyUrl={PRIVACY_URL}
              footerStyle={{ alignItems: 'center', marginTop: 12 }}
              textStyle={styles.footerText}
              linkStyle={styles.footerLink}
              openLink={Linking.openURL}
            />
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
                <AuthModalContent
                  t={t}
                  mode={mode}
                  email={email}
                  setEmail={setEmail}
                  password={password}
                  setPassword={setPassword}
                  confirmPassword={confirmPassword}
                  setConfirmPassword={setConfirmPassword}
                  displayName={displayName}
                  setDisplayName={setDisplayName}
                  showPassword={showPassword}
                  setShowPassword={setShowPassword}
                  localError={localError}
                  setLocalError={setLocalError}
                  appleAuthAvailable={appleAuthAvailable}
                  verificationEmail={verificationEmail}
                  resendSuccess={resendSuccess}
                  setResendSuccess={setResendSuccess}
                  isAutoLogging={isAutoLogging}
                  tosAccepted={tosAccepted}
                  setTosAccepted={setTosAccepted}
                  dateOfBirth={dateOfBirth}
                  showParentalNotice={showParentalNotice}
                  backLabel={backLabel}
                  isLoading={isLoading}
                  resendVerificationEmail={resendVerificationEmail}
                  verificationPassword={verificationPassword}
                  displayError={displayError}
                  handleSubmit={handleSubmit}
                  switchMode={switchMode}
                  openDatePicker={openDatePicker}
                  handleAppleSignIn={handleAppleSignIn}
                  styles={styles}
                  termsUrl={TERMS_URL}
                  privacyUrl={PRIVACY_URL}
                />
              </View>
            </LiquidGlassView>
          ) : (
            <BlurView intensity={60} tint="dark" style={styles.modalBlur}>
              <View style={styles.modalContent}>
                <AuthModalContent
                  t={t}
                  mode={mode}
                  email={email}
                  setEmail={setEmail}
                  password={password}
                  setPassword={setPassword}
                  confirmPassword={confirmPassword}
                  setConfirmPassword={setConfirmPassword}
                  displayName={displayName}
                  setDisplayName={setDisplayName}
                  showPassword={showPassword}
                  setShowPassword={setShowPassword}
                  localError={localError}
                  setLocalError={setLocalError}
                  appleAuthAvailable={appleAuthAvailable}
                  verificationEmail={verificationEmail}
                  resendSuccess={resendSuccess}
                  setResendSuccess={setResendSuccess}
                  isAutoLogging={isAutoLogging}
                  tosAccepted={tosAccepted}
                  setTosAccepted={setTosAccepted}
                  dateOfBirth={dateOfBirth}
                  showParentalNotice={showParentalNotice}
                  backLabel={backLabel}
                  isLoading={isLoading}
                  resendVerificationEmail={resendVerificationEmail}
                  verificationPassword={verificationPassword}
                  displayError={displayError}
                  handleSubmit={handleSubmit}
                  switchMode={switchMode}
                  openDatePicker={openDatePicker}
                  handleAppleSignIn={handleAppleSignIn}
                  styles={styles}
                  termsUrl={TERMS_URL}
                  privacyUrl={PRIVACY_URL}
                />
              </View>
            </BlurView>
          )}
        </RNAnimated.View>
      </View>

      {/* Footer - only show in initial mode */}
      {mode === 'initial' && (
        <AuthFooterLinks
          t={t}
          termsUrl={TERMS_URL}
          privacyUrl={PRIVACY_URL}
          footerStyle={[styles.footer, { paddingBottom: insets.bottom + 8 }]}
          textStyle={styles.footerText}
          linkStyle={styles.footerLink}
          openLink={(url) => { void WebBrowser.openBrowserAsync(url); }}
        />
      )}

      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <AuthDatePickerModal
          visible={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          onConfirm={confirmDatePicker}
          previewValue={formatDateOfBirthValue(pickerDay, pickerMonth, pickerYear)}
          availableDays={availableDays}
          months={months}
          years={years}
          pickerDay={pickerDay}
          pickerMonth={pickerMonth}
          pickerYear={pickerYear}
          setPickerDay={setPickerDay}
          setPickerMonth={setPickerMonth}
          setPickerYear={setPickerYear}
          padDateValue={padDateValue}
          t={t}
          styles={styles}
        />
      </Modal>
    </View>
  );
};
