import { describe, expect, it } from 'vitest';
import { validateRegistrationLegalRequirements } from '../../features/auth/authLegalValidation';

describe('authLegalValidation', () => {
  const now = new Date(2026, 3, 13);

  it('requires terms acceptance', () => {
    expect(
      validateRegistrationLegalRequirements({
        tosAccepted: false,
        dateOfBirth: '01/01/2000',
        now,
      })
    ).toEqual({
      errorKey: 'auth:gdpr.tosRequired',
      shouldShowParentalNotice: false,
    });
  });

  it('rejects underage users', () => {
    expect(
      validateRegistrationLegalRequirements({
        tosAccepted: true,
        dateOfBirth: '01/01/2015',
        now,
      }).errorKey
    ).toBe('auth:gdpr.underAge');
  });

  it('flags parental notice for teens between 13 and 15', () => {
    expect(
      validateRegistrationLegalRequirements({
        tosAccepted: true,
        dateOfBirth: '01/01/2012',
        now,
      })
    ).toEqual({
      errorKey: null,
      shouldShowParentalNotice: true,
    });
  });

  it('accepts adult registrations', () => {
    expect(
      validateRegistrationLegalRequirements({
        tosAccepted: true,
        dateOfBirth: '01/01/2000',
        now,
      })
    ).toEqual({
      errorKey: null,
      shouldShowParentalNotice: false,
    });
  });
});
