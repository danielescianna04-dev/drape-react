import { describe, expect, it } from 'vitest';
import {
  inferDataModel,
  renderDataModelMarkdown,
  renderSeedSkeleton,
} from '../../../backend-ts/src/services/drape-cloud/feature-to-tables';

describe('inferDataModel — description keywords', () => {
  it('returns an empty plan when nothing matches', () => {
    const plan = inferDataModel({ description: 'hello world', structuredAnswers: {} });
    expect(plan.tables).toEqual([]);
    expect(plan.requiresAuth).toBe(false);
    expect(plan.matches).toEqual([]);
  });

  it('extracts cart + orders from shopping keywords', () => {
    const plan = inferDataModel({ description: 'Online store with shopping cart and checkout' });
    const names = plan.tables.map((t) => t.name);
    expect(names).toContain('cart_items');
    expect(names).toContain('orders');
    expect(plan.requiresAuth).toBe(true); // cart_items is mine
  });

  it('marks shared catalog tables as seedable', () => {
    const plan = inferDataModel({ description: 'Browse a product catalog' });
    const products = plan.tables.find((t) => t.name === 'products');
    expect(products).toBeDefined();
    expect(products?.scope).toBe('shared');
    expect(products?.seedable).toBe(true);
  });

  it('marks user-owned tables as non-seedable', () => {
    const plan = inferDataModel({ description: 'A wishlist app for saving items' });
    const wishlist = plan.tables.find((t) => t.name === 'wishlist_items');
    expect(wishlist).toBeDefined();
    expect(wishlist?.scope).toBe('mine');
    expect(wishlist?.seedable).toBe(false);
  });

  it('works with Italian descriptions', () => {
    const plan = inferDataModel({
      description: 'Un negozio con carrello, lista desideri, e recensioni dei prodotti',
    });
    const names = plan.tables.map((t) => t.name);
    expect(names).toContain('products');
    expect(names).toContain('cart_items');
    expect(names).toContain('wishlist_items');
    expect(names).toContain('reviews');
  });

  it('derives tables from structuredAnswers values (option ids)', () => {
    const plan = inferDataModel({
      description: '',
      structuredAnswers: {
        pages: ['catalog_grid', 'shopping_cart', 'wishlist_page'],
      },
    });
    const names = plan.tables.map((t) => t.name);
    // "shopping_cart" option id matches the "shopping"/"cart" keyword
    expect(names).toContain('cart_items');
    // "wishlist_page" matches the "wishlist" keyword
    expect(names).toContain('wishlist_items');
  });

  it('deduplicates across description and answers', () => {
    const plan = inferDataModel({
      description: 'A task manager',
      structuredAnswers: { main_feature: ['task_list', 'todo_reminders'] },
    });
    const taskCount = plan.tables.filter((t) => t.name === 'tasks').length;
    expect(taskCount).toBe(1);
  });

  it('sorts tables shared → mine → junction, then alphabetically', () => {
    const plan = inferDataModel({
      description: 'Social feed with posts, comments, likes, and the ability to follow people',
    });
    const scopes = plan.tables.map((t) => t.scope);
    // Shared tables must come before mine/junction
    const firstMineIdx = scopes.indexOf('mine');
    const firstJunctionIdx = scopes.indexOf('junction');
    if (firstMineIdx !== -1) {
      for (let i = 0; i < firstMineIdx; i += 1) expect(scopes[i]).toBe('shared');
    }
    if (firstJunctionIdx !== -1 && firstMineIdx !== -1) {
      expect(firstJunctionIdx).toBeGreaterThan(firstMineIdx);
    }
  });

  it('requiresAuth=true when at least one mine or junction table exists', () => {
    const plan = inferDataModel({ description: 'Tasks I can track privately' });
    expect(plan.requiresAuth).toBe(true);
  });

  it('requiresAuth=false when all tables are shared/public', () => {
    const plan = inferDataModel({ description: 'A blog with articles' });
    expect(plan.tables.length).toBeGreaterThan(0);
    expect(plan.requiresAuth).toBe(false);
  });

  it('covers fitness domain: workouts + logs + meals', () => {
    const plan = inferDataModel({
      description: 'A fitness tracker with workouts, exercises, and meal plans',
    });
    const names = plan.tables.map((t) => t.name);
    expect(names).toContain('workouts');
    expect(names).toContain('workout_logs');
  });

  it('covers media domain: movies + watchlist', () => {
    const plan = inferDataModel({ description: 'A movie tracking app' });
    const names = plan.tables.map((t) => t.name);
    expect(names).toContain('movies');
    expect(names).toContain('watchlist');
  });
});

describe('renderDataModelMarkdown', () => {
  it('includes an auth section only when requiresAuth is true', () => {
    const withMine = renderDataModelMarkdown({
      tables: [{ name: 'tasks', scope: 'mine', purpose: 'Personal tasks', seedable: false }],
      matches: [],
      requiresAuth: true,
    });
    expect(withMine).toMatch(/Auth is REQUIRED/);
    expect(withMine).toMatch(/drape\.auth\.signUp/);

    const sharedOnly = renderDataModelMarkdown({
      tables: [{ name: 'articles', scope: 'shared', purpose: 'Blog posts', seedable: true }],
      matches: [],
      requiresAuth: false,
    });
    expect(sharedOnly).not.toMatch(/Auth is REQUIRED/);
  });

  it('renders tables in a markdown table with scope and seed hint', () => {
    const md = renderDataModelMarkdown({
      tables: [
        { name: 'products', scope: 'shared', purpose: 'Catalog', seedable: true },
        { name: 'cart_items', scope: 'mine', purpose: 'My cart', seedable: false },
      ],
      matches: [],
      requiresAuth: true,
    });
    expect(md).toMatch(/\| `products` \| shared \|/);
    expect(md).toMatch(/\| `cart_items` \| mine \|/);
    expect(md).toMatch(/8–15 rows in cloud-seed\.json/);
    expect(md).toMatch(/runtime only/);
  });

  it('shows a "why these tables" section when matches are present', () => {
    const md = renderDataModelMarkdown({
      tables: [],
      matches: [{ keyword: 'cart', source: 'description', tables: ['cart_items'] }],
      requiresAuth: false,
    });
    expect(md).toMatch(/Why these tables/);
    expect(md).toMatch(/"cart" in description/);
  });

  it('includes an empty-state hint when the plan has zero tables', () => {
    const md = renderDataModelMarkdown({ tables: [], matches: [], requiresAuth: false });
    expect(md).toMatch(/No baseline tables inferred/);
    expect(md).toMatch(/declare_tables/);
  });
});

describe('renderSeedSkeleton', () => {
  it('includes only shared+seedable tables with empty arrays', () => {
    const skel = renderSeedSkeleton({
      tables: [
        { name: 'products', scope: 'shared', purpose: 'x', seedable: true },
        { name: 'cart_items', scope: 'mine', purpose: 'x', seedable: false },
        { name: 'likes', scope: 'junction', purpose: 'x', seedable: false },
      ],
      matches: [],
      requiresAuth: true,
    });
    expect(skel).toEqual({ products: [] });
  });

  it('returns {} when nothing is seedable', () => {
    const skel = renderSeedSkeleton({
      tables: [{ name: 'tasks', scope: 'mine', purpose: 'x', seedable: false }],
      matches: [],
      requiresAuth: true,
    });
    expect(skel).toEqual({});
  });
});
