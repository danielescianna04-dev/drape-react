/**
 * Navigation state and URL helpers for the preview WebView.
 *
 * Pure functions — no React, no side effects.
 * Understands both subdomain previews (project-xxx.drape.info)
 * and legacy path-based previews (/preview/{id}/...).
 */

// ── Types ──────────────────────────────────────────────────────

export interface PreviewNavigationState {
  /** The base preview URL (what the server originally provided). */
  canonicalUrl: string;
  /** Where the WebView currently is. */
  currentUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
  /** True when the preview lives on a project-specific subdomain. */
  isSubdomainPreview: boolean;
}

// ── Internal helpers ───────────────────────────────────────────

const PLATFORM_HOSTS = new Set([
  'www.drape.info',
  'dev.drape.info',
  'api.drape.info',
  'drape.info',
]);

function tryParseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function isSubdomain(hostname: string): boolean {
  return hostname.endsWith('.drape.info') && !PLATFORM_HOSTS.has(hostname);
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Normalise a preview URL by stripping trailing slashes and
 * query strings so comparisons are stable.
 */
export function normalizePreviewUrl(url: string, basePreviewUrl: string): string {
  const parsed = tryParseUrl(url);
  if (!parsed) return url;

  const base = tryParseUrl(basePreviewUrl);
  if (!base) return url;

  // For subdomain previews, just strip the query
  if (isSubdomain(parsed.hostname)) {
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  }

  // For path-based previews, ensure the /preview/{id} prefix is present
  const previewPathMatch = base.pathname.match(/^(\/preview\/[^/]+)/);
  if (previewPathMatch) {
    const prefix = previewPathMatch[1];
    if (!parsed.pathname.startsWith(prefix)) {
      parsed.pathname = prefix + parsed.pathname;
    }
  }

  parsed.search = '';
  return parsed.toString().replace(/\/$/, '');
}

/**
 * Detect whether the WebView is attempting a path-based navigation
 * that needs a URL rewrite (e.g. navigating to "/" instead of
 * "/preview/{id}/").
 */
export function isPreviewUrlRewrite(requestUrl: string, previewUrl: string): boolean {
  const req = tryParseUrl(requestUrl);
  const base = tryParseUrl(previewUrl);
  if (!req || !base) return false;

  // Subdomain previews never need rewriting
  if (isSubdomain(req.hostname)) return false;

  const previewPathMatch = base.pathname.match(/^(\/preview\/[^/]+)/);
  if (!previewPathMatch) return false;

  const prefix = previewPathMatch[1];

  // It's a rewrite if the request URL is on the same host but
  // doesn't include the /preview/{id} prefix.
  return (
    req.hostname === base.hostname &&
    !req.pathname.startsWith(prefix) &&
    !req.pathname.startsWith('/_next/') &&
    !req.pathname.startsWith('/@')
  );
}

/**
 * Build a fully typed navigation state from raw WebView signals.
 */
export function buildPreviewNavigationState(
  baseUrl: string,
  currentUrl: string,
  canGoBack: boolean,
  canGoForward: boolean,
): PreviewNavigationState {
  const parsed = tryParseUrl(baseUrl);
  const isSubdomainPreview = parsed ? isSubdomain(parsed.hostname) : false;

  return {
    canonicalUrl: baseUrl,
    currentUrl,
    canGoBack,
    canGoForward,
    isSubdomainPreview,
  };
}
