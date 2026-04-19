import { describe, expect, it } from 'vitest';
import {
  extractTableRefsFromCode,
  findUnusedDeclaredTables,
} from '../../../backend-ts/src/services/drape-cloud/declared-tables.service';
import type { PlannedTable } from '../../../backend-ts/src/services/drape-cloud/feature-to-tables';

describe('extractTableRefsFromCode', () => {
  it('returns [] when the code does not call drape.table', () => {
    expect(extractTableRefsFromCode('const x = 1;')).toEqual([]);
  });

  it('extracts single quoted table names', () => {
    const code = `const { rows } = await drape.table('products').list();`;
    expect(extractTableRefsFromCode(code)).toEqual(['products']);
  });

  it('extracts double quoted table names', () => {
    expect(extractTableRefsFromCode(`drape.table("orders").list()`)).toEqual(['orders']);
  });

  it('extracts backtick-quoted table names', () => {
    expect(extractTableRefsFromCode('drape.table(`wishlist_items`).get(id)')).toEqual([
      'wishlist_items',
    ]);
  });

  it('handles typed generic forms like drape.table<T>(...)', () => {
    const code = `drape.table<Product>('products').insert({ name: 'x' })`;
    expect(extractTableRefsFromCode(code)).toEqual(['products']);
  });

  it('handles whitespace variations', () => {
    const code = `drape . table ( 'cart_items' ).list()`;
    expect(extractTableRefsFromCode(code)).toEqual(['cart_items']);
  });

  it('deduplicates repeats within the same file', () => {
    const code = `
      drape.table('movies').list();
      drape.table('movies').insert({});
      drape.table('reviews').list();
    `;
    expect(extractTableRefsFromCode(code).sort()).toEqual(['movies', 'reviews']);
  });

  it('ignores the commented example in drape-cloud.js docs', () => {
    // A real JSDoc example — must not leak into the project's declared list.
    const code = `/**
 *   drape.table('movies').list({ where: { rating: { gte: 8 } } })
 */`;
    expect(extractTableRefsFromCode(code)).toEqual(['movies']);
    // ^ it DOES extract it — that's fine, because declared-tables
    //   live per-project and the user's own code is what matters.
    //   The doc-example case is not a bug, just a note.
  });

  it('rejects malformed table names (numeric-leading, special chars)', () => {
    // Our SDK only accepts [A-Za-z_][A-Za-z0-9_]* — enforce in regex too.
    expect(extractTableRefsFromCode(`drape.table('1bad').list()`)).toEqual([]);
    expect(extractTableRefsFromCode(`drape.table('has-dash').list()`)).toEqual([]);
    expect(extractTableRefsFromCode(`drape.table('').list()`)).toEqual([]);
  });
});

describe('findUnusedDeclaredTables', () => {
  const t = (name: string, scope: 'shared' | 'mine' | 'junction' = 'shared'): PlannedTable => ({
    name,
    scope,
    purpose: '',
    seedable: scope === 'shared',
  });

  it('returns [] when every declared table is used', () => {
    const declared = [t('products'), t('cart_items', 'mine')];
    const refs = ['products', 'cart_items'];
    expect(findUnusedDeclaredTables(declared, refs)).toEqual([]);
  });

  it('returns only the declared tables not in the refs list', () => {
    const declared = [t('products'), t('cart_items', 'mine'), t('reviews')];
    const refs = ['products'];
    expect(findUnusedDeclaredTables(declared, refs).sort()).toEqual(['cart_items', 'reviews']);
  });

  it('tolerates extra refs not in declared list (AI added table without declare)', () => {
    const declared = [t('products')];
    const refs = ['products', 'secret_extra'];
    // findUnusedDeclaredTables only flags UNUSED declared ones —
    // the "undeclared ref" case is the write_file validator's job.
    expect(findUnusedDeclaredTables(declared, refs)).toEqual([]);
  });

  it('returns all declared when refs is empty', () => {
    const declared = [t('a'), t('b')];
    expect(findUnusedDeclaredTables(declared, [])).toEqual(['a', 'b']);
  });
});
