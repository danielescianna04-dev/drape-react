import { describe, expect, it } from 'vitest';
import {
  getKeyFilesForTechnology,
  normalizeTechnology,
} from '../../../backend-ts/src/services/project-technology';

describe('normalizeTechnology', () => {
  it('passes through canonical names', () => {
    for (const t of ['react', 'nextjs', 'vue', 'astro', 'html', 'expo', 'svelte', 'remix', 'angular', 'nuxt', 'solid'] as const) {
      expect(normalizeTechnology(t)).toBe(t);
    }
  });

  it('maps detector "static" to canonical "html"', () => {
    expect(normalizeTechnology('static')).toBe('html');
  });

  it('maps detector "vite" to "react"', () => {
    expect(normalizeTechnology('vite')).toBe('react');
  });

  it('maps cloud template variants to their base tech', () => {
    expect(normalizeTechnology('react-cloud')).toBe('react');
    expect(normalizeTechnology('nextjs-cloud')).toBe('nextjs');
    expect(normalizeTechnology('vue-cloud')).toBe('vue');
    expect(normalizeTechnology('astro-cloud')).toBe('astro');
    expect(normalizeTechnology('html-cloud')).toBe('html');
  });

  it('maps common nextjs aliases', () => {
    expect(normalizeTechnology('next')).toBe('nextjs');
    expect(normalizeTechnology('next.js')).toBe('nextjs');
    expect(normalizeTechnology('Next.js')).toBe('nextjs');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(normalizeTechnology('  HTML  ')).toBe('html');
    expect(normalizeTechnology('NextJS')).toBe('nextjs');
  });

  it('returns null for unknown/empty/nullish inputs so callers can fall back', () => {
    expect(normalizeTechnology(null)).toBeNull();
    expect(normalizeTechnology(undefined)).toBeNull();
    expect(normalizeTechnology('')).toBeNull();
    expect(normalizeTechnology('unknown')).toBeNull();
    expect(normalizeTechnology('random-framework')).toBeNull();
  });
});

describe('getKeyFilesForTechnology', () => {
  it('lists runtime-served files first for html projects', () => {
    // The home screen in a vanilla HTML template is literally index.html —
    // that MUST be the first file the orchestrator surfaces to the model,
    // otherwise the fix will target React files that the runtime ignores.
    const files = getKeyFilesForTechnology('html');
    expect(files[0]).toBe('index.html');
    expect(files).toContain('script.js');
    expect(files).toContain('style.css');
    expect(files).not.toContain('app/page.tsx');
    expect(files).not.toContain('src/App.tsx');
  });

  it('lists app-router entry files for nextjs', () => {
    const files = getKeyFilesForTechnology('nextjs');
    expect(files).toContain('app/page.tsx');
    expect(files).toContain('app/layout.tsx');
    expect(files).not.toContain('index.html');
  });

  it('lists Vite entry files for react', () => {
    const files = getKeyFilesForTechnology('react');
    expect(files).toContain('src/App.tsx');
    expect(files).toContain('src/main.tsx');
    expect(files).not.toContain('app/page.tsx');
  });

  it('lists .vue files for vue', () => {
    const files = getKeyFilesForTechnology('vue');
    expect(files).toContain('src/App.vue');
    expect(files).toContain('src/main.ts');
  });

  it('lists expo-router files for expo', () => {
    const files = getKeyFilesForTechnology('expo');
    expect(files).toContain('app/_layout.tsx');
    expect(files).toContain('app/(tabs)/_layout.tsx');
  });

  it('returns a non-empty list for every supported technology', () => {
    for (const t of ['react', 'nextjs', 'vue', 'astro', 'html', 'expo', 'svelte', 'remix', 'angular', 'nuxt', 'solid'] as const) {
      const files = getKeyFilesForTechnology(t);
      expect(files.length).toBeGreaterThan(0);
      expect(files.every((f) => typeof f === 'string' && f.length > 0)).toBe(true);
    }
  });
});
