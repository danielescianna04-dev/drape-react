import { describe, expect, it, vi } from 'vitest';
import {
  applySeed,
  parseSeedJson,
} from '../../../backend-ts/src/services/drape-cloud/seed.service';

describe('parseSeedJson', () => {
  it('parses a valid seed with multiple tables', () => {
    const input = {
      movies: [
        { title: 'Inception', year: 2010 },
        { title: 'Matrix', year: 1999 },
      ],
      tasks: [{ text: 'Buy milk', done: false }],
    };
    const { tables, warnings } = parseSeedJson(input);
    expect(warnings).toEqual([]);
    expect(tables.get('movies')).toHaveLength(2);
    expect(tables.get('tasks')).toHaveLength(1);
    expect(tables.get('movies')?.[0]).toEqual({ title: 'Inception', year: 2010 });
  });

  it('accepts a JSON string as well as an object', () => {
    const str = JSON.stringify({ movies: [{ title: 'a' }] });
    const { tables } = parseSeedJson(str);
    expect(tables.get('movies')).toHaveLength(1);
  });

  it('warns on malformed JSON string', () => {
    const { tables, warnings } = parseSeedJson('{ broken');
    expect(tables.size).toBe(0);
    expect(warnings[0]).toMatch(/not valid JSON/);
  });

  it('rejects top-level arrays and primitives', () => {
    expect(parseSeedJson([1, 2]).warnings[0]).toMatch(/must be an object/);
    expect(parseSeedJson('hello').warnings[0]).toMatch(/JSON/);
    expect(parseSeedJson(42).warnings[0]).toMatch(/must be an object/);
  });

  it('skips tables whose value is not an array', () => {
    const { tables, warnings } = parseSeedJson({ movies: 'nope', tasks: [{ t: 1 }] });
    expect(tables.has('movies')).toBe(false);
    expect(tables.get('tasks')).toHaveLength(1);
    expect(warnings.some((w) => /movies/.test(w))).toBe(true);
  });

  it('skips invalid table names', () => {
    const { tables, warnings } = parseSeedJson({
      "movies'; DROP": [{ t: 1 }],
      '1starts': [{ t: 1 }],
      good_one: [{ t: 1 }],
    });
    expect(tables.has('good_one')).toBe(true);
    expect(tables.size).toBe(1);
    expect(warnings.filter((w) => /invalid table name/.test(w))).toHaveLength(2);
  });

  it('strips meta-keys (id, created_at, end_user_id, ...) silently', () => {
    const { tables } = parseSeedJson({
      movies: [
        { id: 'xxx', title: 'M', created_at: '2020', end_user_id: 'u', year: 2024 },
      ],
    });
    const row = tables.get('movies')![0];
    expect(row).toEqual({ title: 'M', year: 2024 });
    expect(row).not.toHaveProperty('id');
    expect(row).not.toHaveProperty('created_at');
    expect(row).not.toHaveProperty('end_user_id');
  });

  it('drops rows that are empty after meta-key strip', () => {
    const { tables, warnings } = parseSeedJson({
      movies: [{ id: 'only-meta', created_at: 'x' }, { title: 'real' }],
    });
    expect(tables.get('movies')).toHaveLength(1);
    expect(tables.get('movies')![0]).toEqual({ title: 'real' });
    expect(warnings.some((w) => /empty after meta-key strip/.test(w))).toBe(true);
  });

  it('caps each table to 50 rows and warns', () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ n: i }));
    const { tables, warnings } = parseSeedJson({ big: rows });
    expect(tables.get('big')).toHaveLength(50);
    expect(warnings.some((w) => /truncated to 50/.test(w))).toBe(true);
  });

  it('caps the number of tables to 32', () => {
    const input: Record<string, unknown> = {};
    for (let i = 0; i < 40; i += 1) input[`t_${i}`] = [{ v: i }];
    const { tables, warnings } = parseSeedJson(input);
    expect(tables.size).toBe(32);
    expect(warnings.some((w) => /capped to 32 tables/.test(w))).toBe(true);
  });

  it('drops oversized rows (> 16kb)', () => {
    const huge = { blob: 'x'.repeat(20_000) };
    const { tables, warnings } = parseSeedJson({ movies: [huge, { title: 'ok' }] });
    expect(tables.get('movies')).toHaveLength(1);
    expect(tables.get('movies')![0]).toEqual({ title: 'ok' });
    expect(warnings.some((w) => /exceeds 16384 bytes|exceeds \d+ bytes/.test(w))).toBe(true);
  });

  it('skips non-object rows (arrays, scalars)', () => {
    const { tables, warnings } = parseSeedJson({ movies: [[1, 2], 'str', 42, { title: 'ok' }] });
    expect(tables.get('movies')).toHaveLength(1);
    expect(warnings.filter((w) => /must be an object/.test(w))).toHaveLength(3);
  });

  it('returns an empty map for {}', () => {
    const { tables, warnings } = parseSeedJson({});
    expect(tables.size).toBe(0);
    expect(warnings).toEqual([]);
  });
});

describe('applySeed', () => {
  function fakeStore(projectId: string, opts: { counts?: Record<string, number>; throwOn?: { table: string; at: number } } = {}) {
    const counts = opts.counts || {};
    return {
      projectId,
      count: vi.fn(async (t: string) => counts[t] ?? 0),
      insert: vi.fn(async ({ tableName }: any) => {
        if (opts.throwOn?.table === tableName) {
          const insertsSoFar = (fakeStore as any)._calls++;
          if (insertsSoFar === opts.throwOn.at) throw new Error('simulated insert failure');
        }
        return { id: 'x', project_id: projectId, table_name: tableName } as any;
      }),
    } as any;
  }

  it('inserts every row of every table when DB is empty', async () => {
    const store = fakeStore('p1');
    const parsed = parseSeedJson({ movies: [{ t: 'a' }, { t: 'b' }], tasks: [{ t: 'c' }] });
    const result = await applySeed('p1', parsed, () => store);
    expect(result.tablesSeeded).toBe(2);
    expect(result.rowsInserted).toBe(3);
    expect(store.insert).toHaveBeenCalledTimes(3);
    expect(result.failures).toEqual([]);
  });

  it('is idempotent: skips a table that already has rows', async () => {
    const store = fakeStore('p1', { counts: { movies: 2 } });
    const parsed = parseSeedJson({ movies: [{ t: 'a' }], tasks: [{ t: 'c' }] });
    const result = await applySeed('p1', parsed, () => store);
    expect(result.tablesSeeded).toBe(1); // only tasks got seeded
    expect(result.rowsInserted).toBe(1);
    expect(store.insert).toHaveBeenCalledTimes(1);
    expect(result.warnings.some((w) => /rows already present/.test(w))).toBe(true);
  });

  it('captures per-row insert failures without aborting the batch', async () => {
    const calls = { n: 0 };
    const store: any = {
      count: async () => 0,
      insert: vi.fn(async ({ tableName }: any) => {
        calls.n += 1;
        if (calls.n === 1) throw new Error('nope');
        return { id: 'x', table_name: tableName };
      }),
    };
    const parsed = parseSeedJson({ movies: [{ t: 'a' }, { t: 'b' }] });
    const result = await applySeed('p1', parsed, () => store);
    expect(result.rowsInserted).toBe(1); // second one succeeded
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatch(/movies\[0\]/);
  });

  it('propagates parse warnings through to the apply result', async () => {
    const store: any = { count: async () => 0, insert: async () => ({ id: 'x' }) };
    const parsed = parseSeedJson({ '1bad': [{ v: 1 }], good: [{ v: 1 }] });
    const result = await applySeed('p1', parsed, () => store);
    expect(result.tablesSeeded).toBe(1);
    expect(result.warnings.some((w) => /invalid table name/.test(w))).toBe(true);
  });
});
