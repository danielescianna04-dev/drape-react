/**
 * Project technology resolution.
 *
 * The project-detector (`project-detector.service.ts`) labels projects with
 * runtime-oriented names ("static", "vite", "unknown"). The prompt + auto-fix
 * system uses template-oriented names ("html", "react", "nextjs", etc.). The
 * authoritative intent lives in `.drape/creation-input.json` — that's what the
 * user picked in the UI when creating the project.
 *
 * This module bridges the two:
 * - `normalizeTechnology`       maps detector aliases to prompt-system names
 * - `readCreationInputTechnology` pulls the user-selected tech out of the
 *                                 creation input file (if present)
 * - `getKeyFilesForTechnology`  returns the entry/layout files the auto-fix
 *                                 orchestrator should ALWAYS surface to the
 *                                 model when repairing blank/broken pages
 */

import { fileService } from './file.service';

/** Canonical tech labels used by the prompt + auto-fix system. */
export type ProjectTechnology =
  | 'react'
  | 'nextjs'
  | 'vue'
  | 'astro'
  | 'html'
  | 'expo'
  | 'svelte'
  | 'remix'
  | 'angular'
  | 'nuxt'
  | 'solid';

const KNOWN_TECHS = new Set<ProjectTechnology>([
  'react',
  'nextjs',
  'vue',
  'astro',
  'html',
  'expo',
  'svelte',
  'remix',
  'angular',
  'nuxt',
  'solid',
]);

/**
 * Map detector output or user input to the canonical tech name.
 * Returns null when the input has no meaningful mapping — callers should fall
 * back to their own default in that case rather than invent one here.
 */
export function normalizeTechnology(raw: string | null | undefined): ProjectTechnology | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (KNOWN_TECHS.has(v as ProjectTechnology)) return v as ProjectTechnology;
  if (v === 'static') return 'html';
  if (v === 'vite') return 'react';
  if (v === 'react-cloud') return 'react';
  if (v === 'nextjs-cloud' || v === 'next' || v === 'next.js') return 'nextjs';
  if (v === 'vue-cloud') return 'vue';
  if (v === 'astro-cloud') return 'astro';
  if (v === 'html-cloud') return 'html';
  return null;
}

/**
 * Read the authoritative technology from `.drape/creation-input.json`.
 * Returns null when the file is missing, malformed, or has no recognised tech.
 */
export async function readCreationInputTechnology(projectId: string): Promise<ProjectTechnology | null> {
  try {
    const read = await fileService.readFile(projectId, '.drape/creation-input.json');
    if (!read.success || !read.data?.content) return null;
    const parsed = JSON.parse(read.data.content);
    return normalizeTechnology(typeof parsed?.technology === 'string' ? parsed.technology : null);
  } catch {
    return null;
  }
}

/**
 * Read creation intent (description + structured answers) so the auto-fix
 * model knows what the user originally asked for. Used for blank/minimal
 * content failures where the verify error alone doesn't describe the goal.
 */
export async function readCreationInputIntent(projectId: string): Promise<{
  description: string;
  structuredAnswers: Record<string, unknown> | null;
}> {
  try {
    const read = await fileService.readFile(projectId, '.drape/creation-input.json');
    if (!read.success || !read.data?.content) return { description: '', structuredAnswers: null };
    const parsed = JSON.parse(read.data.content);
    return {
      description: typeof parsed?.description === 'string' ? parsed.description : '',
      structuredAnswers:
        parsed?.structuredAnswers && typeof parsed.structuredAnswers === 'object'
          ? (parsed.structuredAnswers as Record<string, unknown>)
          : null,
    };
  } catch {
    return { description: '', structuredAnswers: null };
  }
}

/**
 * Resolve the canonical technology for a project. Tries creation-input first
 * (user intent), falls back to the detector-derived label, finally `fallback`.
 */
export async function resolveProjectTechnology(
  projectId: string,
  detectorLabel: string | null | undefined,
  fallback: ProjectTechnology = 'nextjs',
): Promise<ProjectTechnology> {
  const fromInput = await readCreationInputTechnology(projectId);
  if (fromInput) return fromInput;
  const fromDetector = normalizeTechnology(detectorLabel);
  if (fromDetector) return fromDetector;
  return fallback;
}

/**
 * Files that the auto-fix orchestrator ALWAYS surfaces to the AI when
 * diagnosing blank pages / minimal content / broken layouts.
 *
 * Served-at-runtime files FIRST: for vanilla HTML, `index.html` is what the
 * browser actually renders — fixing `app/page.tsx` (a React file the HTML
 * runtime doesn't know about) is a wasted attempt.
 */
export function getKeyFilesForTechnology(tech: ProjectTechnology): string[] {
  switch (tech) {
    case 'html':
      return ['index.html', 'script.js', 'style.css', 'blocks.js'];
    case 'react':
      return [
        'src/App.tsx',
        'src/main.tsx',
        'src/index.css',
        'src/pages/Index.tsx',
        'src/pages/Home.tsx',
      ];
    case 'nextjs':
      return ['app/page.tsx', 'app/layout.tsx', 'app/globals.css'];
    case 'vue':
      return ['src/App.vue', 'src/main.ts', 'src/style.css'];
    case 'astro':
      return [
        'src/pages/index.astro',
        'src/layouts/Layout.astro',
        'src/styles/global.css',
      ];
    case 'expo':
      return [
        'app/_layout.tsx',
        'app/index.tsx',
        'app/(tabs)/_layout.tsx',
        'app/(tabs)/index.tsx',
      ];
    case 'svelte':
      return ['src/App.svelte', 'src/main.ts', 'src/app.css'];
    case 'remix':
      return ['app/root.tsx', 'app/routes/_index.tsx', 'app/tailwind.css'];
    case 'nuxt':
      return ['app.vue', 'pages/index.vue', 'assets/css/main.css'];
    case 'angular':
      return [
        'src/app/app.component.ts',
        'src/app/app.component.html',
        'src/styles.css',
      ];
    case 'solid':
      return ['src/App.tsx', 'src/index.tsx', 'src/index.css'];
  }
}
