import type { ConsentState } from '../core/services/consentService';
import { isConsentComplete } from '../core/services/consentService';
import { hasIncompleteOnboarding, shouldResumeFirstProjectChoice } from '../core/auth/authLifecycle';

export type AppAuthScreen =
  | 'auth'
  | 'consent'
  | 'onboarding'
  | 'onboardingFlow'
  | 'firstProjectChoice'
  | 'home';

export interface AuthFlowUserSnapshot {
  plan?: 'free' | 'go' | 'pro' | 'team';
  onboardingCompleted?: boolean;
  hasCreatedFirstProject?: boolean;
  firstProjectChoiceSkipped?: boolean;
}

export interface AuthFlowDecision {
  targetScreen: AppAuthScreen;
  shouldResetIsNewUser: boolean;
  shouldResetOnboardingDraft: boolean;
  isFirstCreate: boolean;
  onboardingInitialStep: 'welcome' | 'consent' | 'experience' | 'referral';
}

interface ResolveAppAuthFlowInput {
  user: AuthFlowUserSnapshot | null;
  isNewUser: boolean;
  pendingNewUser: boolean;
  consent: ConsentState | null;
}

export function requiresConsentResolution(consent: ConsentState | null | undefined): boolean {
  return !isConsentComplete(consent);
}

export function resolveAuthenticatedAppFlow({
  user,
  isNewUser,
  pendingNewUser,
  consent,
}: ResolveAppAuthFlowInput): AuthFlowDecision {
  if (!user) {
    return {
      targetScreen: 'auth',
      shouldResetIsNewUser: false,
      shouldResetOnboardingDraft: false,
      isFirstCreate: false,
      onboardingInitialStep: 'welcome',
    };
  }

  const shouldOnboard =
    isNewUser || pendingNewUser || hasIncompleteOnboarding(user);
  const shouldResumeFirstCreate = shouldResumeFirstProjectChoice(user);
  const shouldRequestConsent = !shouldOnboard && requiresConsentResolution(consent);

  if (shouldOnboard) {
    return {
      targetScreen: 'onboardingFlow',
      shouldResetIsNewUser: true,
      shouldResetOnboardingDraft: true,
      isFirstCreate: true,
      onboardingInitialStep: 'welcome',
    };
  }

  if (shouldRequestConsent) {
    return {
      targetScreen: 'consent',
      shouldResetIsNewUser: false,
      shouldResetOnboardingDraft: false,
      isFirstCreate: false,
      onboardingInitialStep: 'welcome',
    };
  }

  if (shouldResumeFirstCreate) {
    return {
      targetScreen: 'firstProjectChoice',
      shouldResetIsNewUser: false,
      shouldResetOnboardingDraft: false,
      isFirstCreate: true,
      onboardingInitialStep: 'referral',
    };
  }

  return {
    targetScreen: (user.plan || 'free') === 'free' ? 'onboarding' : 'home',
    shouldResetIsNewUser: false,
    shouldResetOnboardingDraft: false,
    isFirstCreate: false,
    onboardingInitialStep: 'welcome',
  };
}
