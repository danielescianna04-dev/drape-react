// ================================================================
// Published-site analytics.
//
// Records one row per page view of a published Drape app, then
// aggregates at read time for the creator's analytics dashboard.
//
// Two write paths:
//   - recordView()   : called from request middleware on /p/:slug.
//                      Resilient: never throws (analytics must not
//                      break the request). Also bumps Firestore
//                      `viewCount` so Explore ranking stays cheap.
//   - getSummary()   : called from the analytics endpoint to render
//                      visits/day, top countries, top referrers.
//
// We use the existing Drape Cloud Postgres pool via getSql(). The
// uniqueness index on (slug, visitor_hash, day) makes inserts
// idempotent within a calendar day, which is how we count "unique
// visitors per day" without storing raw IPs.
// ================================================================

import { createHash } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getSql, isDrapeCloudConfigured } from './drape-cloud/client';
import { firebaseService } from './firebase.service';
import { log } from '../utils/logger';

const DAY_MS = 24 * 60 * 60 * 1000;

function hashVisitor(ip: string, ua: string): string {
  // Bucket by UTC day so the unique index dedupes per-day visits.
  const dayBucket = Math.floor(Date.now() / DAY_MS);
  return createHash('sha256').update(`${ip}|${ua}|${dayBucket}`).digest('hex');
}

export interface RecordViewInput {
  slug: string;
  projectId: string;
  ip: string;
  userAgent: string;
  referrer?: string;
  path?: string;
  country?: string;
}

export async function recordPublishedView(input: RecordViewInput): Promise<void> {
  if (!input.slug || !input.projectId) return;
  const visitorHash = hashVisitor(input.ip || 'unknown', input.userAgent || '');

  // 1. Postgres append (best-effort, swallow on failure).
  if (isDrapeCloudConfigured()) {
    try {
      const sql = getSql();
      await sql`
        INSERT INTO drape_published_views
          (slug, project_id, visitor_hash, country, referrer, path)
        VALUES
          (${input.slug}, ${input.projectId}, ${visitorHash},
           ${input.country || null}, ${input.referrer || null}, ${input.path || null})
        ON CONFLICT (slug, visitor_hash, date_trunc('day', created_at)) DO NOTHING
      `;
    } catch (err: any) {
      log.warn(`[Analytics] Postgres insert failed for ${input.slug}: ${err?.message || err}`);
    }
  }

  // 2. Firestore atomic counter bump for Explore ranking.
  try {
    const db = firebaseService.getFirestore();
    if (db) {
      await db.collection('published_sites').doc(input.slug)
        .set({ viewCount: FieldValue.increment(1) }, { merge: true });
    }
  } catch (err: any) {
    log.warn(`[Analytics] Firestore viewCount bump failed for ${input.slug}: ${err?.message || err}`);
  }
}

export interface AnalyticsSummary {
  totalViews: number;
  uniqueVisitors: number;
  byDay: { day: string; views: number }[];
  topCountries: { country: string; views: number }[];
  topReferrers: { referrer: string; views: number }[];
}

export async function getPublishedAnalytics(slug: string, days = 30): Promise<AnalyticsSummary> {
  const empty: AnalyticsSummary = { totalViews: 0, uniqueVisitors: 0, byDay: [], topCountries: [], topReferrers: [] };
  if (!isDrapeCloudConfigured()) return empty;

  try {
    const sql = getSql();
    const since = new Date(Date.now() - days * DAY_MS);

    const [totals, byDay, byCountry, byReferrer] = await Promise.all([
      sql<{ total: string; unique_visitors: string }[]>`
        SELECT count(*)::text AS total, count(DISTINCT visitor_hash)::text AS unique_visitors
        FROM drape_published_views
        WHERE slug = ${slug} AND created_at >= ${since}
      `,
      sql<{ day: string; views: string }[]>`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
               count(*)::text AS views
        FROM drape_published_views
        WHERE slug = ${slug} AND created_at >= ${since}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      sql<{ country: string; views: string }[]>`
        SELECT coalesce(country, 'Unknown') AS country, count(*)::text AS views
        FROM drape_published_views
        WHERE slug = ${slug} AND created_at >= ${since}
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 10
      `,
      sql<{ referrer: string; views: string }[]>`
        SELECT coalesce(referrer, 'Direct') AS referrer, count(*)::text AS views
        FROM drape_published_views
        WHERE slug = ${slug} AND created_at >= ${since}
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 10
      `,
    ]);

    return {
      totalViews: parseInt(totals[0]?.total || '0', 10),
      uniqueVisitors: parseInt(totals[0]?.unique_visitors || '0', 10),
      byDay: byDay.map(r => ({ day: r.day, views: parseInt(r.views, 10) })),
      topCountries: byCountry.map(r => ({ country: r.country, views: parseInt(r.views, 10) })),
      topReferrers: byReferrer.map(r => ({ referrer: r.referrer, views: parseInt(r.views, 10) })),
    };
  } catch (err: any) {
    log.warn(`[Analytics] Summary failed for ${slug}: ${err?.message || err}`);
    return empty;
  }
}
