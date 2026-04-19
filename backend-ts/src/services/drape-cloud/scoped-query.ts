/**
 * Scoped row store — the ONLY path that reads/writes drape_rows.
 *
 * Every method is constructed for a specific `projectId` and injects
 * `project_id = $1` into every statement. There is no public method
 * here that emits a drape_rows query without the project scope. If
 * a route handler needed cross-project access it would have to break
 * this abstraction intentionally — making the security invariant
 * visible in the diff.
 *
 * This is the multi-tenant isolation boundary. All changes here
 * require a companion test in `drapeCloudIsolation.test.ts`.
 */

import type postgres from 'postgres';
import { getSql } from './client';
import {
  buildWhereFragment,
  buildOrderByFragment,
  parseLimit,
  parseOffset,
  FilterParseError,
} from './filter';

const SAFE_TABLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
// Row ids are Postgres uuids. The app sometimes routes with slugs or
// short numeric ids (e.g. /products/echo-dot) — Postgres would
// otherwise reject those with 22P02 and 500 the request. We treat a
// non-uuid as "no such row" and return null/false instead.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

export class ScopedValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopedValidationError';
  }
}

export interface DrapeRow {
  id: string;
  project_id: string;
  table_name: string;
  end_user_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ListOptions {
  tableName: string;
  where?: unknown;
  orderBy?: unknown;
  limit?: unknown;
  offset?: unknown;
  /** When provided, restrict results to rows owned by this end_user_id. */
  endUserId?: string | null;
}

export interface ListResult {
  rows: DrapeRow[];
  limit: number;
  offset: number;
}

function assertTableName(tableName: unknown): string {
  if (typeof tableName !== 'string' || !SAFE_TABLE_NAME_RE.test(tableName)) {
    throw new ScopedValidationError('invalid tableName');
  }
  return tableName;
}

function assertProjectId(projectId: unknown): string {
  if (typeof projectId !== 'string' || projectId.length < 3 || projectId.length > 128) {
    throw new ScopedValidationError('invalid projectId');
  }
  return projectId;
}

function assertDataPayload(data: unknown): Record<string, unknown> {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ScopedValidationError('data must be a plain object');
  }
  // Hard cap: 64kb of jsonb per row, measured after JSON.stringify.
  const serialized = JSON.stringify(data);
  if (serialized.length > 64 * 1024) {
    throw new ScopedValidationError('data payload exceeds 64kb');
  }
  return data as Record<string, unknown>;
}

export class ScopedRowStore {
  private readonly sql: postgres.Sql;
  private readonly projectId: string;

  constructor(projectId: string, sqlOverride?: postgres.Sql) {
    this.projectId = assertProjectId(projectId);
    this.sql = sqlOverride || getSql();
  }

  async list(opts: ListOptions): Promise<ListResult> {
    const table = assertTableName(opts.tableName);
    const limit = parseLimit(opts.limit);
    const offset = parseOffset(opts.offset);
    // $1 = project_id, $2 = table_name, $3 = end_user_filter, rest = filter params.
    const params: unknown[] = [this.projectId, table];
    let userFilter = '';
    if (opts.endUserId !== undefined && opts.endUserId !== null) {
      params.push(opts.endUserId);
      userFilter = ` AND end_user_id = $${params.length}`;
    }
    const where = buildWhereFragment(opts.where, params.length + 1);
    params.push(...where.params);

    const order = buildOrderByFragment(opts.orderBy);
    const sqlText =
      `SELECT id, project_id, table_name, end_user_id, data, created_at, updated_at ` +
      `FROM drape_rows ` +
      `WHERE project_id = $1 AND table_name = $2${userFilter}${where.sql} ` +
      `${order} LIMIT ${limit} OFFSET ${offset}`;

    const rows = (await this.sql.unsafe(sqlText, params as any[])) as unknown as DrapeRow[];
    return { rows, limit, offset };
  }

  async get(tableName: string, id: string): Promise<DrapeRow | null> {
    const table = assertTableName(tableName);
    if (typeof id !== 'string' || id.length > 64) throw new ScopedValidationError('invalid id');
    // A non-uuid id will never match a real row (the column is uuid).
    // Short-circuit with null so Postgres never raises 22P02 and the
    // API returns a clean 404.
    if (!isValidUuid(id)) return null;
    const rows = await this.sql<DrapeRow[]>`
      SELECT id, project_id, table_name, end_user_id, data, created_at, updated_at
      FROM drape_rows
      WHERE project_id = ${this.projectId}
        AND table_name = ${table}
        AND id = ${id}
    `;
    return rows[0] || null;
  }

  async insert(opts: {
    tableName: string;
    data: unknown;
    endUserId?: string | null;
  }): Promise<DrapeRow> {
    const table = assertTableName(opts.tableName);
    const payload = assertDataPayload(opts.data);
    const endUserId = opts.endUserId ?? null;
    const rows = await this.sql<DrapeRow[]>`
      INSERT INTO drape_rows (project_id, table_name, end_user_id, data)
      VALUES (${this.projectId}, ${table}, ${endUserId}, ${this.sql.json(payload as any)})
      RETURNING id, project_id, table_name, end_user_id, data, created_at, updated_at
    `;
    return rows[0];
  }

  /**
   * Merge-update: new keys are added to `data`, overlapping keys are
   * replaced, omitted keys stay. Returns the updated row or null if
   * no row matched (id not found or belongs to another project).
   */
  async update(opts: { tableName: string; id: string; data: unknown }): Promise<DrapeRow | null> {
    const table = assertTableName(opts.tableName);
    if (typeof opts.id !== 'string') throw new ScopedValidationError('invalid id');
    const patch = assertDataPayload(opts.data);
    if (!isValidUuid(opts.id)) return null;
    const rows = await this.sql<DrapeRow[]>`
      UPDATE drape_rows
      SET data = data || ${this.sql.json(patch as any)}, updated_at = now()
      WHERE project_id = ${this.projectId}
        AND table_name = ${table}
        AND id = ${opts.id}
      RETURNING id, project_id, table_name, end_user_id, data, created_at, updated_at
    `;
    return rows[0] || null;
  }

  /** Returns true when a row was deleted, false when no row matched. */
  async delete(tableName: string, id: string): Promise<boolean> {
    const table = assertTableName(tableName);
    if (typeof id !== 'string') throw new ScopedValidationError('invalid id');
    if (!isValidUuid(id)) return false;
    const result = await this.sql`
      DELETE FROM drape_rows
      WHERE project_id = ${this.projectId}
        AND table_name = ${table}
        AND id = ${id}
    `;
    return (result.count ?? 0) > 0;
  }

  async count(tableName: string): Promise<number> {
    const table = assertTableName(tableName);
    const rows = await this.sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM drape_rows
      WHERE project_id = ${this.projectId} AND table_name = ${table}
    `;
    return Number(rows[0]?.count || 0);
  }
}

export { FilterParseError };
