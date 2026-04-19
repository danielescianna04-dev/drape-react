import { describe, expect, it } from 'vitest';
import { extractNavDestinationPaths } from '../../../backend-ts/src/services/verify/error-classifier';

describe('extractNavDestinationPaths', () => {
  it('extracts the destination path from an "error screen" nav error', () => {
    const err = '[nav] "Suggerimento risparmio" → /subscriptions/4 → error screen';
    expect(extractNavDestinationPaths([err])).toEqual(['/subscriptions/4']);
  });

  it('extracts paths with nested segments', () => {
    const err = '[nav] "Blog post" → /blog/2026/my-post → blank page';
    expect(extractNavDestinationPaths([err])).toEqual(['/blog/2026/my-post']);
  });

  it('keeps the path even when the error string has trailing detail', () => {
    const err = '[nav] "View item" → /items/42 → error screen — TypeError: Cannot read properties of undefined';
    expect(extractNavDestinationPaths([err])).toEqual(['/items/42']);
  });

  it('deduplicates identical destinations', () => {
    const errors = [
      '[nav] "A" → /subscriptions/4 → error screen',
      '[nav] "B" → /subscriptions/4 → blank page',
    ];
    expect(extractNavDestinationPaths(errors)).toEqual(['/subscriptions/4']);
  });

  it('preserves multiple distinct destinations in input order', () => {
    const errors = [
      '[nav] "A" → /subscriptions/4 → error screen',
      '[nav] "B" → /profile/me → blank page',
    ];
    expect(extractNavDestinationPaths(errors)).toEqual(['/subscriptions/4', '/profile/me']);
  });

  it('ignores nav errors that do not specify a destination path', () => {
    const err = '[nav] "X" → JS: TypeError: something';
    expect(extractNavDestinationPaths([err])).toEqual([]);
  });

  it('ignores non-nav errors even if they contain a path', () => {
    const err = '[route /subscriptions/4] Server returned HTTP 500';
    expect(extractNavDestinationPaths([err])).toEqual([]);
  });

  it('rejects root "/" (no detail to act on)', () => {
    const err = '[nav] "Home" → / → error screen';
    expect(extractNavDestinationPaths([err])).toEqual([]);
  });

  it('rejects paths with disallowed characters', () => {
    const errors = [
      '[nav] "Q" → /search?q=x → error screen',
      '[nav] "H" → /page#top → error screen',
      '[nav] "S" → /with space → error screen',
    ];
    expect(extractNavDestinationPaths(errors)).toEqual([]);
  });

  it('handles empty input', () => {
    expect(extractNavDestinationPaths([])).toEqual([]);
  });
});
