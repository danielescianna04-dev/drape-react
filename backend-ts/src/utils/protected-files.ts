/**
 * Single source of truth for files the AI must not overwrite.
 *
 * Two distinct sets because there are two distinct guard points:
 *
 * - CONFIG: root project configuration (secrets, build pipeline, package manifest).
 *   Enforced by the verify/auto-fix layer and qa-agent. These are owned by the
 *   backend install pipeline — if deps are broken, fix package.json and let the
 *   backend re-run the install. The AI must not touch these during auto-fix.
 *
 * - TEMPLATE: stack scaffolding that ships with every template (CSS plumbing,
 *   layouts, entrypoints). Enforced by the write_file tool during initial
 *   generation so the AI doesn't regenerate files that already exist in the
 *   boilerplate. CSS files ARE repairable at verify time and are therefore NOT
 *   in the CONFIG set.
 *
 * NOTE: qa-agent.js lives in the container and cannot import from TS. It
 * duplicates the CONFIG list — keep it in sync manually.
 */

export const PROTECTED_CONFIG_FILES: ReadonlySet<string> = new Set([
  'package.json', 'tsconfig.json',
  'next.config.ts', 'next.config.js', 'next.config.mjs',
  'astro.config.mjs',
  'vite.config.ts', 'vite.config.js',
  'index.html',
]);

export const PROTECTED_TEMPLATE_FILES: ReadonlySet<string> = new Set([
  // Root config (package.json is omitted — write_file merges it instead of blocking)
  'tsconfig.json',
  'next.config.ts', 'next.config.js', 'next.config.mjs',
  'astro.config.mjs',
  'vite.config.ts', 'vite.config.js',
  'index.html',
  // Template scaffolding
  'postcss.config.mjs', 'postcss.config.js',
  'tailwind.config.ts', 'tailwind.config.js',
  'src/main.tsx', 'src/main.ts',
  'src/index.css', 'src/style.css',
  'app/globals.css', 'app/layout.tsx', 'app/_layout.tsx',
  'src/lib/utils.ts', 'app/lib/utils.ts',
]);
