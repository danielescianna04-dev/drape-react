/**
 * Plan entitlements — single source of truth (backend).
 *
 * Keep in sync with src/core/entitlements/planEntitlements.ts on the frontend.
 * Limits are resolved from (plan, productId) because monthly vs yearly of
 * the same plan grant different project counts.
 */

export type CanonicalPlan = 'free' | 'go' | 'pro';
export type LegacyPlan = 'starter' | 'team';
export type AnyPlan = CanonicalPlan | LegacyPlan;
export type BillingCycle = 'monthly' | 'yearly' | null;

export type PlanTier =
  | 'free'
  | 'go_monthly'
  | 'go_yearly'
  | 'pro_monthly'
  | 'pro_yearly';

export type ModelId =
  | 'claude-4-6-sonnet'
  | 'claude-4-7-opus'
  | 'gpt-5-4'
  | 'gemini-3-0-flash'
  | 'gemini-3-1-pro'
  | 'glm-5-1';

export interface PlanEntitlements {
  tier: PlanTier;
  plan: CanonicalPlan;
  cycle: BillingCycle;
  maxCreated: number;
  maxCloned: number;
  maxLocal: number;
  maxStorageMb: number;
  aiBudgetEur: number;
  allowedModels: ReadonlyArray<ModelId>;
  canPublish: boolean;
}

const PRODUCT_IDS = {
  GO_MONTHLY: 'com.drape.app.go.monthly.v2',
  GO_YEARLY: 'com.drape.app.go.yearly.v2',
  PRO_MONTHLY: 'com.drape.app.pro.monthly.v2',
  PRO_YEARLY: 'com.drape.app.pro.yearly.v2',
} as const;

const ALL_MODELS: ReadonlyArray<ModelId> = [
  'claude-4-6-sonnet',
  'claude-4-7-opus',
  'gpt-5-4',
  'gemini-3-0-flash',
  'gemini-3-1-pro',
  'glm-5-1',
];
const FREE_MODELS: ReadonlyArray<ModelId> = ['claude-4-6-sonnet', 'gemini-3-0-flash'];

export function normalizePlan(raw: string | null | undefined): CanonicalPlan {
  const v = (raw || 'free').toString().toLowerCase();
  if (v === 'starter') return 'free';
  if (v === 'team') return 'pro';
  if (v === 'go') return 'go';
  if (v === 'pro') return 'pro';
  return 'free';
}

function cycleFromProductId(productId?: string | null): BillingCycle {
  if (!productId) return null;
  if (productId === PRODUCT_IDS.GO_MONTHLY || productId === PRODUCT_IDS.PRO_MONTHLY) return 'monthly';
  if (productId === PRODUCT_IDS.GO_YEARLY || productId === PRODUCT_IDS.PRO_YEARLY) return 'yearly';
  return null;
}

export function resolvePlanEntitlements(
  rawPlan: string | null | undefined,
  productId?: string | null,
): PlanEntitlements {
  const plan = normalizePlan(rawPlan);

  if (plan === 'free') {
    return {
      tier: 'free',
      plan,
      cycle: null,
      maxCreated: 1,
      maxCloned: 2,
      maxLocal: 1,
      maxStorageMb: 1024,
      aiBudgetEur: 1,
      allowedModels: FREE_MODELS,
      canPublish: false,
    };
  }

  const cycle = cycleFromProductId(productId);

  if (plan === 'go') {
    const tier: PlanTier = cycle === 'yearly' ? 'go_yearly' : 'go_monthly';
    return {
      tier,
      plan,
      cycle: cycle ?? 'monthly',
      maxCreated: cycle === 'yearly' ? 5 : 3,
      maxCloned: 5,
      maxLocal: 3,
      maxStorageMb: 5120,
      aiBudgetEur: 10,
      allowedModels: ALL_MODELS,
      canPublish: true,
    };
  }

  const tier: PlanTier = cycle === 'yearly' ? 'pro_yearly' : 'pro_monthly';
  return {
    tier,
    plan: 'pro',
    cycle: cycle ?? 'monthly',
    maxCreated: cycle === 'yearly' ? 8 : 6,
    maxCloned: 15,
    maxLocal: 10,
    maxStorageMb: 51200,
    aiBudgetEur: 25,
    allowedModels: ALL_MODELS,
    canPublish: true,
  };
}

const MODEL_ALIASES: Record<string, ModelId> = {
  'gemini-3-flash': 'gemini-3-0-flash',
  'gemini-3.0-flash': 'gemini-3-0-flash',
  'gemini-3-0-flash': 'gemini-3-0-flash',
  'gemini-3.1-pro': 'gemini-3-1-pro',
  'gemini-3-1-pro': 'gemini-3-1-pro',
  'glm-5.1': 'glm-5-1',
  'glm-5-1': 'glm-5-1',
  'claude-sonnet-4': 'claude-4-6-sonnet',
  'claude-4-6-sonnet': 'claude-4-6-sonnet',
  'claude-4-7-opus': 'claude-4-7-opus',
  'gpt-5-4': 'gpt-5-4',
};

export function canonicalModelId(modelId: string): ModelId | null {
  return MODEL_ALIASES[modelId] ?? null;
}

export function canUseModel(
  plan: string | null | undefined,
  modelId: string,
): boolean {
  const canonical = canonicalModelId(modelId);
  if (!canonical) return false;
  const ent = resolvePlanEntitlements(plan);
  return (ent.allowedModels as ReadonlyArray<string>).includes(canonical);
}
