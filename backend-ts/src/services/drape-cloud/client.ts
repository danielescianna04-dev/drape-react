/**
 * Drape Cloud Postgres client.
 *
 * Lazy singleton: a connection is only opened the first time
 * a drape-cloud endpoint is hit. This keeps `backend-ts` bootable
 * without the DB (e.g. in local dev when cloud is disabled).
 *
 * We use `postgres` (postgres.js) instead of `pg` because:
 * - native jsonb codec (no JSON.stringify boilerplate)
 * - tagged-template sql`` that's safe by construction
 * - ~0 deps, ~20kb
 *
 * NOTE: never use this client directly from route handlers. Always
 * go through `scopedQuery(projectId, ...)` so the project isolation
 * invariant is enforced at the type level.
 */

import postgres from 'postgres';
import { config } from '../../config';
import { log } from '../../utils/logger';

let sqlSingleton: postgres.Sql | null = null;

export function isDrapeCloudConfigured(): boolean {
  return typeof config.drapeCloudDbUrl === 'string' && config.drapeCloudDbUrl.length > 0;
}

export function getSql(): postgres.Sql {
  if (!isDrapeCloudConfigured()) {
    throw new Error('Drape Cloud DB is not configured — set DRAPE_CLOUD_DB_URL');
  }
  if (!sqlSingleton) {
    sqlSingleton = postgres(config.drapeCloudDbUrl, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
      prepare: false,
      onnotice: () => {},
    });
    log.info('[DrapeCloud] DB pool initialised');
  }
  return sqlSingleton;
}

export async function closeSql(): Promise<void> {
  if (sqlSingleton) {
    await sqlSingleton.end({ timeout: 5 });
    sqlSingleton = null;
  }
}
