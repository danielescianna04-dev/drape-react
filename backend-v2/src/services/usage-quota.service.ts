import { supabaseAdmin } from '../lib/supabase';

/**
 * Monthly token quota tracking.
 *
 * Every AI call writes a row to `ai_runs` (tokens_in/out). Before each new
 * call we sum tokens used since the start of the current calendar month for
 * the user and reject if they're over their tier's monthly cap.
 *
 * Quotas (per calendar month, resets at midnight of the 1st):
 *   - Free: 1.5M tokens
 *   - Plus: 8M tokens (€4.99/mo tier)
 *
 * Why monthly fixed (not sliding/weekly):
 *   - Simpler mental model — "you have X for the month", resets the 1st
 *   - Aligns with subscription billing cadence (also monthly)
 *   - Predictable for cost forecasting on our side
 *   - No 5h burst limit: a user CAN burn their entire monthly quota in one
 *     session; that's by design — it's their budget to spend
 */

export type PlanTier = 'free' | 'plus';

const QUOTA_BY_PLAN: Record<PlanTier, number> = {
  free: 1_500_000,
  plus: 8_000_000,
};

function getMonthStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function getMonthEndMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
}

export interface QuotaCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
  /** Seconds until enough tokens free up for the next request. Only set when allowed=false. */
  retryAfterSec?: number;
}

/**
 * Map a Supabase user's plan (read from profiles.plan or auth metadata) to a
 * canonical tier. Unknown / missing → free.
 */
export function resolveTier(raw: string | null | undefined): PlanTier {
  const v = String(raw ?? '').toLowerCase();
  if (v === 'plus' || v === 'pro') return 'plus';
  return 'free';
}

/**
 * Sum tokens consumed since the start of the current calendar month for
 * this user. Combines NEW input + output. Cached input is not counted —
 * it's effectively free for both billing and the user's quota.
 */
export async function getUsageInWindow(userId: string): Promise<number> {
  const sinceIso = getMonthStartIso();
  const { data, error } = await supabaseAdmin
    .from('ai_runs')
    .select('tokens_in, tokens_out')
    .eq('user_id', userId)
    .gte('created_at', sinceIso);
  if (error) {
    // Don't block on infra errors — log and let the request through. Better
    // to over-serve than to lock users out on a DB hiccup.
    console.warn('[quota] getUsageInWindow query failed:', error.message);
    return 0;
  }
  let total = 0;
  for (const row of data ?? []) {
    total += (row.tokens_in ?? 0) + (row.tokens_out ?? 0);
  }
  return total;
}

/**
 * Read the user's plan from the profiles table. Returns 'free' on any
 * lookup failure so a corrupt profile can't accidentally grant a paid quota.
 */
export async function getUserTier(userId: string): Promise<PlanTier> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .single();
  if (error || !data) return 'free';
  return resolveTier((data as any).plan);
}

export async function checkQuota(userId: string): Promise<QuotaCheckResult> {
  const tier = await getUserTier(userId);
  const limit = QUOTA_BY_PLAN[tier];
  const used = await getUsageInWindow(userId);
  if (used < limit) {
    return { allowed: true, used, limit };
  }
  // Monthly cap: the user has to wait until the 1st of next month for the
  // counter to reset. Retry-After is the full delta in seconds.
  const retryAfterSec = Math.max(60, Math.ceil((getMonthEndMs() - Date.now()) / 1000));
  return {
    allowed: false,
    used,
    limit,
    retryAfterSec,
  };
}

/**
 * Persist usage for a completed AI call. Best-effort — never throws (we don't
 * want to drop a paid response just because the audit row didn't land).
 */
export async function recordUsage(opts: {
  userId: string;
  sessionId?: string | null;
  model: string;
  prompt: string;
  response: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  error?: string | null;
}): Promise<void> {
  try {
    // ai_runs requires a session_id (FK to ai_sessions). Inline-create one for
    // the chat path which doesn't track sessions explicitly elsewhere.
    let sessionId = opts.sessionId;
    if (!sessionId) {
      const { data: newSession } = await supabaseAdmin
        .from('ai_sessions')
        .insert({
          user_id: opts.userId,
          title: 'Chat',
          status: opts.error ? 'failed' : 'completed',
        })
        .select('id')
        .single();
      sessionId = newSession?.id ?? null;
    }
    if (!sessionId) return;

    await supabaseAdmin.from('ai_runs').insert({
      session_id: sessionId,
      user_id: opts.userId,
      prompt: opts.prompt,
      response: opts.response || null,
      model: opts.model,
      tokens_in: opts.tokensIn,
      tokens_out: opts.tokensOut,
      duration_ms: opts.durationMs,
      error: opts.error ?? null,
    } as any);
  } catch (err: any) {
    console.warn('[quota] recordUsage failed:', err?.message);
  }
}
