import { useEffect } from 'react';
import { useAuthStore, consumePendingNewUser } from '../core/auth/authStore';
import { useConsentStore } from '../core/services/consentService';
import { useNavigationStore } from '../core/navigation/navigationStore';
import { useTerminalStore } from '../core/terminal/terminalStore';

type Screen = 'splash' | 'auth' | 'consent' | 'onboarding' | 'onboardingFlow' | 'firstProjectChoice' | 'home' | 'create' | 'terminal' | 'allProjects' | 'settings' | 'plans';

interface UseAppRoutingParams {
  currentScreen: Screen;
  setCurrentScreen: (screen: Screen | ((prev: Screen) => Screen)) => void;
  setIsFirstCreate: (v: boolean) => void;
  setOnboardingInitialStep: (v: 'welcome' | 'consent' | 'experience' | 'referral') => void;
  setOnboardingDraft: (v: { experienceLevel: string | null; referralSource: string | null }) => void;
  onboardingInitialStep: 'welcome' | 'consent' | 'experience' | 'referral';
  onboardingDraft: { experienceLevel: string | null; referralSource: string | null };
  pendingFirstProjectImportFromScreen: { previousWorkstationId: string | null } | null;
  setPendingFirstProjectImportFromScreen: (v: { previousWorkstationId: string | null } | null) => void;
  finalizeFirstProjectSetup: () => void;
}

export function useAppRouting({
  currentScreen,
  setCurrentScreen,
  setIsFirstCreate,
  setOnboardingInitialStep,
  setOnboardingDraft,
  pendingFirstProjectImportFromScreen,
  setPendingFirstProjectImportFromScreen,
  finalizeFirstProjectSetup,
}: UseAppRoutingParams) {
  const { user, isInitialized, isNewUser } = useAuthStore();
  const consent = useConsentStore((state) => state.consent);
  const consentLoaded = useConsentStore((state) => state.hasLoaded);
  const pendingNavigation = useNavigationStore((state) => state.pendingNavigation);
  const currentWorkstation = useTerminalStore((state) => state.currentWorkstation);

  // Navigate after login: new users -> onboarding flow, free users -> plans, paid -> home
  useEffect(() => {
    if (!isInitialized || !user || !consentLoaded) return;

    // Check module-level flag (immune to React batching / Zustand race conditions)
    const pendingNew = consumePendingNewUser();
    const shouldOnboard =
      isNewUser ||
      pendingNew ||
      (user.onboardingCompleted === false && !user.hasCreatedFirstProject);
    const shouldResumeFirstCreate = user.onboardingCompleted === true && user.hasCreatedFirstProject === false;
    const shouldRequestExistingUserConsent = !shouldOnboard && consent === null;

    // New users MUST see onboarding, regardless of current screen
    if (shouldOnboard && currentScreen !== 'onboardingFlow' && currentScreen !== 'create') {
      useAuthStore.setState({ isNewUser: false });
      setIsFirstCreate(true);
      setOnboardingDraft({ experienceLevel: null, referralSource: null });
      setCurrentScreen('onboardingFlow');
      return;
    }

    if (
      shouldRequestExistingUserConsent &&
      currentScreen !== 'consent' &&
      currentScreen !== 'onboardingFlow'
    ) {
      setCurrentScreen('consent');
      return;
    }

    // User finished onboarding but never completed the first project creation flow.
    if (
      shouldResumeFirstCreate &&
      currentScreen !== 'create' &&
      currentScreen !== 'firstProjectChoice' &&
      currentScreen !== 'consent' &&
      currentScreen !== 'terminal' &&
      currentScreen !== 'onboardingFlow'
    ) {
      setIsFirstCreate(true);
      setOnboardingInitialStep('referral');
      setCurrentScreen('firstProjectChoice');
      return;
    }

    // Post-auth navigation (only from auth screen)
    if (currentScreen === 'auth') {
      const plan = user.plan || 'free';
      if (shouldRequestExistingUserConsent) {
        setCurrentScreen('consent');
      } else if (plan === 'free') {
        setCurrentScreen('onboarding');
      } else {
        setCurrentScreen('home');
      }
    }
  }, [user, isInitialized, currentScreen, isNewUser, consent, consentLoaded]);

  // Listen to navigation store for cross-component navigation
  useEffect(() => {
    if (pendingNavigation) {
      // Don't override onboarding screens -- new users must complete the flow
      if (currentScreen === 'onboardingFlow' || currentScreen === 'onboarding' || currentScreen === 'consent' || currentScreen === 'firstProjectChoice') {
        useNavigationStore.getState().clearPendingNavigation();
        return;
      }
      setCurrentScreen(pendingNavigation);
      useNavigationStore.getState().clearPendingNavigation();
    }
  }, [pendingNavigation, currentScreen]);

  // Effect that handles first project import finalization
  useEffect(() => {
    if (!pendingFirstProjectImportFromScreen) return;

    if (currentScreen === 'terminal') {
      setPendingFirstProjectImportFromScreen(null);
      return;
    }

    if (currentScreen !== 'firstProjectChoice') return;

    const previousWorkstationId = pendingFirstProjectImportFromScreen.previousWorkstationId;
    const nextWorkstationId = currentWorkstation?.id || null;

    if (!nextWorkstationId || nextWorkstationId === previousWorkstationId) return;

    finalizeFirstProjectSetup();
    setPendingFirstProjectImportFromScreen(null);
    setCurrentScreen('terminal');
  }, [pendingFirstProjectImportFromScreen, currentWorkstation?.id, currentScreen]);

  // Automatically track previous screen whenever currentScreen changes.
  useEffect(() => {
    if (currentScreen !== 'settings' && currentScreen !== 'plans' && currentScreen !== 'splash' && currentScreen !== 'auth' && currentScreen !== 'onboardingFlow' && currentScreen !== 'consent' && currentScreen !== 'firstProjectChoice') {
      useNavigationStore.setState({ previousScreen: currentScreen });
    }
  }, [currentScreen]);

  // Handle splash screen finish - navigate based on auth state
  const handleSplashFinish = () => {
    if (isInitialized && user && consentLoaded) {
      const pendingNew = consumePendingNewUser();
      const shouldOnboard =
        isNewUser ||
        pendingNew ||
        (user.onboardingCompleted === false && !user.hasCreatedFirstProject);
      const shouldResumeFirstCreate = user.onboardingCompleted === true && user.hasCreatedFirstProject === false;
      const shouldRequestExistingUserConsent = !shouldOnboard && consent === null;
      if (shouldOnboard) {
        useAuthStore.setState({ isNewUser: false });
        setIsFirstCreate(true);
        setOnboardingDraft({ experienceLevel: null, referralSource: null });
        setCurrentScreen('onboardingFlow');
      } else if (shouldRequestExistingUserConsent) {
        setCurrentScreen('consent');
      } else if (shouldResumeFirstCreate) {
        setIsFirstCreate(true);
        setOnboardingInitialStep('referral');
        setCurrentScreen('firstProjectChoice');
      } else {
        const plan = user.plan || 'free';
        if (plan === 'free') {
          setCurrentScreen('onboarding');
        } else {
          setCurrentScreen('home');
        }
      }
    } else {
      setCurrentScreen('auth');
    }
  };

  return {
    handleSplashFinish,
    isInitialized,
    user,
    consentLoaded,
  };
}
