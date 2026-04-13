/**
 * previewEnvVarExtractor — centralized env-var extraction from error messages.
 *
 * Consolidates ALL env-var extraction regex previously in:
 * - usePreviewPreflight (extractMissingEnvVars, applyMissingEnvVarsFromMessage)
 * - usePreviewHealth (via preflight.applyMissingEnvVarsFromMessage)
 * - previewWebViewBridge (isEnvRelatedMessage regex for NEXT_PUBLIC_ etc.)
 * - PreviewServerStatus (display logic)
 */

// ── Blacklist: common uppercase tokens that are NOT env vars ───

const KEYWORD_BLACKLIST = new Set([
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS',
  'HTTP', 'HTTPS', 'HTML', 'JSON', 'XML',
  'ERROR', 'WARNING', 'NULL', 'TRUE', 'FALSE', 'UNDEFINED', 'NAN',
]);

// ── Public API ─────────────────────────────────────────────────

/**
 * Extract env-var names from a raw error/log string.
 *
 * Strategies (in order of specificity):
 * 1. Bullet-list items  — `• DATABASE_URL` or `- DATABASE_URL`
 * 2. T3-style lines     — `DATABASE_URL: ['Required']`
 * 3. Inline uppercase    — any `UPPER_CASE_NAME` that isn't a common keyword
 *
 * Returns at most 20 unique keys.
 *
 * Replaces `extractMissingEnvVars` from usePreviewPreflight.
 */
export function extractMissingEnvVars(input: string): string[] {
  if (!input) return [];

  const vars = new Set<string>();

  // 1. Bullet-list items (• or -)
  const bulletMatches = input.matchAll(/[•\-]\s*([A-Z][A-Z0-9_]{2,})/g);
  for (const m of bulletMatches) vars.add(m[1]);

  // 2. T3 / Zod-style — `KEY: ['Required']`
  const t3Style = input.matchAll(/^\s*([A-Z][A-Z0-9_]{2,})\s*:\s*\[\s*'Required'\s*\]/gm);
  for (const m of t3Style) vars.add(m[1]);

  // 3. Generic inline uppercase tokens
  const inline = input.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g);
  for (const m of inline) {
    if (!KEYWORD_BLACKLIST.has(m[1])) {
      vars.add(m[1]);
    }
  }

  return [...vars].slice(0, 20);
}

/**
 * Extract env-var names with extra metadata (required flag, optional description).
 *
 * Extends `extractMissingEnvVars` with richer output for UI display.
 */
export function extractEnvVarDetails(
  raw: string,
): Array<{ key: string; required: boolean; description?: string }> {
  const keys = extractMissingEnvVars(raw);

  // Heuristic: if a key was in a bullet/T3 line that also contains
  // "required" or "Required", mark it required; otherwise assume required.
  const lower = raw.toLowerCase();
  return keys.map((key) => {
    // Try to find any description text after the key (e.g. "DATABASE_URL — connection string")
    const descRe = new RegExp(`${key}\\s*[:\\-—]+\\s*(.+?)(?:\\n|$)`, 'i');
    const descMatch = raw.match(descRe);
    const description = descMatch?.[1]?.trim();

    // If the message explicitly marks something optional, respect that
    const optionalRe = new RegExp(`${key}.*optional`, 'i');
    const required = !optionalRe.test(lower);

    return { key, required, description };
  });
}
