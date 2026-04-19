/**
 * Structural isolation test for ScopedRowStore.
 *
 * We don't need a live Postgres here: every query the store issues
 * MUST reference the bound projectId. We wrap the `postgres.js` Sql
 * interface with a recording mock and assert, for every public
 * method, that:
 *
 *   1. the final SQL includes "project_id =" in a WHERE clause
 *   2. the bound parameter for project_id is EXACTLY the ctor arg
 *   3. the store refuses obviously-invalid inputs before hitting SQL
 *
 * If an engineer adds a new method that queries drape_rows without
 * scoping, one of these assertions fires. That's the point — keep
 * the multi-tenant invariant tested in every CI run.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  ScopedRowStore,
  ScopedValidationError,
} from '../../../backend-ts/src/services/drape-cloud/scoped-query';

type Call = { kind: 'tagged' | 'unsafe'; sql: string; params: unknown[] };

function createRecordingSql() {
  const calls: Call[] = [];
  // Response arrays get a `count` tacked on for postgres.js
  // compat (DELETE's `.count`). We cast to `any` to keep the test
  // file type-safe without importing postgres internals.
  const response: any = [];
  response.count = 0;

  // Tagged-template call — postgres.js reconstructs the SQL by
  // interleaving `strings` and positional placeholders. We just
  // record both for later inspection.
  function tagged(strings: TemplateStringsArray, ...values: unknown[]) {
    const parts: string[] = [];
    strings.forEach((s, i) => {
      parts.push(s);
      if (i < values.length) parts.push(`$${i + 1}`);
    });
    calls.push({ kind: 'tagged', sql: parts.join(''), params: values });
    // Return a thenable so `await sql\`...\`` resolves to [].
    return Promise.resolve(response);
  }

  // Unsafe (string + positional array) — used by list() for the
  // dynamic WHERE fragment. Same recording semantics.
  (tagged as any).unsafe = (sqlText: string, params: unknown[]) => {
    calls.push({ kind: 'unsafe', sql: sqlText, params });
    return Promise.resolve(response);
  };

  (tagged as any).json = (value: unknown) => ({ __json: value });

  return { sql: tagged as any, calls };
}

const PROJECT_A = 'project-AAA';
const PROJECT_B = 'project-BBB';

function newStore(projectId: string) {
  const rec = createRecordingSql();
  const store = new ScopedRowStore(projectId, rec.sql);
  return { store, rec };
}

function assertProjectScoped(call: Call, expectedProjectId: string) {
  // Two valid shapes: SELECT/UPDATE/DELETE use `project_id = $N`,
  // INSERT uses `INSERT INTO drape_rows (project_id, ...) VALUES (...)`
  // so the projectId is simply one of the bound params (and always
  // the first column in the column list).
  const whereMatch = call.sql.match(/project_id\s*=\s*\$(\d+)/);
  if (whereMatch) {
    const idx = Number(whereMatch[1]);
    expect(call.params[idx - 1]).toBe(expectedProjectId);
    return;
  }
  expect(call.sql, `query missing project scope — ${call.sql}`).toMatch(
    /INSERT INTO drape_rows \(project_id/,
  );
  expect(call.params, `project_id not bound as param — ${call.sql}`).toContain(expectedProjectId);
}

describe('ScopedRowStore — isolation invariant', () => {
  it('list() binds projectId as $1 and includes the table filter', async () => {
    const { store, rec } = newStore(PROJECT_A);
    await store.list({ tableName: 'movies' });
    expect(rec.calls).toHaveLength(1);
    const call = rec.calls[0];
    assertProjectScoped(call, PROJECT_A);
    expect(call.sql).toContain('table_name = $2');
    expect(call.params[1]).toBe('movies');
  });

  it('list() with a where filter still binds projectId as $1', async () => {
    const { store, rec } = newStore(PROJECT_A);
    await store.list({ tableName: 'movies', where: { rating: { gte: 8 } } });
    const call = rec.calls[0];
    assertProjectScoped(call, PROJECT_A);
    expect(call.sql).toContain("((data->>'rating')::numeric) >= $");
  });

  it('list() with endUserId adds user_id filter without dropping project scope', async () => {
    const { store, rec } = newStore(PROJECT_A);
    await store.list({ tableName: 'movies', endUserId: 'user-1' });
    const call = rec.calls[0];
    assertProjectScoped(call, PROJECT_A);
    expect(call.sql).toContain('end_user_id = $3');
    expect(call.params[2]).toBe('user-1');
  });

  it('get() binds projectId in the WHERE clause', async () => {
    const { store, rec } = newStore(PROJECT_A);
    await store.get('movies', '4b5f314f-4c82-4f21-b252-282724295cd2');
    const call = rec.calls[0];
    assertProjectScoped(call, PROJECT_A);
  });

  it('insert() binds projectId so rows cannot leak into another project', async () => {
    const { store, rec } = newStore(PROJECT_A);
    await store.insert({ tableName: 'movies', data: { title: 'x' } });
    const call = rec.calls[0];
    expect(call.sql).toMatch(/INSERT INTO drape_rows/);
    // INSERT binds project_id in the VALUES list; make sure the
    // bound value IS the constructor argument (not the table name
    // or some other positional param).
    expect(call.params).toContain(PROJECT_A);
  });

  it('update() scopes to projectId', async () => {
    const { store, rec } = newStore(PROJECT_A);
    await store.update({ tableName: 'movies', id: '4b5f314f-4c82-4f21-b252-282724295cd2', data: { title: 'y' } });
    const call = rec.calls[0];
    assertProjectScoped(call, PROJECT_A);
    expect(call.sql).toMatch(/UPDATE drape_rows/);
  });

  it('delete() scopes to projectId', async () => {
    const { store, rec } = newStore(PROJECT_A);
    await store.delete('movies', '4b5f314f-4c82-4f21-b252-282724295cd2');
    const call = rec.calls[0];
    assertProjectScoped(call, PROJECT_A);
    expect(call.sql).toMatch(/DELETE FROM drape_rows/);
  });

  it('count() scopes to projectId', async () => {
    const { store, rec } = newStore(PROJECT_A);
    await store.count('movies');
    const call = rec.calls[0];
    assertProjectScoped(call, PROJECT_A);
  });

  it('two stores never share the project_id binding', async () => {
    const { store: storeA, rec: recA } = newStore(PROJECT_A);
    const { store: storeB, rec: recB } = newStore(PROJECT_B);
    await storeA.list({ tableName: 'movies' });
    await storeB.list({ tableName: 'movies' });
    assertProjectScoped(recA.calls[0], PROJECT_A);
    assertProjectScoped(recB.calls[0], PROJECT_B);
    // And the bound values are actually different (belt + braces).
    expect(recA.calls[0].params).not.toContain(PROJECT_B);
    expect(recB.calls[0].params).not.toContain(PROJECT_A);
  });

  it('never issues a drape_rows query missing the project_id bind', async () => {
    // Exercise EVERY public method once and inspect every recorded call.
    const { store, rec } = newStore(PROJECT_A);
    await store.list({ tableName: 'movies' });
    await store.list({ tableName: 'movies', where: { x: 1 }, endUserId: 'u' });
    await store.get('movies', '4b5f314f-4c82-4f21-b252-282724295cd2');
    await store.insert({ tableName: 'movies', data: { a: 1 } });
    await store.update({ tableName: 'movies', id: '4b5f314f-4c82-4f21-b252-282724295cd2', data: { a: 2 } });
    await store.delete('movies', '4b5f314f-4c82-4f21-b252-282724295cd2');
    await store.count('movies');
    for (const call of rec.calls) {
      expect(call.sql).toMatch(/drape_rows/);
      // Every call binds the scoped projectId via some $N placeholder.
      assertProjectScoped(call, PROJECT_A);
    }
  });
});

describe('ScopedRowStore — input validation', () => {
  it('rejects invalid table names before hitting SQL', async () => {
    const { store } = newStore(PROJECT_A);
    await expect(() => store.list({ tableName: "movies'; DROP TABLE" } as any)).rejects.toThrow(
      ScopedValidationError,
    );
    await expect(() => store.list({ tableName: '' } as any)).rejects.toThrow(ScopedValidationError);
    await expect(() => store.list({ tableName: '1leading' } as any)).rejects.toThrow(
      ScopedValidationError,
    );
  });

  it('rejects non-object data on insert', async () => {
    const { store } = newStore(PROJECT_A);
    await expect(() => store.insert({ tableName: 'movies', data: 'hi' as any })).rejects.toThrow(
      ScopedValidationError,
    );
    await expect(() => store.insert({ tableName: 'movies', data: [1, 2] as any })).rejects.toThrow(
      ScopedValidationError,
    );
  });

  it('rejects payloads > 64kb', async () => {
    const { store } = newStore(PROJECT_A);
    const huge = { blob: 'x'.repeat(70_000) };
    await expect(() => store.insert({ tableName: 'movies', data: huge })).rejects.toThrow(/64kb/);
  });

  it('returns null from get() when id is not a uuid (no SQL emitted)', async () => {
    const { store, rec } = newStore(PROJECT_A);
    const result = await store.get('movies', 'echo-dot');
    expect(result).toBeNull();
    expect(rec.calls).toHaveLength(0);
  });

  it('returns null from update() when id is not a uuid (no SQL emitted)', async () => {
    const { store, rec } = newStore(PROJECT_A);
    const result = await store.update({ tableName: 'movies', id: '1', data: { x: 1 } });
    expect(result).toBeNull();
    expect(rec.calls).toHaveLength(0);
  });

  it('returns false from delete() when id is not a uuid (no SQL emitted)', async () => {
    const { store, rec } = newStore(PROJECT_A);
    const result = await store.delete('movies', 'slug-value');
    expect(result).toBe(false);
    expect(rec.calls).toHaveLength(0);
  });

  it('rejects invalid projectId in ctor', () => {
    expect(() => new ScopedRowStore('x' as any, {} as any)).toThrow(ScopedValidationError);
    expect(() => new ScopedRowStore(null as any, {} as any)).toThrow(ScopedValidationError);
  });
});
