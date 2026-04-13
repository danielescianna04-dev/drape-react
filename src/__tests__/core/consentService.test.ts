import { describe, expect, it, beforeEach } from 'vitest';
import { isConsentGranted, useConsentStore } from '../../core/services/consentService';

describe('consentService', () => {
  beforeEach(() => {
    useConsentStore.setState({ consent: null, hasLoaded: true });
  });

  it('defaults consent-gated services to blocked before consent is granted', () => {
    expect(isConsentGranted('analytics')).toBe(false);
    expect(isConsentGranted('pushNotifications')).toBe(false);
    expect(isConsentGranted('presenceTracking')).toBe(false);
  });

  it('respects granted consent categories', () => {
    useConsentStore.setState({
      consent: {
        analytics: true,
        pushNotifications: true,
        presenceTracking: true,
      },
      hasLoaded: true,
    });

    expect(isConsentGranted('analytics')).toBe(true);
    expect(isConsentGranted('pushNotifications')).toBe(true);
    expect(isConsentGranted('presenceTracking')).toBe(true);
  });
});
