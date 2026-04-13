import { describe, it, expect } from 'vitest';
import {
  normalizePreviewUrl,
  isPreviewUrlRewrite,
  buildPreviewNavigationState,
} from '../../features/terminal/preview/navigation/previewNavigationAdapter';

describe('normalizePreviewUrl', () => {
  it('strips query params for subdomain previews', () => {
    const result = normalizePreviewUrl(
      'https://proj-123.drape.info/page?foo=bar',
      'https://proj-123.drape.info',
    );
    expect(result).not.toContain('foo=bar');
    expect(result).toContain('proj-123.drape.info/page');
  });

  it('adds /preview/ prefix for path-based previews', () => {
    const result = normalizePreviewUrl(
      'https://dev.drape.info/about',
      'https://dev.drape.info/preview/abc123',
    );
    expect(result).toContain('/preview/abc123/about');
  });
});

describe('isPreviewUrlRewrite', () => {
  it('detects rewrite needed for path-based preview', () => {
    const result = isPreviewUrlRewrite(
      'https://dev.drape.info/',
      'https://dev.drape.info/preview/abc123',
    );
    expect(result).toBe(true);
  });

  it('returns false for subdomain preview', () => {
    const result = isPreviewUrlRewrite(
      'https://proj-123.drape.info/',
      'https://proj-123.drape.info',
    );
    expect(result).toBe(false);
  });
});

describe('buildPreviewNavigationState', () => {
  it('detects subdomain preview', () => {
    const state = buildPreviewNavigationState(
      'https://proj-123.drape.info',
      'https://proj-123.drape.info/page',
      false,
      false,
    );
    expect(state.isSubdomainPreview).toBe(true);
  });

  it('sets correct flags', () => {
    const state = buildPreviewNavigationState(
      'https://dev.drape.info/preview/abc',
      'https://dev.drape.info/preview/abc/page',
      true,
      false,
    );
    expect(state.isSubdomainPreview).toBe(false);
    expect(state.canGoBack).toBe(true);
    expect(state.canGoForward).toBe(false);
    expect(state.canonicalUrl).toBe('https://dev.drape.info/preview/abc');
  });
});
