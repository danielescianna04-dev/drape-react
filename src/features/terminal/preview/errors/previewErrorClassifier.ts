/**
 * previewErrorClassifier — centralized error detection and classification.
 *
 * Consolidates ALL error-matching heuristics that were previously
 * scattered across usePreviewHealth, usePreviewStartupFlow,
 * usePreviewRecovery, usePreviewPreflight, and previewWebViewBridge.
 */
import type { PreviewError, PreviewErrorKind } from '../previewMachine.types';

// ── Regex / keyword banks ──────────────────────────────────────

/** Env-var related error indicators (from preflight + bridge) */
const ENV_KEYWORDS = [
  'missing value',
  'apikey',
  'api key',
  'api_key',
  'environment variable',
  'env variable',
  'not defined',
  'is not set',
  'is undefined',
  'process.env',
  'invalid environment variables',
];
const ENV_PREFIX_RE = /\b(NEXT_PUBLIC_|REACT_APP_|VITE_|NUXT_)\w+/;

/** Build failure indicators (from preflight extractStartupErrorFromBody + recovery) */
const BUILD_KEYWORDS = [
  'cannot find module',
  'module_not_found',
  'failed to compile',
  'syntaxerror',
  'webpack',
  'module not found',
  '× error',
];

/** Runtime failure indicators */
const RUNTIME_KEYWORDS = [
  'uncaught exception',
  'unhandled promise rejection',
  'unhandledrejection',
  'runtime error',
  'referenceerror',
  'typeerror',
];

/** Server unreachable indicators (from health + bridge) */
const UNREACHABLE_KEYWORDS = [
  'econnrefused',
  'connection refused',
  'timeout',
  'network error',
  'aborterror',
];
const UNREACHABLE_STATUS_RE = /\b(502|503|504)\b/;

/** Session expired indicators (from recovery + health) */
const SESSION_EXPIRED_KEYWORDS = [
  'no active session',
  'session expired',
  'token expired',
  'machine stopped',
];
const SESSION_EXPIRED_STATUS_RE = /\b403\b/;

/** Missing preview token (from health + startupFlow + recovery) */
const MISSING_TOKEN_KEYWORDS = [
  'preview access token required',
  'preview token required',
  'missing preview token',
];

/** Transient proxy errors (from health + bridge) */
const TRANSIENT_PROXY_KEYWORDS = [
  'endpoint not found',
  'econnrefused',
  'too many requests',
  '429',
];

// ── Helpers ────────────────────────────────────────────────────

function lowerIncludes(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Classify a raw error string into a structured PreviewError.
 *
 * @param raw     The raw error text (log line, HTTP body, proxy message, etc.)
 * @param source  Where the error was observed
 */
export function classifyPreviewError(
  raw: string,
  source: 'health' | 'webview' | 'logs' | 'startup',
): PreviewError {
  const lower = raw.toLowerCase();

  // 1. Missing token — highest priority, always fatal-reset
  if (lowerIncludes(raw, MISSING_TOKEN_KEYWORDS)) {
    return { kind: 'missing_token', message: raw, recoverable: false, raw };
  }

  // 2. Session expired
  if (lowerIncludes(raw, SESSION_EXPIRED_KEYWORDS) || SESSION_EXPIRED_STATUS_RE.test(raw)) {
    return { kind: 'session_expired', message: raw, recoverable: false, raw };
  }

  // 3. Transient proxy — always recoverable (auto-retry)
  if (lowerIncludes(raw, TRANSIENT_PROXY_KEYWORDS)) {
    return { kind: 'transient_proxy', message: raw, recoverable: true, raw };
  }

  // 4. Missing env vars
  if (lowerIncludes(raw, ENV_KEYWORDS) || ENV_PREFIX_RE.test(raw)) {
    return { kind: 'missing_env', message: raw, recoverable: true, raw };
  }

  // 5. Build failure
  if (lowerIncludes(raw, BUILD_KEYWORDS)) {
    return { kind: 'build_failure', message: raw, recoverable: true, raw };
  }

  // 6. Server unreachable
  if (lowerIncludes(raw, UNREACHABLE_KEYWORDS) || UNREACHABLE_STATUS_RE.test(raw)) {
    return { kind: 'server_unreachable', message: raw, recoverable: true, raw };
  }

  // 7. Runtime failure
  if (lowerIncludes(raw, RUNTIME_KEYWORDS)) {
    return { kind: 'runtime_failure', message: raw, recoverable: true, raw };
  }

  // 8. Unknown
  return { kind: 'unknown', message: raw, recoverable: source !== 'startup', raw };
}

/**
 * Quick check: is this a transient error that should be silently retried?
 * Unifies the checks from usePreviewHealth (proxy-side) and previewWebViewBridge.
 */
export function isTransientPreviewError(raw: string): boolean {
  return lowerIncludes(raw, TRANSIENT_PROXY_KEYWORDS);
}

/**
 * Can the user recover from this error (retry / fix env vars)?
 */
export function isRecoverableError(error: PreviewError): boolean {
  return error.recoverable;
}

/**
 * Check if a raw message indicates a missing preview token.
 * Replaces the `isMissingPreviewTokenError` helper duplicated in
 * usePreviewHealth, usePreviewStartupFlow, and usePreviewRecovery.
 */
export function isMissingPreviewTokenError(message?: string | null): boolean {
  return lowerIncludes((message || ''), MISSING_TOKEN_KEYWORDS);
}

/**
 * Check if a message is env-related.
 * Replaces `isEnvRelatedError` in usePreviewPreflight and
 * `isEnvRelatedMessage` in previewWebViewBridge.
 */
export function isEnvRelatedError(msg: string): boolean {
  if (!msg) return false;
  return lowerIncludes(msg, ENV_KEYWORDS) || ENV_PREFIX_RE.test(msg);
}

/**
 * Check if a proxy error is transient (should be silently ignored/retried).
 * Replaces `isTransientProxyError` in previewWebViewBridge.
 */
export function isTransientProxyError(msg: string): boolean {
  return lowerIncludes(msg, TRANSIENT_PROXY_KEYWORDS);
}

/**
 * Detect critical errors in terminal output lines.
 * Consolidates the pattern from usePreviewRecovery's terminal-output effect.
 */
export function detectCriticalTerminalErrors(recentLines: string[]): string[] {
  return recentLines.filter((line) => {
    const lower = line.toLowerCase();
    return (
      lower.includes('error:') ||
      lower.includes('× error') ||
      lower.includes('failed to compile')
    ) && !lower.includes('[error]');
  });
}

/**
 * Extract a structured startup error from an HTTP response body.
 * Consolidates `extractStartupErrorFromBody` from usePreviewPreflight.
 */
export function extractStartupErrorFromBody(bodyText: string): PreviewErrorKind | null {
  if (!bodyText) return null;
  const lower = bodyText.toLowerCase();
  if (
    lower.includes('invalid environment variables') ||
    lower.includes('environment variable') ||
    lower.includes('not set')
  ) {
    return 'missing_env';
  }
  if (lower.includes('cannot find module') || lower.includes('module_not_found')) {
    return 'build_failure';
  }
  if (lower.includes('failed to compile') || lower.includes('syntaxerror')) {
    return 'build_failure';
  }
  return null;
}
