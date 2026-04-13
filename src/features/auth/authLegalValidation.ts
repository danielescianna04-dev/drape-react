export interface RegistrationLegalValidationInput {
  tosAccepted: boolean;
  dateOfBirth: string;
  now?: Date;
}

export interface RegistrationLegalValidationResult {
  errorKey: string | null;
  shouldShowParentalNotice: boolean;
}

const parseDateOfBirthValue = (value: string) => {
  const parts = value.trim().split('/');
  if (parts.length !== 3) return null;
  const [dayStr, monthStr, yearStr] = parts;
  const day = parseInt(dayStr, 10);
  const month = parseInt(monthStr, 10);
  const year = parseInt(yearStr, 10);
  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null;
  return { day, month, year };
};

export function validateRegistrationLegalRequirements({
  tosAccepted,
  dateOfBirth,
  now = new Date(),
}: RegistrationLegalValidationInput): RegistrationLegalValidationResult {
  if (!tosAccepted) {
    return { errorKey: 'auth:gdpr.tosRequired', shouldShowParentalNotice: false };
  }

  if (!dateOfBirth.trim()) {
    return { errorKey: 'auth:gdpr.ageRequired', shouldShowParentalNotice: false };
  }

  const parsedDob = parseDateOfBirthValue(dateOfBirth);
  if (!parsedDob) {
    return { errorKey: 'auth:gdpr.ageInvalidFormat', shouldShowParentalNotice: false };
  }

  const { day, month, year } = parsedDob;
  if (
    Number.isNaN(day) ||
    Number.isNaN(month) ||
    Number.isNaN(year) ||
    day < 1 ||
    day > 31 ||
    month < 1 ||
    month > 12 ||
    year < 1900 ||
    year > now.getFullYear()
  ) {
    return { errorKey: 'auth:gdpr.ageInvalidFormat', shouldShowParentalNotice: false };
  }

  const birthDate = new Date(year, month - 1, day);
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age--;
  }

  if (age < 13) {
    return { errorKey: 'auth:gdpr.underAge', shouldShowParentalNotice: false };
  }

  return {
    errorKey: null,
    shouldShowParentalNotice: age >= 13 && age < 16,
  };
}
