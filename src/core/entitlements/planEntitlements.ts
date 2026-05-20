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
  | 'deepseek-v4-flash-free'
  | 'qwen3.6-plus-free'
  | 'nemotron-3-super-free'
  | 'minimax-m2.5-free'
  | 'big-pickle';

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
  'deepseek-v4-flash-free',
  'qwen3.6-plus-free',
  'nemotron-3-super-free',
  'minimax-m2.5-free',
  'big-pickle',
];

const FREE_MODELS: ReadonlyArray<ModelId> = [
  'deepseek-v4-flash-free',
  'qwen3.6-plus-free',
  'nemotron-3-super-free',
  'minimax-m2.5-free',
];

/**
 * v2: Drape è free per tutti gli utenti — ogni account ha feature Pro sbloccate.
 * Quando reintrodurremo tier paid, qui andrà il mapping da auth.plan → CanonicalPlan.
 */
export function normalizePlan(_raw: AnyPlan | string | null | undefined): CanonicalPlan {
  return 'pro';
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
  return {
    tier: 'pro_yearly',
    plan: 'pro',
    cycle: 'yearly',
    maxCreated: 999999,
    maxCloned: 999999,
    maxLocal: 999999,
    maxStorageMb: 99999999,
    aiBudgetEur: 99999999,
    allowedModels: ALL_MODELS,
    canPublish: true,
  };
}

/**
 * Historical aliases used in different parts of the codebase.
 * Canonical IDs are those in ModelId — every other spelling should map here.
 */
const MODEL_ALIASES: Record<string, ModelId> = {
  'deepseek-v4-flash-free': 'deepseek-v4-flash-free',
  'qwen3.6-plus-free': 'qwen3.6-plus-free',
  'nemotron-3-super-free': 'nemotron-3-super-free',
  'minimax-m2.5-free': 'minimax-m2.5-free',
  'big-pickle': 'big-pickle',
  'gemini-3-flash': 'deepseek-v4-flash-free',
  'gemini-3.0-flash': 'deepseek-v4-flash-free',
  'gemini-3-0-flash': 'deepseek-v4-flash-free',
  'gemini-3-1-pro': 'big-pickle',
  'gemini-3.1-pro': 'big-pickle',
  'glm-5.1': 'deepseek-v4-flash-free',
  'glm-5-1': 'deepseek-v4-flash-free',
  'claude-sonnet-4': 'big-pickle',
  'claude-4-6-sonnet': 'big-pickle',
  'claude-4-7-opus': 'big-pickle',
  'gpt-5-4': 'big-pickle',
};

export function canonicalModelId(modelId: string): ModelId | null {
  return MODEL_ALIASES[modelId] ?? null;
}

export function canUseModel(
  plan: AnyPlan | string | null | undefined,
  modelId: string,
): boolean {
  return true;
}
