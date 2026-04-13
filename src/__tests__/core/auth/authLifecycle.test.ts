import { describe, expect, it } from 'vitest';
import {
  deriveIsNewAuthUser,
  hasIncompleteOnboarding,
  normalizeAuthLifecycle,
  shouldResumeFirstProjectChoice,
} from '../../../core/auth/authLifecycle';

describe('authLifecycle', () => {
  it('marks missing docs as new users', () => {
    expect(
      deriveIsNewAuthUser({
        userDocExists: false,
      })
    ).toBe(true);
  });

  it('marks incomplete onboarding as new-session onboarding work', () => {
    expect(
      deriveIsNewAuthUser({
        userDocExists: true,
        onboardingCompleted: false,
        hasCreatedFirstProject: false,
      })
    ).toBe(true);
  });

  it('keeps existing completed users out of new-user flow', () => {
    expect(
      deriveIsNewAuthUser({
        userDocExists: true,
        onboardingCompleted: true,
        hasCreatedFirstProject: true,
      })
    ).toBe(false);
  });

  it('normalizes lifecycle booleans and plan safely', () => {
    expect(
      normalizeAuthLifecycle({
        onboardingCompleted: undefined,
        hasCreatedFirstProject: undefined,
        plan: 'weird',
      })
    ).toEqual({
      onboardingCompleted: false,
      hasCreatedFirstProject: false,
      plan: 'free',
    });
  });

  it('detects onboarding and first-project resume states', () => {
    expect(hasIncompleteOnboarding({ onboardingCompleted: false, hasCreatedFirstProject: false })).toBe(true);
    expect(shouldResumeFirstProjectChoice({ onboardingCompleted: true, hasCreatedFirstProject: false })).toBe(true);
    expect(shouldResumeFirstProjectChoice({ onboardingCompleted: true, hasCreatedFirstProject: true })).toBe(false);
  });
});
