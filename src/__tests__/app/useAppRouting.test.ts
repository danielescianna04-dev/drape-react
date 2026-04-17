import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const authState = {
    user: null as any,
    isInitialized: true,
    isNewUser: false,
  };
  const consentState = {
    consent: null as any,
    hasLoaded: true,
  };
  const navigationState = {
    pendingNavigation: null as any,
    previousScreen: null as any,
    clearPendingNavigation: vi.fn(() => {
      navigationState.pendingNavigation = null;
    }),
  };
  const terminalState = {
    currentWorkstation: null as any,
  };
  let pendingNewUser = false;

  const useAuthStoreMock = Object.assign(
    ((selector?: (state: typeof authState) => any) =>
      selector ? selector(authState) : authState) as any,
    {
      setState: vi.fn((updater: any) => {
        const next =
          typeof updater === 'function' ? updater(authState) : updater;
        Object.assign(authState, next);
      }),
    }
  );

  const useConsentStoreMock = ((selector?: (state: typeof consentState) => any) =>
    selector ? selector(consentState) : consentState) as any;

  const useNavigationStoreMock = Object.assign(
    ((selector?: (state: typeof navigationState) => any) =>
      selector ? selector(navigationState) : navigationState) as any,
    {
      getState: () => navigationState,
      setState: (next: Partial<typeof navigationState>) => Object.assign(navigationState, next),
    }
  );

  const useWorkstationStoreMock = ((selector?: (state: typeof terminalState) => any) =>
    selector ? selector(terminalState) : terminalState) as any;

  return {
    authState,
    consentState,
    navigationState,
    terminalState,
    getPendingNewUser: () => pendingNewUser,
    setPendingNewUser: (value: boolean) => {
      pendingNewUser = value;
    },
    useAuthStoreMock,
    useConsentStoreMock,
    useNavigationStoreMock,
    useWorkstationStoreMock,
  };
});

vi.mock('../../core/auth/authStore', () => ({
  useAuthStore: mocks.useAuthStoreMock,
  peekPendingNewUser: () => mocks.getPendingNewUser(),
  clearPendingNewUser: () => {
    mocks.setPendingNewUser(false);
  },
}));

vi.mock('../../core/services/consentService', () => ({
  useConsentStore: mocks.useConsentStoreMock,
  isConsentComplete: (consent: any) =>
    !!consent &&
    consent.analytics === true &&
    consent.pushNotifications === true &&
    consent.presenceTracking === true,
}));

vi.mock('../../core/navigation/navigationStore', () => ({
  useNavigationStore: mocks.useNavigationStoreMock,
}));

vi.mock('../../core/terminal/workstationStore', () => ({
  useWorkstationStore: mocks.useWorkstationStoreMock,
}));

import { useAppRouting } from '../../app/useAppRouting';

describe('useAppRouting', () => {
  const setCurrentScreen = vi.fn();
  const setIsFirstCreate = vi.fn();
  const setOnboardingInitialStep = vi.fn();
  const setOnboardingDraft = vi.fn();
  const setPendingFirstProjectImportFromScreen = vi.fn();
  const finalizeFirstProjectSetup = vi.fn();

  const baseParams = {
    currentScreen: 'auth' as const,
    setCurrentScreen,
    setIsFirstCreate,
    setOnboardingInitialStep,
    setOnboardingDraft,
    onboardingInitialStep: 'welcome' as const,
    onboardingDraft: { experienceLevel: 'dev', referralSource: 'friend' },
    pendingFirstProjectImportFromScreen: null,
    setPendingFirstProjectImportFromScreen,
    finalizeFirstProjectSetup,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authState.user = null;
    mocks.authState.isInitialized = true;
    mocks.authState.isNewUser = false;
    mocks.setPendingNewUser(false);
    mocks.consentState.consent = null;
    mocks.consentState.hasLoaded = true;
    mocks.navigationState.pendingNavigation = null;
    mocks.navigationState.previousScreen = null;
    mocks.terminalState.currentWorkstation = null;
  });

  it('routes verified new users into onboarding flow and resets onboarding draft', async () => {
    mocks.authState.user = {
      uid: 'u1',
      email: 'test@example.com',
      displayName: 'Test',
      photoURL: null,
      createdAt: new Date(),
      plan: 'free',
      onboardingCompleted: false,
      hasCreatedFirstProject: false,
    };
    mocks.authState.isNewUser = true;

    renderHook(() => useAppRouting(baseParams));

    await waitFor(() => {
      expect(setCurrentScreen).toHaveBeenCalledWith('onboardingFlow');
    });
    expect(setIsFirstCreate).toHaveBeenCalledWith(true);
    expect(setOnboardingDraft).toHaveBeenCalledWith({ experienceLevel: null, referralSource: null });
    expect(mocks.useAuthStoreMock.setState).toHaveBeenCalled();
  });

  it('routes existing users without consent to consent screen', async () => {
    mocks.authState.user = {
      uid: 'u1',
      email: 'test@example.com',
      displayName: 'Test',
      photoURL: null,
      createdAt: new Date(),
      plan: 'pro',
      onboardingCompleted: true,
      hasCreatedFirstProject: true,
    };

    renderHook(() => useAppRouting(baseParams));

    await waitFor(() => {
      expect(setCurrentScreen).toHaveBeenCalledWith('consent');
    });
  });

  it('routes users with onboarding complete but no first project to first project choice', async () => {
    mocks.authState.user = {
      uid: 'u1',
      email: 'test@example.com',
      displayName: 'Test',
      photoURL: null,
      createdAt: new Date(),
      plan: 'free',
      onboardingCompleted: true,
      hasCreatedFirstProject: false,
    };
    mocks.consentState.consent = {
      analytics: true,
      pushNotifications: true,
      presenceTracking: true,
    };

    renderHook(() => useAppRouting(baseParams));

    await waitFor(() => {
      expect(setCurrentScreen).toHaveBeenCalledWith('firstProjectChoice');
    });
    expect(setIsFirstCreate).toHaveBeenCalledWith(true);
    expect(setOnboardingInitialStep).toHaveBeenCalledWith('referral');
  });

  it('chooses the correct splash destination for a paid consented user', () => {
    mocks.authState.user = {
      uid: 'u1',
      email: 'test@example.com',
      displayName: 'Test',
      photoURL: null,
      createdAt: new Date(),
      plan: 'pro',
      onboardingCompleted: true,
      hasCreatedFirstProject: true,
    };
    mocks.consentState.consent = {
      analytics: true,
      pushNotifications: true,
      presenceTracking: true,
    };

    const { result } = renderHook(() =>
      useAppRouting({
        ...baseParams,
        currentScreen: 'splash',
      })
    );

    act(() => {
      result.current.handleSplashFinish();
    });

    expect(setCurrentScreen).toHaveBeenCalledWith('home');
  });
});
