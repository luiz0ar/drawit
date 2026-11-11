import { describe, it, expect } from 'vitest';
import { validatePassword } from '../passwordValidation';

describe('validatePassword', () => {
  it('identifies an empty password as completely invalid', () => {
    const res = validatePassword('');
    expect(res.isValid).toBe(false);
    expect(res.hasMinLength).toBe(false);
    expect(res.hasUppercase).toBe(false);
    expect(res.hasLowercase).toBe(false);
    expect(res.hasNumber).toBe(false);
    expect(res.hasSpecial).toBe(false);
  });

  it('rejects passwords shorter than 8 characters', () => {
    const res = validatePassword('Aa1!bcd'); // 7 chars
    expect(res.hasMinLength).toBe(false);
    expect(res.hasUppercase).toBe(true);
    expect(res.hasLowercase).toBe(true);
    expect(res.hasNumber).toBe(true);
    expect(res.hasSpecial).toBe(true);
    expect(res.isValid).toBe(false);
  });

  it('rejects passwords missing an uppercase letter', () => {
    const res = validatePassword('password123!');
    expect(res.hasMinLength).toBe(true);
    expect(res.hasUppercase).toBe(false);
    expect(res.hasLowercase).toBe(true);
    expect(res.hasNumber).toBe(true);
    expect(res.hasSpecial).toBe(true);
    expect(res.isValid).toBe(false);
  });

  it('rejects passwords missing a lowercase letter', () => {
    const res = validatePassword('PASSWORD123!');
    expect(res.hasMinLength).toBe(true);
    expect(res.hasUppercase).toBe(true);
    expect(res.hasLowercase).toBe(false);
    expect(res.hasNumber).toBe(true);
    expect(res.hasSpecial).toBe(true);
    expect(res.isValid).toBe(false);
  });

  it('rejects passwords missing a number', () => {
    const res = validatePassword('Password!@#');
    expect(res.hasMinLength).toBe(true);
    expect(res.hasUppercase).toBe(true);
    expect(res.hasLowercase).toBe(true);
    expect(res.hasNumber).toBe(false);
    expect(res.hasSpecial).toBe(true);
    expect(res.isValid).toBe(false);
  });

  it('rejects passwords missing a special character', () => {
    const res = validatePassword('Password123');
    expect(res.hasMinLength).toBe(true);
    expect(res.hasUppercase).toBe(true);
    expect(res.hasLowercase).toBe(true);
    expect(res.hasNumber).toBe(true);
    expect(res.hasSpecial).toBe(false);
    expect(res.isValid).toBe(false);
  });

  it('accepts valid passwords meeting all 5 requirements', () => {
    const res1 = validatePassword('Password123!');
    expect(res1.isValid).toBe(true);
    expect(res1.hasMinLength).toBe(true);
    expect(res1.hasUppercase).toBe(true);
    expect(res1.hasLowercase).toBe(true);
    expect(res1.hasNumber).toBe(true);
    expect(res1.hasSpecial).toBe(true);

    const res2 = validatePassword('Secure@Pass2026');
    expect(res2.isValid).toBe(true);

    const res3 = validatePassword('Tr0ub4dor&3');
    expect(res3.isValid).toBe(true);
  });
});

