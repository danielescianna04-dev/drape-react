import { calculateAIBatchCostEur, calculateAICostEur } from '../../../backend-ts/src/services/ai-pricing.service';

describe('ai pricing', () => {
  // 1M input tokens at Claude Opus 4.7 rate ($15/M) * 0.92 EUR/USD = €13.80
  it('uses the current Claude 4.7 Opus pricing', () => {
    const cost = calculateAICostEur('claude-4-7-opus', 1_000_000, 0, 0);
    expect(cost).toBeCloseTo(13.8, 5);
  });

  it('keeps claude-4-6-opus as a compatibility alias', () => {
    const cost = calculateAICostEur('claude-4-6-opus', 1_000_000, 0, 0);
    expect(cost).toBeCloseTo(13.8, 5);
  });

  // 200K non-cached at $15/M + 800K cache-read at $1.50/M = $4.20 USD * 0.92 = €3.864
  it('applies cache-read pricing for Claude Opus 4.7 cache hits', () => {
    const cost = calculateAICostEur('claude-4-7-opus', 1_000_000, 0, 800_000);
    expect(cost).toBeCloseTo(3.864, 5);
  });

  // 0 non-cached input, 1M cache-write at $18.75/M = $18.75 USD * 0.92 = €17.25
  it('applies cache-write surcharge for Claude Opus 4.7', () => {
    const cost = calculateAICostEur('claude-4-7-opus', 1_000_000, 0, 0, 1_000_000);
    expect(cost).toBeCloseTo(17.25, 5);
  });

  it('applies the Anthropic Batch API discount on batch reviews', () => {
    const liveCost = calculateAICostEur('claude-4-6-sonnet', 1_000_000, 200_000, 0);
    const batchCost = calculateAIBatchCostEur('claude-4-6-sonnet', 1_000_000, 200_000, 0);
    expect(batchCost).toBeCloseTo(liveCost * 0.5, 5);
  });
});
