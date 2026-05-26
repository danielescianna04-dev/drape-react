/**
 * URL rewriting and navigation logic for the preview WebView.
 * Extracts the decision-making from onShouldStartLoadWithRequest
 * so it can be tested independently.
 */

/**
 * Result of evaluating a navigation request.
 */
export type NavigationDecision =
  | { allow: true }
  | { allow: false; reason: 'same_url_reload' }
  | { allow: false; reason: 'rewrite'; rewrittenUrl: string };

/**
 * Strip query string from a URL for comparison purposes.
 */
function stripQuery(url: string): string {
  try {
    const p = new URL(url);
    p.search = '';
    return p.toString();
  } catch {
    return url;
  }
}

/**
 * Evaluate whether a navigation request should be allowed, blocked, or rewritten.
 */
export function evaluateNavigation(params: {
  requestUrl: string;
  currentPreviewUrl: string;
  lastLoadedUrl: string;
  initialLoadDone: boolean;
  rewriteCount: number;
  maxRewrites: number;
}): NavigationDecision {
  const { requestUrl, currentPreviewUrl, lastLoadedUrl, initialLoadDone, rewriteCount, maxRewrites } = params;

  let urlHost = '';
  try { urlHost = new URL(requestUrl).hostname; } catch { /* ignore */ }

  // Block same-URL reload (Vite HMR triggers location.reload / history.go(0))
  if (initialLoadDone && stripQuery(requestUrl) === stripQuery(lastLoadedUrl)) {
    return { allow: false, reason: 'same_url_reload' };
  }

  // Subdomain preview (project-xxx.bynot.it) — no rewriting needed
  const isSubdomainPreview = urlHost.endsWith('.bynot.it') &&
    !['www.bynot.it', 'dev.bynot.it', 'api.bynot.it', 'bynot.it'].includes(urlHost);
  if (isSubdomainPreview) return { allow: true };

  // Legacy path-based preview (/preview/{projectId}/) — may need URL rewriting
  const previewBase = currentPreviewUrl.split('?')[0].replace(/\/$/, '');
  const previewPathMatch = previewBase.match(/\/preview\/[^/]+/);
  const previewPath = previewPathMatch ? previewPathMatch[0] : null;

  if (previewPath && (urlHost === 'bynot.it' || urlHost === 'dev.bynot.it') && !requestUrl.includes(previewPath)) {
    const urlObj = new URL(requestUrl);
    const targetPath = urlObj.pathname;

    if (!targetPath.startsWith('/preview/') && !targetPath.startsWith('/_next/') && !targetPath.startsWith('/@')) {
      if (rewriteCount >= maxRewrites) {
        console.warn('[Preview] Max rewrites exceeded, stopping rewrite loop');
        return { allow: true };
      }
      const newUrl = `https://${urlHost}${previewPath}${targetPath}${urlObj.search}`;
      return { allow: false, reason: 'rewrite', rewrittenUrl: newUrl };
    }
  }

  return { allow: true };
}

/**
 * Check if an error message is related to missing environment variables.
 * @deprecated Use `isEnvRelatedError` from `../errors` instead.
 */
export { isEnvRelatedError as isEnvRelatedMessage } from '../errors';

/**
 * Check if a proxy error message is transient (should be silently ignored).
 * @deprecated Use `isTransientProxyError` from `../errors` instead.
 */
export { isTransientProxyError } from '../errors';

/**
 * Check if a JS error message is CSS injection noise that should be filtered.
 */
export function isCssNoiseError(msg: string): boolean {
  return msg.startsWith(':host') ||
    msg.includes('Bootstrap') ||
    msg.includes('reboot') ||
    msg.includes('box-sizing');
}
