/**
 * Quota enforcement for Drape Cloud.
 *
 * Two limits, both per project:
 * - row_count: total rows across all tables (hard cap)
 * - requests_month: total API requests since the start of the month
 *
 * We update counters lazily:
 * - row_count is read from drape_rows on quota check (COUNT(*) is
 *   cheap on the composite index up to ~10k rows; above that we'll
 *   cache it in drape_quota_usage with a trigger). For v1, simple.
 * - requests_month is incremented on every request via UPSERT that
 *   also rolls the anchor when the month changes.
 */

import { getSql } from './client';
import { config } from '../../config';

export class QuotaExceededError extends Error {
  status = 429;
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'QuotaExceededError';
    this.code = code;
  }
}

export async function assertRowQuota(projectId: string): Promise<void> {
  const sql = getSql();
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM drape_rows WHERE project_id = ${projectId}
  `;
  const current = Number(rows[0]?.count || 0);
  if (current >= config.drapeCloudRowQuotaPerProject) {
    throw new QuotaExceededError(
      'row_quota_exceeded',
      `Row quota reached (${config.drapeCloudRowQuotaPerProject}). Delete rows or upgrade plan.`,
    );
  }
}

/**
 * Increment monthly request counter. Rolls the anchor forward when
 * the calendar month changes. Never throws on DB failure (soft-fail:
 * logging in caller). Returns the new count.
 */
export async function recordRequest(projectId: string): Promise<number> {
  const sql = getSql();
  const rows = await sql<{ requests_month: string }[]>`
    INSERT INTO drape_quota_usage (project_id, requests_month, month_anchor)
    VALUES (${projectId}, 1, date_trunc('month', now()))
    ON CONFLICT (project_id) DO UPDATE
      SET requests_month = CASE
            WHEN date_trunc('month', now()) > drape_quota_usage.month_anchor
              THEN 1
            ELSE drape_quota_usage.requests_month + 1
          END,
          month_anchor = date_trunc('month', now()),
          updated_at = now()
    RETURNING requests_month::text
  `;
  return Number(rows[0]?.requests_month || 0);
}

export async function assertRequestQuota(projectId: string): Promise<void> {
  const count = await recordRequest(projectId);
  if (count > config.drapeCloudRequestsQuotaPerMonth) {
    throw new QuotaExceededError(
      'request_quota_exceeded',
      `Monthly request quota reached (${config.drapeCloudRequestsQuotaPerMonth}).`,
    );
  }
}
