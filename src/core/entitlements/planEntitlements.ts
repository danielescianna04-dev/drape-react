/**
 * Plan entitlements — single source of truth (frontend).
 *
 * Limits are resolved from (plan, productId) because monthly vs yearly
 * of the same plan can offer different project counts. Prices are NEVER
 * hardcoded here — StoreKit / localizedPrice is the source of truth for prices.
 */

import { IAP_PRODUCT_IDS } from '../iap/iapConstants';

export type CanonicalPlan = 'free' | 'go' | 'pro';
/** Legacy plan value still written on some old Firestore user docs. */
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
  /** Lifetime cap on projects created from scratch. Does NOT reset monthly. */
  maxCreated: number;
  /** Lifetime cap on cloned repos. */
  maxCloned: number;
  /** Lifetime cap on local projects. */
  maxLocal: number;
  maxStorageMb: number;
  /** Monthly AI budget in €. Resets each month. */
  aiBudgetEur: number;
  /** Models the user can select. */
  allowedModels: ReadonlyArray<ModelId>;
  /** Whether the user can publish (Go and up). */
  canPublish: boolean;
}

const ALL_MODELS: ReadonlyArray<ModelId> = [
  'claude-4-6-sonnet',
  'claude-4-7-opus',
  'gpt-5-4',
  'gemini-3-0-flash',
  'gemini-3-1-pro',
  'glm-5-1',
];

const FREE_MODELS: ReadonlyArray<ModelId> = ['claude-4-6-sonnet', 'gemini-3-0-flash'];

/**
 * Normalize any plan value (including legacy) to one of the three canonical plans.
 * 'starter' → 'free', 'team' → 'pro' (legacy team users keep paid access).
 */
export function normalizePlan(raw: AnyPlan | string | null | undefined): CanonicalPlan {
  const v = (raw || 'free').toString().toLowerCase();
  if (v === 'starter') return 'free';
  if (v === 'team') return 'pro';
  if (v === 'go') return 'go';
  if (v === 'pro') return 'pro';
  return 'free';
}

function resolveCycleFromProductId(productId?: string | null): BillingCycle {
  if (!productId) return null;
  if (productId === IAP_PRODUCT_IDS.GO_MONTHLY || productId === IAP_PRODUCT_IDS.PRO_MONTHLY) return 'monthly';
  if (productId === IAP_PRODUCT_IDS.GO_YEARLY || productId === IAP_PRODUCT_IDS.PRO_YEARLY) return 'yearly';
  return null;
}

/**
 * Resolve full entitlements from (plan, productId). productId decides the
 * billing cycle for Go/Pro, which in turn decides project limits.
 * For Free the productId is ignored.
 */
export function resolvePlanEntitlements(
  rawPlan: AnyPlan | string | null | undefined,
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

  const cycle = resolveCycleFromProductId(productId);

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

  // Pro (also captures legacy 'team')
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

/**
 * Historical aliases used in different parts of the codebase.
 * Canonical IDs are those in ModelId — every other spelling should map here.
 */
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
  plan: AnyPlan | string | null | undefined,
  modelId: string,
): boolean {
  const canonical = canonicalModelId(modelId);
  if (!canonical) return false;
  const ent = resolvePlanEntitlements(plan);
  return (ent.allowedModels as ReadonlyArray<string>).includes(canonical);
}
