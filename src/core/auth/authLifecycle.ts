export interface AuthLifecycleFields {
  onboardingCompleted?: boolean | null;
  hasCreatedFirstProject?: boolean | null;
  plan?: string | null;
}

export interface AuthLifecycleDerivationInput extends AuthLifecycleFields {
  userDocExists: boolean;
  isNewFromAuth?: boolean;
  pendingNewUser?: boolean;
}

export interface NormalizedAuthLifecycle {
  onboardingCompleted: boolean;
  hasCreatedFirstProject: boolean;
  plan: 'free' | 'go' | 'pro' | 'team';
}

export function normalizeAuthLifecycle(fields?: AuthLifecycleFields | null): NormalizedAuthLifecycle {
  const planRaw = typeof fields?.plan === 'string' ? fields.plan.toLowerCase() : '';
  // 'starter' is legacy-normalized to 'free'. 'team' is preserved (legacy paid users)
  // but treated as Pro by the entitlements resolver; it is never offered in UI.
  const plan =
    planRaw === 'go' || planRaw === 'pro' || planRaw === 'team'
      ? (planRaw as 'go' | 'pro' | 'team')
      : 'free';
  return {
    onboardingCompleted: fields?.onboardingCompleted === true,
    hasCreatedFirstProject: fields?.hasCreatedFirstProject === true,
    plan,
  };
}

export function hasIncompleteOnboarding(fields?: AuthLifecycleFields | null): boolean {
  return fields?.onboardingCompleted === false && fields?.hasCreatedFirstProject !== true;
}

export function shouldResumeFirstProjectChoice(fields?: AuthLifecycleFields | null): boolean {
  return fields?.onboardingCompleted === true && fields?.hasCreatedFirstProject === false;
}

export function deriveIsNewAuthUser({
  userDocExists,
  isNewFromAuth = false,
  pendingNewUser = false,
  onboardingCompleted,
  hasCreatedFirstProject,
}: AuthLifecycleDerivationInput): boolean {
  return (
    isNewFromAuth ||
    !userDocExists ||
    pendingNewUser ||
    hasIncompleteOnboarding({ onboardingCompleted, hasCreatedFirstProject })
  );
}
