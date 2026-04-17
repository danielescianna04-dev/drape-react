const USD_TO_EUR = 0.92;

/**
 * AI model pricing per million tokens (USD), including prompt-cache tiers.
 *
 * - input:        regular non-cached input
 * - output:       output / completion
 * - cachedInput:  cache-read input (discounted, typically 10% of input for Anthropic)
 * - cachedWrite:  cache-write input (surcharge, typically 1.25× input for Anthropic;
 *                 equal to input for providers without a write surcharge)
 *
 * Keep the three Claude entries (4-7, 4-6 aliases) in sync — they resolve to the same
 * upstream model. Opus pricing matches Anthropic's public list for Claude Opus 4 / 4.5 / 4.7.
 */
export const AI_PRICING: Record<string, { input: number; output: number; cachedInput: number; cachedWrite: number }> = {
  'gemini-2.5-flash':        { input: 0.15, output: 0.60,  cachedInput: 0.0375, cachedWrite: 0.15 },
  'gemini-3-flash':          { input: 0.50, output: 3.00,  cachedInput: 0.125,  cachedWrite: 0.50 },
  'gemini-3.1-pro':          { input: 1.25, output: 10.00, cachedInput: 0.3125, cachedWrite: 1.25 },
  'claude-sonnet-4':         { input: 3.00, output: 15.00, cachedInput: 0.30,   cachedWrite: 3.75 },
  'claude-4-6-sonnet':       { input: 3.00, output: 15.00, cachedInput: 0.30,   cachedWrite: 3.75 },
  'claude-3.5-sonnet':       { input: 3.00, output: 15.00, cachedInput: 0.30,   cachedWrite: 3.75 },
  'claude-4-7-opus':         { input: 15.00, output: 75.00, cachedInput: 1.50,  cachedWrite: 18.75 },
  'claude-opus-4-7':         { input: 15.00, output: 75.00, cachedInput: 1.50,  cachedWrite: 18.75 },
  'claude-4-6-opus':         { input: 15.00, output: 75.00, cachedInput: 1.50,  cachedWrite: 18.75 },
  'claude-3.5-haiku':        { input: 0.80, output: 4.00,  cachedInput: 0.08,   cachedWrite: 1.00 },
  'gpt-5-4':                 { input: 4.00, output: 16.00, cachedInput: 1.00,   cachedWrite: 4.00 },
  'gpt-5-3':                 { input: 2.00, output: 8.00,  cachedInput: 0.50,   cachedWrite: 2.00 },
  'llama-3.3-70b':           { input: 0.59, output: 0.79,  cachedInput: 0.15,   cachedWrite: 0.59 },
  'llama-3.1-8b':            { input: 0.05, output: 0.08,  cachedInput: 0.01,   cachedWrite: 0.05 },
  'glm-5.1':                 { input: 0.95, output: 3.15,  cachedInput: 0.24,   cachedWrite: 0.95 },
};

export function calculateAICostEur(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): number {
  const pricing = AI_PRICING[model] || AI_PRICING['gemini-3-flash'];
  // Anthropic reports input_tokens NOT including cache_read or cache_write — they are
  // separate fields. We subtract just to be safe in case an upstream adapter folds them in.
  const nonCachedInput = Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);
  const costUsd =
    (
      nonCachedInput * pricing.input +
      cacheReadTokens * pricing.cachedInput +
      cacheWriteTokens * pricing.cachedWrite +
      outputTokens * pricing.output
    ) / 1_000_000;
  return costUsd * USD_TO_EUR;
}

export function calculateAIBatchCostEur(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): number {
  return calculateAICostEur(model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens) * 0.5;
}
