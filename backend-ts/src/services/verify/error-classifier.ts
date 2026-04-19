/**
 * Pure classification + normalization helpers for verify errors.
 *
 * No external side effects: everything here takes strings/arrays and returns
 * booleans, strings, or numbers. That keeps it trivially testable and free of
 * dependencies on workspace/docker/ai-provider services.
 */

import { config } from '../../config';
import {
  isLikelyHydrationMismatch,
  isLikelyUserImportResolutionError,
} from '../../utils/install-integrity';
import type { VerifyResult } from './types';

export const CACHE_CORRUPTION_ERROR_REGEX =
  /vendor-chunks|__webpack_modules__.*is not a function|Cannot find module '\.\/\d+\.js'|Loading chunk \d+ failed|ENOENT[^\n]*routes-manifest\.json|ENOENT[^\n]*middleware-manifest\.json/i;

export const STRUCTURAL_FIXABLE_ERROR_REGEX =
  /Module not found|Can't resolve|Cannot find module ['"]@\/|Cannot find module ['"]\.[^'"]+['"]|Element type is invalid|ReferenceError|TypeError|redirect loop|broken button|Server returned HTTP 500|Server error: 500|Cannot read properties of undefined|undefined is not a function|Hydration failed|server rendered HTML didn't match the client|Objects are not valid as a React child|Page is blank|No visible content|blank page/i;

export const EARLY_FAILURE_ERROR_REGEX =
  /Module not found|Can't resolve|Cannot find module|ReferenceError|SyntaxError|TypeError|Failed to compile|error TS\d+|Server returned HTTP 500|Server error: 500|Application error|Unhandled runtime error|Next\.js error overlay|routes-manifest|middleware-manifest|vendor-chunks|Loading chunk|Empty root div|Module resolution error|Hydration failed|server rendered HTML didn't match the client|Objects are not valid as a React child/i;

export const CHEAP_FIX_ONLY_ERROR_REGEX =
  /Module not found|Can't resolve|Cannot find module|error TS\d+|ENOENT|Missing env|Environment variable|npm ERR|pnpm|package\.json|React hook used in server component|['"]use client['"]|Cannot find name/i;

const MAX_VERIFY_FAST_FAILURES_BEFORE_STOP = 4;
const MAX_ESCALATION_ERROR_COUNT = 3;
const PROJECT_FIX_ESCALATION_MAX_IMPACTED_FILES = config.projectVerifyEscalationMaxImpactedFiles;
const PROJECT_FIX_MAX_CONTEXT_CHARS_PER_FILE = config.projectVerifyFixMaxContextCharsPerFile;

export function normalizeVerifyError(error: string): string {
  return error
    .replace(/\[route [^\]]+\]/g, '[route]')
    .replace(/\[nav\]\s*/g, '[nav] ')
    .replace(/\/home\/coder\/project\/[^\s'"]+/g, '<project-file>')
    .replace(/:\d+:\d+/g, ':L:C')
    .replace(/\b\d+\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 180);
}

export function buildErrorCluster(errors: string[]): string[] {
  return [...new Set(errors.map(normalizeVerifyError))].sort();
}

export function hasActionableFastErrors(errors: string[]): boolean {
  return errors.some(error => EARLY_FAILURE_ERROR_REGEX.test(error));
}

export function hasRepeatedFailureCluster(previous: string[] | null, current: string[]): boolean {
  if (!previous || previous.length === 0 || current.length === 0) return false;
  if (previous.length !== current.length) return false;
  return previous.every((value, index) => value === current[index]);
}

export function hasHydrationMismatch(errors: string[]): boolean {
  return errors.some(error => isLikelyHydrationMismatch(error));
}

export function hasUserImportResolutionErrors(errors: string[]): boolean {
  return errors.some(error => isLikelyUserImportResolutionError(error));
}

export function hasOnlyHydrationStyleFailures(errors: string[]): boolean {
  if (!hasHydrationMismatch(errors)) return false;
  return errors.every(error =>
    isLikelyHydrationMismatch(error) ||
    /Application error|Unhandled runtime error|Next\.js error overlay|Empty root div/i.test(error),
  );
}

export function hasReactChildRenderError(errors: string[]): boolean {
  return errors.some(error => /Objects are not valid as a React child/i.test(error));
}

export function hasBlankPageVisibleContentError(errors: string[]): boolean {
  return errors.some(error => /Page is blank|No visible content|blank page/i.test(error));
}

export function shouldEscalateAutoFix(errors: string[]): boolean {
  return (
    errors.some(error => STRUCTURAL_FIXABLE_ERROR_REGEX.test(error)) ||
    hasHydrationMismatch(errors) ||
    hasUserImportResolutionErrors(errors) ||
    hasReactChildRenderError(errors) ||
    hasBlankPageVisibleContentError(errors)
  );
}

export function hasOnlyCheapFixErrors(errors: string[]): boolean {
  return errors.length > 0 && errors.every((error) => CHEAP_FIX_ONLY_ERROR_REGEX.test(error));
}

export function estimateImpactedFiles(errors: string[]): number {
  const impacted = new Set<string>();

  for (const error of errors) {
    const fileMatches = error.matchAll(/([a-zA-Z0-9_./-]+\.(?:tsx?|jsx?|vue|svelte|astro|css))/g);
    for (const match of fileMatches) {
      impacted.add(match[1]);
    }

    const routeMatch = error.match(/\[route (\/[a-zA-Z0-9_/-]*)\]/);
    if (routeMatch?.[1]) {
      impacted.add(`route:${routeMatch[1]}`);
    }

    const pageMatch = error.match(/on page (\/[a-zA-Z0-9_/-]*)/i);
    if (pageMatch?.[1]) {
      impacted.add(`page:${pageMatch[1]}`);
    }
  }

  if (impacted.size === 0 && errors.some((error) => /Module not found|Can't resolve|Cannot find module/i.test(error))) {
    return PROJECT_FIX_ESCALATION_MAX_IMPACTED_FILES + 1;
  }

  return impacted.size;
}

export function isProjectNearlyWorking(result: VerifyResult): boolean {
  const severeErrors = result.errors.filter((error) =>
    /Server not running|Failed to compile|SyntaxError|Server returned HTTP 500|Server error: 500|Application error|Unhandled runtime error|Next\.js error overlay/i.test(error),
  );
  const workingPages = (result.pages || []).filter((page) => (page.errors?.length || 0) === 0).length;
  const hasHealthyHomePage = (result.pages || []).some((page) => page.path === '/' && (page.errors?.length || 0) === 0);
  const successfulNavigation = (result.navigation || []).filter((nav) => !nav.error).length;

  if (result.errors.length === 0) return true;
  if (result.errors.length > MAX_ESCALATION_ERROR_COUNT) return false;
  if (severeErrors.length > 0 && !hasHealthyHomePage && workingPages === 0 && successfulNavigation === 0) return false;

  return hasHealthyHomePage || workingPages > 0 || successfulNavigation > 0 || result.errors.length <= 2;
}

export function shouldStopLostProject(result: VerifyResult, attempt: number, previousAttemptHadFix: boolean): boolean {
  if (attempt === 0 || !previousAttemptHadFix) return false;
  if (hasOnlyHydrationStyleFailures(result.errors)) return false;
  if (!hasActionableFastErrors(result.errors)) return false;
  if (result.errors.length < MAX_VERIFY_FAST_FAILURES_BEFORE_STOP) return false;
  if (isProjectNearlyWorking(result)) return false;
  return true;
}

/**
 * Pull unique target hrefs from "Dead interactive element" errors.
 *
 * The qa-agent formats dead clicks as:
 *   Dead interactive element: link "Progetti" [href=/progetti] on page / — ...
 *
 * We extract the href so the auto-fix can check whether the target route
 * exists and surface that to the model. Only absolute app paths are returned:
 * "#", placeholders ("none", empty), root "/", protocol-relative URLs, and
 * anything with unsafe characters are filtered out.
 */
export function extractDeadLinkHrefs(errors: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const err of errors) {
    if (!err.includes('Dead interactive element')) continue;
    const match = err.match(/\[href=([^\]]+)\]/);
    if (!match) continue;
    const href = match[1].trim();
    if (!href || seen.has(href)) continue;
    if (!href.startsWith('/') || href === '/' || href.startsWith('//')) continue;
    if (!/^\/[a-zA-Z0-9_\-/]+$/.test(href)) continue;
    seen.add(href);
    result.push(href);
  }
  return result;
}

/**
 * Pull destination paths from "[nav] ... → /x/y/z → ..." errors.
 *
 * e2e-check.js and qa-agent.js emit these when clicking a link navigates to
 * a page that's blank or shows an error screen. The destination path is the
 * file we most want to show the auto-fix model — often it's a dynamic route
 * (e.g. /subscriptions/4 → app/subscriptions/[id]/page.tsx) that the default
 * "always read key files" list misses entirely.
 */
export function extractNavDestinationPaths(errors: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const err of errors) {
    if (!err.startsWith('[nav]') && !err.includes('[nav]')) continue;
    // Match "→ /path →" — destination sits between two arrow markers.
    const match = err.match(/→\s+(\/[A-Za-z0-9_\-/]+)\s+→/);
    if (!match) continue;
    const path = match[1].replace(/\/+$/, '') || '/';
    if (path === '/' || seen.has(path)) continue;
    if (!/^\/[A-Za-z0-9_\-/]+$/.test(path)) continue;
    seen.add(path);
    result.push(path);
  }
  return result;
}

/**
 * Pull the visible text label out of broken-button / dead-click errors so the
 * auto-fix can grep for the matching JSX node.
 *
 * Formats:
 * - `[nav] "LABEL" (button) clicked but nothing happened — broken button`
 * - `[nav] "LABEL" → (unknown) → redirect loop back to /`
 * - `Dead interactive element: button "LABEL" [href=...] on page /x — ...`
 *
 * Synthetic labels like `button@370,12` (coordinates emitted when qa-agent
 * fails to read visible text) are skipped — they don't grep to anything.
 */
export function extractBrokenControlLabels(errors: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const err of errors) {
    const isBroken =
      err.includes('broken button') ||
      err.includes('redirect loop') ||
      err.includes('Dead interactive element');
    if (!isBroken) continue;
    const match = err.match(/"([^"]{1,80})"/);
    if (!match) continue;
    const label = match[1].trim();
    if (!label) continue;
    // Skip synthetic "type@x,y" coordinate pseudo-labels
    if (/^[a-z]+@\d+,\d+$/i.test(label)) continue;
    // Skip labels that are pure whitespace / punctuation
    if (!/[A-Za-zÀ-ÿ0-9]/.test(label)) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    result.push(label);
  }
  return result;
}

export function trimErrorForPrompt(error: string): string {
  return error.replace(/\s+/g, ' ').trim().substring(0, 260);
}

export function trimFileContentForPrompt(content: string): string {
  return content.length <= PROJECT_FIX_MAX_CONTEXT_CHARS_PER_FILE
    ? content
    : `${content.slice(0, PROJECT_FIX_MAX_CONTEXT_CHARS_PER_FILE)}\n/* ... truncated for focused auto-fix context ... */`;
}

export function shouldFallbackToQaForSimpleProject(e2e: any): boolean {
  if (!e2e || e2e.passed !== false) return false;
  const errors = Array.isArray(e2e.errors) ? e2e.errors : [];
  if (errors.length === 0) return true;
  return errors.length <= 1 && !errors.some((error: string) =>
    /Module not found|Can't resolve|Cannot find module|ReferenceError|SyntaxError|TypeError|Hydration failed|Page is blank|No visible content|Server returned HTTP 500|Application error/i.test(error),
  );
}

export function extractLogErrors(serverLog: string): string[] {
  const errors: string[] = [];
  const patterns = [
    /(?:Error|ERROR):\s*(.*(?:Cannot find module|Module not found|is not defined|Unexpected token|SyntaxError|TypeError|ReferenceError|Cannot resolve|Can't resolve|Failed to resolve)[^\n]*)/gi,
    /CssSyntaxError[^\n]*/gi,
    /error\s+TS\d+:\s*([^\n]*)/gi,
    /(?:ENOENT):\s*([^\n]*no such file[^\n]*)/gi,
    /Hydration failed[^\n]*/gi,
    /Invalid src prop[^\n]*/gi,
    /Module build failed[^\n]*/gi,
    // Webpack runtime errors — usually caused by stale .next cache or HMR corruption
    /__webpack_modules__\[[^\]]+\] is not a function/g,
    /__webpack_require__\([^)]+\) is not a function/g,
    /Loading chunk \d+ failed[^\n]*/g,
    /ChunkLoadError[^\n]*/g,
    // Next.js specific
    /Cannot find module '\.\/\d+\.js'/g,
    /Cannot find module ['"]?.*vendor-chunks[^\n]*/g,
    /ENOENT[^\n]*routes-manifest\.json/g,
    /ENOENT[^\n]*middleware-manifest\.json/g,
    /next\/dist\/compiled\/[^\s'"]+' not found/g,
    // React runtime errors
    /Warning:\s*(Each child[^\n]*|React has detected[^\n]*)/g,
    /Objects are not valid as a React child[^\n]*/g,
    // Async errors that bubble up via SSE
    /Unhandled Runtime Error[^\n]*/g,
    /unhandledRejection[^\n]*/g,
  ];

  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(serverLog)) !== null) {
      const err = (m[1] || m[0]).trim();
      if (err.length > 10 && !errors.some(e => e.includes(err.substring(0, 40))) && errors.length < 10) {
        errors.push(err);
      }
    }
  }

  return errors;
}
