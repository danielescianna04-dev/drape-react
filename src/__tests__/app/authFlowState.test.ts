import { describe, expect, it } from 'vitest';
import { resolveAuthenticatedAppFlow, requiresConsentResolution } from '../../app/authFlowState';

describe('authFlowState', () => {
  it('sends new users to onboarding flow', () => {
    expect(
      resolveAuthenticatedAppFlow({
        user: {
          plan: 'free',
          onboardingCompleted: false,
          hasCreatedFirstProject: false,
        },
        isNewUser: true,
        pendingNewUser: false,
        consent: null,
      })
    ).toMatchObject({
      targetScreen: 'onboardingFlow',
      shouldResetIsNewUser: true,
      isFirstCreate: true,
      onboardingInitialStep: 'welcome',
    });
  });

  it('forces consent for existing users without complete consent', () => {
    expect(
      resolveAuthenticatedAppFlow({
        user: {
          plan: 'pro',
          onboardingCompleted: true,
          hasCreatedFirstProject: true,
        },
        isNewUser: false,
        pendingNewUser: false,
        consent: null,
      }).targetScreen
    ).toBe('consent');
  });

  it('resumes first project choice when onboarding is done but first project is missing', () => {
    expect(
      resolveAuthenticatedAppFlow({
        user: {
          plan: 'free',
          onboardingCompleted: true,
          hasCreatedFirstProject: false,
        },
        isNewUser: false,
        pendingNewUser: false,
        consent: {
          analytics: true,
          pushNotifications: true,
          presenceTracking: true,
        },
      })
    ).toMatchObject({
      targetScreen: 'firstProjectChoice',
      isFirstCreate: true,
      onboardingInitialStep: 'referral',
    });
  });

  it('routes consented free users to plans onboarding and paid users home', () => {
    expect(
      resolveAuthenticatedAppFlow({
        user: {
          plan: 'free',
          onboardingCompleted: true,
          hasCreatedFirstProject: true,
        },
        isNewUser: false,
        pendingNewUser: false,
        consent: {
          analytics: true,
          pushNotifications: true,
          presenceTracking: true,
        },
      }).targetScreen
    ).toBe('onboarding');

    expect(
      resolveAuthenticatedAppFlow({
        user: {
          plan: 'pro',
          onboardingCompleted: true,
          hasCreatedFirstProject: true,
        },
        isNewUser: false,
        pendingNewUser: false,
        consent: {
          analytics: true,
          pushNotifications: true,
          presenceTracking: true,
        },
      }).targetScreen
    ).toBe('home');
  });

  it('treats incomplete consent objects as unresolved', () => {
    expect(
      requiresConsentResolution({
        analytics: true,
        pushNotifications: false,
        presenceTracking: true,
      })
    ).toBe(true);
  });
});
