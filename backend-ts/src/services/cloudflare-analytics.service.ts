/**
 * Cloudflare Analytics adapter for published sites.
 *
 * Sites published via CF Pages don't hit our backend, so the postgres-based
 * `recordPublishedView` counter stays at zero for them. We instead query
 * Cloudflare's GraphQL Analytics API at zone level, filtered by the custom
 * hostname (e.g. dsas.drape.info), which works because the CNAME is proxied
 * (orange-cloud) — every request flows through Cloudflare and shows up in
 * the zone's httpRequestsAdaptiveGroups dataset.
 *
 * Requires CLOUDFLARE_API_TOKEN with Analytics:Read on the zone.
 */

import { config } from '../config';
import { log } from '../utils/logger';
import type { AnalyticsSummary } from './published-analytics.service';

const GQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const DAY_MS = 24 * 60 * 60 * 1000;

interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  try {
    const r = await fetch(GQL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.cloudflareApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await r.json()) as GqlResponse<T>;
    if (json.errors?.length) {
      log.warn(`[CFAnalytics] GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`);
      return null;
    }
    return json.data ?? null;
  } catch (err: any) {
    log.warn(`[CFAnalytics] fetch failed: ${err?.message || err}`);
    return null;
  }
}

type ZoneRows<D> = {
  viewer: {
    zones: Array<{
      httpRequestsAdaptiveGroups: Array<{
        count: number;
        uniq?: { uniques: number };
        dimensions?: D;
      }>;
    }>;
  };
};

const TOTALS_Q = `query Totals($zoneTag:String!,$since:Time!,$until:Time!,$host:String!) {
  viewer { zones(filter:{zoneTag:$zoneTag}) {
    httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$since,datetime_leq:$until,clientRequestHTTPHost:$host}) {
      count uniq { uniques }
    }
  }}
}`;

const BY_DAY_Q = `query ByDay($zoneTag:String!,$since:Time!,$until:Time!,$host:String!) {
  viewer { zones(filter:{zoneTag:$zoneTag}) {
    httpRequestsAdaptiveGroups(limit:1000, orderBy:[date_ASC],
      filter:{datetime_geq:$since,datetime_leq:$until,clientRequestHTTPHost:$host}) {
      count dimensions { date }
    }
  }}
}`;

const BY_COUNTRY_Q = `query ByCountry($zoneTag:String!,$since:Time!,$until:Time!,$host:String!) {
  viewer { zones(filter:{zoneTag:$zoneTag}) {
    httpRequestsAdaptiveGroups(limit:10, orderBy:[count_DESC],
      filter:{datetime_geq:$since,datetime_leq:$until,clientRequestHTTPHost:$host}) {
      count dimensions { clientCountryName }
    }
  }}
}`;

const BY_REFERRER_Q = `query ByReferrer($zoneTag:String!,$since:Time!,$until:Time!,$host:String!) {
  viewer { zones(filter:{zoneTag:$zoneTag}) {
    httpRequestsAdaptiveGroups(limit:10, orderBy:[count_DESC],
      filter:{datetime_geq:$since,datetime_leq:$until,clientRequestHTTPHost:$host}) {
      count dimensions { clientRequestReferer }
    }
  }}
}`;

export async function getCloudflareAnalytics(hostname: string, days = 30): Promise<AnalyticsSummary> {
  const empty: AnalyticsSummary = {
    totalViews: 0,
    uniqueVisitors: 0,
    byDay: [],
    topCountries: [],
    topReferrers: [],
  };

  if (!config.cloudflareZoneId || !config.cloudflareApiToken || !hostname) return empty;

  const until = new Date().toISOString();
  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const vars = { zoneTag: config.cloudflareZoneId, since, until, host: hostname };

  const [totals, byDay, byCountry, byReferrer] = await Promise.all([
    gql<ZoneRows<{}>>(TOTALS_Q, vars),
    gql<ZoneRows<{ date: string }>>(BY_DAY_Q, vars),
    gql<ZoneRows<{ clientCountryName: string }>>(BY_COUNTRY_Q, vars),
    gql<ZoneRows<{ clientRequestReferer: string }>>(BY_REFERRER_Q, vars),
  ]);

  const totalRow = totals?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups?.[0];
  const byDayRows = byDay?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
  const byCountryRows = byCountry?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
  const byReferrerRows = byReferrer?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];

  return {
    totalViews: totalRow?.count || 0,
    uniqueVisitors: totalRow?.uniq?.uniques || 0,
    byDay: byDayRows.map((r) => ({ day: r.dimensions?.date || '', views: r.count })),
    topCountries: byCountryRows.map((r) => ({
      country: r.dimensions?.clientCountryName || 'Unknown',
      views: r.count,
    })),
    topReferrers: byReferrerRows.map((r) => ({
      referrer: r.dimensions?.clientRequestReferer || 'Direct',
      views: r.count,
    })),
  };
}
