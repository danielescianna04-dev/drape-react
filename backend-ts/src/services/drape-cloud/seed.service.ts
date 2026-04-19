/**
 * Drape Cloud seed loader.
 *
 * After the creation AI finishes writing files, it also leaves a
 * `.drape/cloud-seed.json` blob describing the initial rows each
 * logical table should start with. This module parses that file and
 * inserts the rows through the ScopedRowStore so the preview loads
 * with real data and the generated components can stay 100% clean
 * of hardcoded arrays.
 *
 * Shape of cloud-seed.json:
 *
 *   {
 *     "movies":   [{ "title": "Inception", "year": 2010 }, ...],
 *     "tasks":    [{ "text": "Buy milk", "done": false }, ...],
 *     "articles": [{ "title": "...", "body": "..." }, ...]
 *   }
 *
 * Hard limits (per project):
 * - max 32 tables
 * - max 50 rows per table
 * - max 16kb per row payload (scoped-query already enforces 64kb; we
 *   keep the seed ceiling smaller so one bad payload doesn't blow
 *   the whole seed)
 *
 * All failures are soft: a malformed file never blocks the creation
 * pipeline. The caller gets counts + warnings and can surface them
 * to the user instead.
 */

import { ScopedRowStore } from './scoped-query';

export interface SeedParseResult {
  /** Normalised { tableName: rows[] } map ready to insert. */
  tables: Map<string, Record<string, unknown>[]>;
  /** Human-readable warnings for skipped tables/rows. */
  warnings: string[];
}

export interface SeedApplyResult {
  tablesSeeded: number;
  rowsInserted: number;
  warnings: string[];
  failures: string[];
}

const MAX_TABLES = 32;
const MAX_ROWS_PER_TABLE = 50;
const MAX_ROW_BYTES = 16 * 1024;
const TABLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
// Meta columns live on drape_rows itself — they must never be part
// of the jsonb payload. We strip silently so AI-written seeds that
// include them by accident don't get rejected.
const META_KEYS = new Set(['id', 'rowid', 'created_at', 'updated_at', 'end_user_id', 'project_id', 'table_name']);

/**
 * Parse + validate a seed JSON string. Pure, no side effects, no
 * DB access — lets us unit-test the shape rules in isolation.
 */
export function parseSeedJson(raw: unknown): SeedParseResult {
  const warnings: string[] = [];
  const tables = new Map<string, Record<string, unknown>[]>();

  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return { tables, warnings: ['seed file is not valid JSON'] };
    }
  }

  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    return { tables, warnings: ['seed must be an object of { tableName: rows[] }'] };
  }

  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) return { tables, warnings };

  if (entries.length > MAX_TABLES) {
    warnings.push(`seed capped to ${MAX_TABLES} tables — extras ignored`);
  }

  for (const [tableName, rowsRaw] of entries.slice(0, MAX_TABLES)) {
    if (!TABLE_NAME_RE.test(tableName)) {
      warnings.push(`skipped invalid table name "${tableName}"`);
      continue;
    }
    if (!Array.isArray(rowsRaw)) {
      warnings.push(`skipped "${tableName}" — value must be an array`);
      continue;
    }
    const kept: Record<string, unknown>[] = [];
    for (let i = 0; i < Math.min(rowsRaw.length, MAX_ROWS_PER_TABLE); i += 1) {
      const row = rowsRaw[i];
      if (row == null || typeof row !== 'object' || Array.isArray(row)) {
        warnings.push(`skipped ${tableName}[${i}] — must be an object`);
        continue;
      }
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
        if (META_KEYS.has(k)) continue;
        clean[k] = v;
      }
      const serialized = JSON.stringify(clean);
      if (serialized.length > MAX_ROW_BYTES) {
        warnings.push(`skipped ${tableName}[${i}] — exceeds ${MAX_ROW_BYTES} bytes`);
        continue;
      }
      // Reject rows that are empty after stripping meta keys — they
      // would create noise rows in the DB without adding info.
      if (Object.keys(clean).length === 0) {
        warnings.push(`skipped ${tableName}[${i}] — empty after meta-key strip`);
        continue;
      }
      kept.push(clean);
    }
    if (rowsRaw.length > MAX_ROWS_PER_TABLE) {
      warnings.push(`${tableName}: truncated to ${MAX_ROWS_PER_TABLE} rows`);
    }
    if (kept.length > 0) tables.set(tableName, kept);
  }

  return { tables, warnings };
}

/**
 * Apply a parsed seed to the DB. Skips the table entirely if it
 * already has rows (idempotent — re-running creation won't double-
 * seed). Errors on individual inserts are captured as failures,
 * they don't abort the whole apply.
 */
export async function applySeed(
  projectId: string,
  parsed: SeedParseResult,
  storeFactory: (projectId: string) => ScopedRowStore = (id) => new ScopedRowStore(id),
): Promise<SeedApplyResult> {
  const result: SeedApplyResult = {
    tablesSeeded: 0,
    rowsInserted: 0,
    warnings: [...parsed.warnings],
    failures: [],
  };
  const store = storeFactory(projectId);

  for (const [tableName, rows] of parsed.tables) {
    try {
      const existing = await store.count(tableName);
      if (existing > 0) {
        result.warnings.push(`${tableName}: ${existing} rows already present — seed skipped`);
        continue;
      }
    } catch (err: any) {
      result.failures.push(`${tableName}: count check failed (${err.message})`);
      continue;
    }

    let seededHere = 0;
    for (let i = 0; i < rows.length; i += 1) {
      try {
        await store.insert({ tableName, data: rows[i] });
        seededHere += 1;
      } catch (err: any) {
        result.failures.push(`${tableName}[${i}]: ${err.message}`);
      }
    }
    if (seededHere > 0) {
      result.tablesSeeded += 1;
      result.rowsInserted += seededHere;
    }
  }

  return result;
}
