import { describe, expect, it } from 'vitest';
import { shouldShowAuthRoute, shouldShowNativeLoadingRoute } from '../../app/appRouteGuards';

describe('appRouteGuards', () => {
  it('detects native loading gate', () => {
    expect(shouldShowNativeLoadingRoute({ isInitialized: false, consentLoaded: true })).toBe(true);
    expect(shouldShowNativeLoadingRoute({ isInitialized: true, consentLoaded: false })).toBe(true);
    expect(shouldShowNativeLoadingRoute({ isInitialized: true, consentLoaded: true })).toBe(false);
  });

  it('detects auth gate', () => {
    expect(shouldShowAuthRoute({ hasUser: false })).toBe(true);
    expect(shouldShowAuthRoute({ hasUser: true })).toBe(false);
  });
});
