/**
 * Pure filter parser for Drape Cloud queries.
 *
 * The SDK sends filters like `{ rating: { gte: 8 }, author: 'sarah' }`.
 * This module turns that into a safe parameterised WHERE fragment on
 * the jsonb `data` column.
 *
 * Kept pure + allocation-free so it's easy to fuzz/test without a DB.
 * No value is ever inlined into SQL — everything goes through `$N`
 * placeholders returned in `params`.
 */

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in';

export interface BuiltFilter {
  /** SQL fragment starting with "AND ..." (empty string when filter is empty). */
  sql: string;
  /** Positional values to bind to the placeholders in `sql`. */
  params: unknown[];
}

const OP_MAP: Record<FilterOp, { sqlOp: string; cast: 'text' | 'numeric' }> = {
  eq: { sqlOp: '=', cast: 'text' },
  neq: { sqlOp: '<>', cast: 'text' },
  gt: { sqlOp: '>', cast: 'numeric' },
  gte: { sqlOp: '>=', cast: 'numeric' },
  lt: { sqlOp: '<', cast: 'numeric' },
  lte: { sqlOp: '<=', cast: 'numeric' },
  like: { sqlOp: 'LIKE', cast: 'text' },
  ilike: { sqlOp: 'ILIKE', cast: 'text' },
  in: { sqlOp: 'IN', cast: 'text' },
};

const SAFE_FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

export class FilterParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilterParseError';
  }
}

/**
 * Build a `WHERE`-compatible fragment from a filter object.
 *
 * @param filter  user-supplied filter payload (JSON-parsed)
 * @param startIndex next positional placeholder index (e.g. 2 when
 *                   project_id and table_name already used $1, $2)
 */
export function buildWhereFragment(filter: unknown, startIndex: number): BuiltFilter {
  if (filter == null) return { sql: '', params: [] };
  if (typeof filter !== 'object' || Array.isArray(filter)) {
    throw new FilterParseError('filter must be an object');
  }

  const fragments: string[] = [];
  const params: unknown[] = [];
  let idx = startIndex;

  for (const [field, rawValue] of Object.entries(filter as Record<string, unknown>)) {
    if (!SAFE_FIELD_RE.test(field)) {
      throw new FilterParseError(`invalid field name: ${field}`);
    }

    // Shorthand: `{ field: value }` → eq
    if (
      rawValue === null ||
      typeof rawValue === 'string' ||
      typeof rawValue === 'number' ||
      typeof rawValue === 'boolean'
    ) {
      fragments.push(`(data->>'${field}') = $${idx}`);
      params.push(rawValue === null ? null : String(rawValue));
      idx += 1;
      continue;
    }

    if (typeof rawValue !== 'object' || Array.isArray(rawValue)) {
      throw new FilterParseError(`invalid value for field ${field}`);
    }

    for (const [opName, opValue] of Object.entries(rawValue as Record<string, unknown>)) {
      if (!(opName in OP_MAP)) {
        throw new FilterParseError(`unknown operator: ${opName}`);
      }
      const op = OP_MAP[opName as FilterOp];

      if (opName === 'in') {
        if (!Array.isArray(opValue) || opValue.length === 0) {
          throw new FilterParseError('"in" requires a non-empty array');
        }
        if (opValue.length > 64) {
          throw new FilterParseError('"in" accepts at most 64 values');
        }
        const placeholders = opValue.map(() => {
          const p = `$${idx}`;
          idx += 1;
          return p;
        });
        fragments.push(`(data->>'${field}') IN (${placeholders.join(', ')})`);
        for (const v of opValue) {
          if (v !== null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
            throw new FilterParseError('"in" values must be scalars');
          }
          params.push(v === null ? null : String(v));
        }
        continue;
      }

      if (
        opValue !== null &&
        typeof opValue !== 'string' &&
        typeof opValue !== 'number' &&
        typeof opValue !== 'boolean'
      ) {
        throw new FilterParseError(`operator value must be a scalar for ${field}.${opName}`);
      }

      if (op.cast === 'numeric') {
        if (typeof opValue !== 'number') {
          throw new FilterParseError(`${opName} requires a numeric value on ${field}`);
        }
        fragments.push(`((data->>'${field}')::numeric) ${op.sqlOp} $${idx}`);
        params.push(opValue);
      } else {
        fragments.push(`(data->>'${field}') ${op.sqlOp} $${idx}`);
        params.push(opValue === null ? null : String(opValue));
      }
      idx += 1;
    }
  }

  if (fragments.length === 0) return { sql: '', params: [] };
  return { sql: ' AND ' + fragments.join(' AND '), params };
}

/**
 * Parse orderBy spec: `"field"` (asc) or `"-field"` (desc).
 * Returns a safe ORDER BY fragment, or a default when input is empty.
 */
export function buildOrderByFragment(orderBy: unknown, fallback = 'created_at DESC'): string {
  if (orderBy == null || orderBy === '') return `ORDER BY ${fallback}`;
  if (typeof orderBy !== 'string') throw new FilterParseError('orderBy must be a string');
  const desc = orderBy.startsWith('-');
  const field = desc ? orderBy.slice(1) : orderBy;
  if (!SAFE_FIELD_RE.test(field)) throw new FilterParseError(`invalid orderBy field: ${field}`);
  return `ORDER BY (data->>'${field}') ${desc ? 'DESC' : 'ASC'} NULLS LAST`;
}

/** Clamp limit to [1, 500] (sane default 50). */
export function parseLimit(raw: unknown, fallback = 50, max = 500): number {
  if (raw == null) return fallback;
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n)) throw new FilterParseError('limit must be a number');
  if (n < 1) return 1;
  if (n > max) return max;
  return Math.floor(n);
}

/** Non-negative offset, default 0, soft-cap 100000. */
export function parseOffset(raw: unknown): number {
  if (raw == null) return 0;
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new FilterParseError('offset must be >= 0');
  if (n > 100000) throw new FilterParseError('offset too large');
  return Math.floor(n);
}
