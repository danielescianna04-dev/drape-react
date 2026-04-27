import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { I18nextProvider } from 'react-i18next';
import type i18nType from '../i18n';
import { SplashScreen } from '../features/splash/SplashScreen';
import { AuthScreen } from '../features/auth/AuthScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { OnboardingFlowScreen } from '../features/onboarding/OnboardingFlowScreen';
import { FirstProjectChoiceScreen } from '../features/onboarding/FirstProjectChoiceScreen';
import { ImportGitHubModal } from '../features/terminal/components/ImportGitHubModal';
import { GitHubAuthModal } from '../features/terminal/components/GitHubAuthModal';
import { LoadingModal } from '../shared/components/molecules/LoadingModal';
import { GitAuthPopup } from '../features/terminal/components/GitAuthPopup';
import { OfflineOverlay } from '../shared/components/OfflineOverlay';
import { InAppToast } from '../shared/components/InAppToast';
import { ConsentBanner } from '../core/components/ConsentBanner';

export const SplashRoute = ({
  onFinish,
}: {
  onFinish: () => void;
}) => (
  <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0D0816' }}>
    <SafeAreaProvider style={{ backgroundColor: '#0D0816' }}>
      <SplashScreen onFinish={onFinish} />
      <StatusBar style="light" />
    </SafeAreaProvider>
  </GestureHandlerRootView>
);

export const NativeLoadingRoute = () => (
  <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0D0816' }}>
    <SafeAreaProvider style={{ backgroundColor: '#0D0816' }}>
      <View style={{ flex: 1, backgroundColor: '#0D0816' }} />
      <StatusBar style="light" />
    </SafeAreaProvider>
  </GestureHandlerRootView>
);

export const ForceUpdateRoute = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
    <SafeAreaProvider style={{ backgroundColor: '#0a0a0a' }}>
      {children}
    </SafeAreaProvider>
  </GestureHandlerRootView>
);

export const AuthRoute = ({
  i18n,
}: {
  i18n: typeof i18nType;
}) => (
  <I18nextProvider i18n={i18n}>
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
      <SafeAreaProvider style={{ backgroundColor: '#000' }}>
        <AuthScreen />
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  </I18nextProvider>
);

export const OnboardingPlansRoute = ({
  i18n,
  onClose,
}: {
  i18n: typeof i18nType;
  onClose: () => void;
}) => (
  <I18nextProvider i18n={i18n}>
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
      <SafeAreaProvider style={{ backgroundColor: '#000' }}>
        <SettingsScreen
          onClose={onClose}
          initialShowPlans={true}
          initialPlanIndex={1}
        />
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  </I18nextProvider>
);

export const OnboardingFlowRoute = ({
  i18n,
  userId,
  initialStep,
  experienceLevel,
  referralSource,
  onExperienceLevelChange,
  onReferralSourceChange,
  onComplete,
}: {
  i18n: typeof i18nType;
  userId: string;
  initialStep: 'welcome' | 'experience' | 'referral' | 'consent';
  experienceLevel: string | null;
  referralSource: string | null;
  onExperienceLevelChange: (value: string | null) => void;
  onReferralSourceChange: (value: string | null) => void;
  onComplete: () => void;
}) => (
  <I18nextProvider i18n={i18n}>
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0A0A0F' }}>
      <SafeAreaProvider style={{ backgroundColor: '#0A0A0F' }}>
        <OnboardingFlowScreen
          userId={userId}
          initialStep={initialStep}
          experienceLevel={experienceLevel}
          referralSource={referralSource}
          onExperienceLevelChange={onExperienceLevelChange}
          onReferralSourceChange={onReferralSourceChange}
          onComplete={onComplete}
        />
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  </I18nextProvider>
);

export const FirstProjectChoiceRoute = ({
  i18n,
  onBack,
  onCreate,
  onCloneOpen,
  showImportModal,
  onCloseImport,
  onImport,
  isImporting,
  showAuthModal,
  onCloseAuth,
  onAuthenticated,
  loadingMessage,
  onSkip,
}: {
  i18n: typeof i18nType;
  onBack: () => void;
  onCreate: () => void;
  onCloneOpen: () => void;
  showImportModal: boolean;
  onCloseImport: () => void;
  onImport: (url: string, branch?: string) => void;
  isImporting: boolean;
  showAuthModal: boolean;
  onCloseAuth: () => void;
  onAuthenticated: (token: string) => void;
  loadingMessage: string;
  onSkip?: () => void;
}) => (
  <I18nextProvider i18n={i18n}>
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0A0A0F' }}>
      <SafeAreaProvider style={{ backgroundColor: '#0A0A0F' }}>
        <View style={{ flex: 1, backgroundColor: '#0A0A0F' }}>
          <FirstProjectChoiceScreen
            onBack={onBack}
            onCreate={onCreate}
            onClone={onCloneOpen}
            onSkip={onSkip}
          />

          <ImportGitHubModal
            visible={showImportModal}
            onClose={onCloseImport}
            onImport={onImport}
            isLoading={isImporting}
          />
          <GitHubAuthModal
            visible={showAuthModal}
            onClose={onCloseAuth}
            onAuthenticated={onAuthenticated}
          />
          <LoadingModal
            visible={!!loadingMessage}
            message={loadingMessage}
          />
          <GitAuthPopup />
          <OfflineOverlay />
          <InAppToast />
          <StatusBar style="light" />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  </I18nextProvider>
);

export const ConsentRoute = ({
  i18n,
  onResolved,
}: {
  i18n: typeof i18nType;
  onResolved: () => void;
}) => (
  <I18nextProvider i18n={i18n}>
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0A0A0F' }}>
      <SafeAreaProvider style={{ backgroundColor: '#0A0A0F' }}>
        <ConsentBanner mode="screen" onResolved={onResolved} />
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  </I18nextProvider>
);
