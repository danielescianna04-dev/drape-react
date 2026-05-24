import { supabaseAdmin } from '../lib/supabase';

/**
 * Token quota tracking with a 5-hour sliding window.
 *
 * Every AI call writes a row to `ai_runs` (tokens_in/out). Before each new
 * call we sum tokens used in the last 5 hours for the user and reject if
 * they're over their tier's quota.
 *
 * Quotas (per 5h sliding window):
 *   - Free: 1M tokens
 *   - Plus: 5M tokens (€4.99/mo tier)
 *
 * Why 5h sliding (not daily fixed):
 *   - Fixed daily quotas reset at a moment users can game (burn 1M at 23:55
 *     + 1M at 00:05). Sliding makes that pattern impossible.
 *   - 5h is long enough that bursty work (e.g. one coding session) doesn't
 *     hit the cap, short enough that a heavy user doesn't lock themselves
 *     out for 24h after a runaway request.
 */

export type PlanTier = 'free' | 'plus';

const QUOTA_BY_PLAN: Record<PlanTier, number> = {
  free: 1_000_000,
  plus: 5_000_000,
};

const SLIDING_WINDOW_HOURS = 5;

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
 * Sum tokens consumed in the last 5h for this user. Combines input + output.
 * (Input cached tokens still count — they're not free, just discounted.)
 */
export async function getUsageInWindow(userId: string): Promise<number> {
  const sinceIso = new Date(Date.now() - SLIDING_WINDOW_HOURS * 3600 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('ai_runs')
    .select('tokens_in, tokens_out, created_at')
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
  // Find the oldest row in window — when it ages out, the user gets that
  // many tokens back. Used as a rough Retry-After hint.
  const sinceIso = new Date(Date.now() - SLIDING_WINDOW_HOURS * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from('ai_runs')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(1);
  const oldestMs = data?.[0]?.created_at ? new Date(data[0].created_at).getTime() : Date.now();
  const ageOutMs = oldestMs + SLIDING_WINDOW_HOURS * 3600 * 1000 - Date.now();
  return {
    allowed: false,
    used,
    limit,
    retryAfterSec: Math.max(60, Math.ceil(ageOutMs / 1000)),
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
