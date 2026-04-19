import { describe, expect, it } from 'vitest';
import {
  buildOrderByFragment,
  buildWhereFragment,
  FilterParseError,
  parseLimit,
  parseOffset,
} from '../../../backend-ts/src/services/drape-cloud/filter';

describe('buildWhereFragment', () => {
  it('returns empty fragment for null/undefined', () => {
    expect(buildWhereFragment(null, 3)).toEqual({ sql: '', params: [] });
    expect(buildWhereFragment(undefined, 3)).toEqual({ sql: '', params: [] });
  });

  it('builds eq for scalar shorthand', () => {
    const f = buildWhereFragment({ author: 'sarah' }, 3);
    expect(f.sql).toBe(" AND (data->>'author') = $3");
    expect(f.params).toEqual(['sarah']);
  });

  it('coerces numbers + booleans to text for eq (jsonb ->> returns text)', () => {
    const f = buildWhereFragment({ archived: false, year: 2024 }, 2);
    expect(f.params).toEqual(['false', '2024']);
  });

  it('builds numeric comparisons with ::numeric cast', () => {
    const f = buildWhereFragment({ rating: { gte: 8 } }, 3);
    expect(f.sql).toBe(" AND ((data->>'rating')::numeric) >= $3");
    expect(f.params).toEqual([8]);
  });

  it('rejects numeric operators with non-numeric values', () => {
    expect(() => buildWhereFragment({ rating: { gt: 'eight' } }, 3)).toThrow(FilterParseError);
  });

  it('builds ILIKE for case-insensitive search', () => {
    const f = buildWhereFragment({ title: { ilike: '%rain%' } }, 3);
    expect(f.sql).toBe(" AND (data->>'title') ILIKE $3");
    expect(f.params).toEqual(['%rain%']);
  });

  it('builds IN with multiple placeholders', () => {
    const f = buildWhereFragment({ status: { in: ['draft', 'published'] } }, 3);
    expect(f.sql).toBe(" AND (data->>'status') IN ($3, $4)");
    expect(f.params).toEqual(['draft', 'published']);
  });

  it('rejects empty and oversized IN arrays', () => {
    expect(() => buildWhereFragment({ s: { in: [] } }, 3)).toThrow(/non-empty array/);
    const big = Array.from({ length: 65 }, (_, i) => `v${i}`);
    expect(() => buildWhereFragment({ s: { in: big } }, 3)).toThrow(/at most 64/);
  });

  it('combines multiple fields with AND', () => {
    const f = buildWhereFragment({ rating: { gte: 8 }, author: 'sarah' }, 3);
    expect(f.sql).toContain(' AND ');
    expect(f.params).toEqual([8, 'sarah']);
  });

  it('rejects field names with sql-injection-like characters', () => {
    expect(() => buildWhereFragment({ "title'; DROP TABLE": 'x' }, 3)).toThrow(FilterParseError);
    expect(() => buildWhereFragment({ 'data->>\'x\'': 'y' }, 3)).toThrow(FilterParseError);
    expect(() => buildWhereFragment({ '': 'y' }, 3)).toThrow(FilterParseError);
    expect(() => buildWhereFragment({ '1bad': 'y' }, 3)).toThrow(FilterParseError);
  });

  it('rejects unknown operators', () => {
    expect(() => buildWhereFragment({ x: { regex: '.*' } }, 3)).toThrow(/unknown operator/);
  });

  it('rejects non-scalar values for simple ops', () => {
    expect(() => buildWhereFragment({ x: { eq: { nested: true } } }, 3)).toThrow(FilterParseError);
  });

  it('rejects a top-level array as filter', () => {
    expect(() => buildWhereFragment([1, 2, 3] as any, 3)).toThrow(/must be an object/);
  });

  it('never inlines user input as SQL (always via $N)', () => {
    const f = buildWhereFragment({ payload: "x'; DELETE FROM drape_rows; --" }, 3);
    expect(f.sql).not.toContain('DELETE');
    expect(f.params).toEqual(["x'; DELETE FROM drape_rows; --"]);
  });
});

describe('buildOrderByFragment', () => {
  it('defaults when empty', () => {
    expect(buildOrderByFragment(undefined)).toBe('ORDER BY created_at DESC');
    expect(buildOrderByFragment('')).toBe('ORDER BY created_at DESC');
  });

  it('supports asc by default', () => {
    expect(buildOrderByFragment('title')).toBe("ORDER BY (data->>'title') ASC NULLS LAST");
  });

  it('supports descending with "-" prefix', () => {
    expect(buildOrderByFragment('-year')).toBe("ORDER BY (data->>'year') DESC NULLS LAST");
  });

  it('rejects unsafe field', () => {
    expect(() => buildOrderByFragment('title; DROP')).toThrow(FilterParseError);
    expect(() => buildOrderByFragment(123 as any)).toThrow(/must be a string/);
  });
});

describe('parseLimit / parseOffset', () => {
  it('clamps limit to [1, 500] with fallback 50', () => {
    expect(parseLimit(undefined)).toBe(50);
    expect(parseLimit('10')).toBe(10);
    expect(parseLimit(10000)).toBe(500);
    expect(parseLimit(-5)).toBe(1);
  });

  it('rejects non-numeric limit', () => {
    expect(() => parseLimit('abc')).toThrow(FilterParseError);
  });

  it('parses offset with defaults and rejects negatives / huge', () => {
    expect(parseOffset(undefined)).toBe(0);
    expect(parseOffset('100')).toBe(100);
    expect(() => parseOffset(-1)).toThrow();
    expect(() => parseOffset(200001)).toThrow();
  });
});
