import { describe, expect, it } from 'vitest';
import { extractGitHubRepoUrlFromDeepLink } from '../../app/appDeepLinkUtils';

describe('appDeepLinkUtils', () => {
  it('extracts GitHub repo from raw GitHub urls', () => {
    expect(extractGitHubRepoUrlFromDeepLink('https://github.com/openai/codex')).toBe('https://github.com/openai/codex');
  });

  it('extracts GitHub repo from app deep links containing encoded urls', () => {
    expect(
      extractGitHubRepoUrlFromDeepLink('bynot://import?url=https%3A%2F%2Fgithub.com%2Fopenai%2Fcodex'),
    ).toBe('https://github.com/openai/codex');
  });

  it('returns null for unrelated deep links', () => {
    expect(extractGitHubRepoUrlFromDeepLink('bynot://settings')).toBeNull();
  });
});

