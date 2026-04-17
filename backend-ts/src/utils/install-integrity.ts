import type { ProjectType } from '../types';

export interface FrameworkIntegritySpec {
  label: string;
  files: string[];
  resolves: string[];
}

const NEXTJS_DEPENDENCY_CORRUPTION_REGEX = /next\/dist\/pages\/_error|next-client-pages-loader|shared\/lib\/constants|postcss\/lib\/postcss\.js|node_modules\/next\/node_modules\/postcss|native binary integrity check failed|truncated:node_modules|dependency install looks corrupted|reinstallare le dipendenze|reinstall dependencies/i;
const USER_IMPORT_RESOLUTION_REGEX = /(?:Module not found|Can't resolve|Cannot find module)[^\n]*['"](?:@\/|~\/|\.\.?\/(?!shared\/lib\/constants|next\/dist\/pages\/_error))[^'"]+['"]/i;
const HYDRATION_MISMATCH_REGEX = /hydration failed|server rendered html didn't match the client|text content does not match server-rendered html|there was an error while hydrating|hydration mismatch/i;

export function isLikelyDependencyCorruption(
  message: string | null | undefined,
  projectType?: ProjectType | string,
): boolean {
  const normalized = String(message || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return false;

  if (projectType === 'nextjs') {
    return NEXTJS_DEPENDENCY_CORRUPTION_REGEX.test(normalized);
  }

  return /node_modules\/[^/\s]+\/.+Cannot find module|postcss\/lib\/postcss\.js|native binary integrity check failed|truncated:node_modules|reinstallare le dipendenze|reinstall dependencies/i.test(normalized);
}

export function isLikelyUserImportResolutionError(message: string | null | undefined): boolean {
  const normalized = String(message || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (isLikelyDependencyCorruption(normalized, 'nextjs')) return false;
  return USER_IMPORT_RESOLUTION_REGEX.test(normalized);
}

export function isLikelyHydrationMismatch(message: string | null | undefined): boolean {
  const normalized = String(message || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  return HYDRATION_MISMATCH_REGEX.test(normalized);
}

export function convertInstallCommandToNpm(command?: string | null): string {
  const source = (command || 'npm install').trim() || 'npm install';
  return source
    .replace(/\bbun\s+install\b/g, 'npm install')
    .replace(/\s+--frozen-lockfile\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function getFrameworkIntegritySpec(
  projectType?: ProjectType | string,
): FrameworkIntegritySpec | null {
  switch (projectType) {
    case 'nextjs':
      return {
        label: 'Next.js framework runtime',
        files: [
          'node_modules/next/package.json',
          'node_modules/next/dist/pages/_error.js',
          'node_modules/next/dist/pages/_document.js',
          'node_modules/next/dist/shared/lib/constants.js',
          'node_modules/next/dist/server/dev/on-demand-entry-handler.js',
          'node_modules/next/dist/build/webpack/loaders/next-client-pages-loader.js',
          'node_modules/postcss/package.json',
          'node_modules/postcss/lib/postcss.js',
        ],
        resolves: [
          'next/package.json',
          'postcss/package.json',
        ],
      };
    default:
      return null;
  }
}
