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
  const plan = fields?.plan;
  return {
    onboardingCompleted: fields?.onboardingCompleted === true,
    hasCreatedFirstProject: fields?.hasCreatedFirstProject === true,
    plan: plan === 'go' || plan === 'pro' || plan === 'team' ? plan : 'free',
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
