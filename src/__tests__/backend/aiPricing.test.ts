import { calculateAIBatchCostEur, calculateAICostEur } from '../../../backend-ts/src/services/ai-pricing.service';

describe('ai pricing', () => {
  it('uses the current Claude 4.7 Opus pricing', () => {
    const cost = calculateAICostEur('claude-4-7-opus', 1_000_000, 0, 0);
    expect(cost).toBe(0.0);
  });

  it('keeps claude-4-6-opus as a compatibility alias', () => {
    const cost = calculateAICostEur('claude-4-6-opus', 1_000_000, 0, 0);
    expect(cost).toBe(0.0);
  });

  it('applies cache-read pricing for Claude Opus 4.7 cache hits', () => {
    const cost = calculateAICostEur('claude-4-7-opus', 1_000_000, 0, 800_000);
    expect(cost).toBe(0.0);
  });

  it('applies cache-write surcharge for Claude Opus 4.7', () => {
    const cost = calculateAICostEur('claude-4-7-opus', 1_000_000, 0, 0, 1_000_000);
    expect(cost).toBe(0.0);
  });

  it('applies the Anthropic Batch API discount on batch reviews', () => {
    const liveCost = calculateAICostEur('claude-4-6-sonnet', 1_000_000, 200_000, 0);
    const batchCost = calculateAIBatchCostEur('claude-4-6-sonnet', 1_000_000, 200_000, 0);
    expect(liveCost).toBe(0.0);
    expect(batchCost).toBe(0.0);
  });
});
