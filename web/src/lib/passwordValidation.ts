export interface PasswordValidationResult {
  isValid: boolean;
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

export interface PasswordCriterion {
  id: keyof Omit<PasswordValidationResult, 'isValid'>;
  label: string;
}

export const PASSWORD_CRITERIA: readonly PasswordCriterion[] = [
  { id: 'hasMinLength', label: 'At least 8 characters' },
  { id: 'hasUppercase', label: 'At least one uppercase letter (A-Z)' },
  { id: 'hasLowercase', label: 'At least one lowercase letter (a-z)' },
  { id: 'hasNumber', label: 'At least one number (0-9)' },
  { id: 'hasSpecial', label: 'At least one special character (!@#$%^&*...)' },
] as const;

export function validatePassword(password: string): PasswordValidationResult {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  // Match any non-alphanumeric character (including ASCII symbols and unicode symbols)
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const isValid =
    hasMinLength &&
    hasUppercase &&
    hasLowercase &&
    hasNumber &&
    hasSpecial;

  return {
    isValid,
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecial,
  };
}

