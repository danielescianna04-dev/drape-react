/**
 * Preview capability detection.
 * Maps project types to their supported preview surface,
 * and provides display metadata for the UI.
 */

// ── Capability type ────────────────────────────────────────────

export type PreviewCapability = 'web' | 'console' | 'unsupported';

// ── Capability sets ────────────────────────────────────────────

const WEB_TYPES = new Set([
  // JS frameworks
  'react', 'nextjs', 'vue', 'nuxt', 'svelte', 'angular',
  'astro', 'remix', 'solid', 'qwik', 'gatsby', 'vite',
  // Server frameworks (web UI)
  'express', 'flask', 'django', 'fastapi', 'laravel',
  'rails', 'sinatra', 'phoenix',
  // Other runtimes with HTTP
  'go', 'rust', 'spring', 'dotnet', 'swift', 'kotlin',
  'deno', 'bun', 'node',
  // Static
  'html', 'static',
]);

const CONSOLE_TYPES = new Set([
  'python-console', 'javascript-console',
  'c-lang', 'cpp', 'cmake', 'make',
  'java',
]);

const UNSUPPORTED_TYPES = new Set([
  'expo', 'flutter', 'react-native',
]);

// ── Capability detection ───────────────────────────────────────

export function getPreviewCapability(projectType: string): PreviewCapability {
  const normalized = (projectType || '').toLowerCase().trim();

  if (!normalized || normalized === 'unknown' || normalized === 'detecting') {
    // Default to web for unknown — the server will sort it out
    return 'web';
  }

  if (UNSUPPORTED_TYPES.has(normalized)) return 'unsupported';
  if (WEB_TYPES.has(normalized)) return 'web';
  if (CONSOLE_TYPES.has(normalized)) return 'console';

  // Check partial matches (e.g. "react-native" contains "react" but also "native")
  if (normalized.includes('expo') || normalized.includes('flutter') || normalized.includes('native')) {
    return 'unsupported';
  }

  // Fallback: try web for anything web-ish
  for (const webType of WEB_TYPES) {
    if (normalized.includes(webType)) return 'web';
  }

  return 'web';
}

// ── Display info ───────────────────────────────────────────────

export interface PreviewDisplayInfo {
  icon: string;
  color: string;
  label: string;
}

const DISPLAY_MAP: Record<string, PreviewDisplayInfo> = {
  // JS frameworks
  react:    { icon: 'logo-react',      color: '#61DAFB', label: 'React' },
  nextjs:   { icon: 'logo-vercel',     color: '#FFFFFF', label: 'Next.js' },
  vue:      { icon: 'logo-vue',        color: '#42B883', label: 'Vue' },
  nuxt:     { icon: 'logo-vue',        color: '#00DC82', label: 'Nuxt' },
  svelte:   { icon: 'flame-outline',   color: '#FF3E00', label: 'Svelte' },
  angular:  { icon: 'logo-angular',    color: '#DD0031', label: 'Angular' },
  astro:    { icon: 'planet-outline',  color: '#FF5D01', label: 'Astro' },
  remix:    { icon: 'shuffle-outline', color: '#3992FF', label: 'Remix' },
  solid:    { icon: 'cube-outline',    color: '#2C4F7C', label: 'SolidJS' },
  qwik:     { icon: 'flash-outline',   color: '#AC7EF4', label: 'Qwik' },
  gatsby:   { icon: 'planet-outline',  color: '#663399', label: 'Gatsby' },
  vite:     { icon: 'flash-outline',   color: '#646CFF', label: 'Vite' },

  // Server frameworks
  express:  { icon: 'server-outline',  color: '#68A063', label: 'Express' },
  flask:    { icon: 'flask-outline',   color: '#FFFFFF', label: 'Flask' },
  django:   { icon: 'server-outline',  color: '#092E20', label: 'Django' },
  fastapi:  { icon: 'flash-outline',   color: '#009688', label: 'FastAPI' },
  laravel:  { icon: 'server-outline',  color: '#FF2D20', label: 'Laravel' },
  rails:    { icon: 'train-outline',   color: '#CC0000', label: 'Rails' },
  sinatra:  { icon: 'musical-note',    color: '#CC0000', label: 'Sinatra' },
  phoenix:  { icon: 'flame-outline',   color: '#FD4F00', label: 'Phoenix' },

  // Other runtimes
  go:       { icon: 'code-slash',      color: '#00ADD8', label: 'Go' },
  rust:     { icon: 'hardware-chip',   color: '#DEA584', label: 'Rust' },
  spring:   { icon: 'leaf-outline',    color: '#6DB33F', label: 'Spring Boot' },
  dotnet:   { icon: 'code-slash',      color: '#512BD4', label: '.NET' },
  swift:    { icon: 'logo-apple',      color: '#F05138', label: 'Swift' },
  kotlin:   { icon: 'code-slash',      color: '#7F52FF', label: 'Kotlin' },
  deno:     { icon: 'code-slash',      color: '#FFFFFF', label: 'Deno' },
  bun:      { icon: 'flash-outline',   color: '#FBF0DF', label: 'Bun' },
  node:     { icon: 'logo-nodejs',     color: '#68A063', label: 'Node.js' },

  // Static / console
  html:     { icon: 'logo-html5',      color: '#E34F26', label: 'HTML' },
  static:   { icon: 'document-outline', color: '#E34F26', label: 'Static Site' },
  cmake:    { icon: 'terminal-outline', color: '#064F8C', label: 'C/C++ (CMake)' },
  make:     { icon: 'terminal-outline', color: '#6D6E71', label: 'C/C++ (Make)' },

  // Mobile (unsupported)
  'react-native': { icon: 'phone-portrait-outline', color: '#61DAFB', label: 'React Native' },
  expo:     { icon: 'phone-portrait-outline', color: '#000020', label: 'Expo' },
  flutter:  { icon: 'phone-portrait-outline', color: '#02569B', label: 'Flutter' },
};

const DEFAULT_DISPLAY: PreviewDisplayInfo = {
  icon: 'globe-outline',
  color: '#8B949E',
  label: 'Project',
};

export function getPreviewDisplayInfo(projectType: string): PreviewDisplayInfo {
  const normalized = (projectType || '').toLowerCase().trim();
  return DISPLAY_MAP[normalized] ?? DEFAULT_DISPLAY;
}
