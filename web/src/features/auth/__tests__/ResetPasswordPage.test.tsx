import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthApi } from '../../../lib/api';

const mockNavigate = vi.fn();
vi.mock('../../../lib/router', () => ({
  Link: ({ children, to, className }: any) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  navigate: (...args: any[]) => mockNavigate(...args),
}));

vi.mock('../../../context/ThemeContext', () => ({
  useTheme: () => ({
    resolvedTheme: 'light',
    setTheme: vi.fn(),
  }),
}));

import { ResetPasswordPage } from '../ResetPasswordPage';

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays warning when reset token is missing from URL', () => {
    delete (window as any).location;
    window.location = new URL('http://localhost:3000/reset-password') as any;

    render(<ResetPasswordPage />);
    expect(screen.getByText(/missing reset token/i)).toBeDefined();
    expect(screen.getByRole('link', { name: /request new reset/i })).toBeDefined();
  });

  it('renders reset form when token is present in URL', () => {
    delete (window as any).location;
    window.location = new URL('http://localhost:3000/reset-password?token=secret123') as any;

    render(<ResetPasswordPage />);
    expect(screen.getByLabelText(/^new password$/i)).toBeDefined();
    expect(screen.getByLabelText(/^confirm new password$/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /reset password/i })).toBeDefined();
  });

  it('validates password mismatch on client side', async () => {
    delete (window as any).location;
    window.location = new URL('http://localhost:3000/reset-password?token=secret123') as any;

    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: 'SecurePass123!' },
    });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: 'MismatchPass123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/passwords do not match/i);
    });
  });

  it('validates password complexity on client side', async () => {
    delete (window as any).location;
    window.location = new URL('http://localhost:3000/reset-password?token=secret123') as any;

    render(<ResetPasswordPage />);
    // Missing special character and uppercase
    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: 'weakpass123' },
    });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: 'weakpass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/does not meet all security requirements/i);
    });
  });

  it('submits reset password successfully and shows confirmation', async () => {
    delete (window as any).location;
    window.location = new URL('http://localhost:3000/reset-password?token=valid_token') as any;

    const resetSpy = vi.spyOn(AuthApi, 'resetPassword').mockResolvedValueOnce({
      message: 'Password reset successful',
    });

    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText(/^new password$/i), {
      target: { value: 'BrandNewPass123!' },
    });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: 'BrandNewPass123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(resetSpy).toHaveBeenCalledWith({
        token: 'valid_token',
        password: 'BrandNewPass123!',
        confirmPassword: 'BrandNewPass123!',
      });
      expect(screen.getByRole('status')).toBeDefined();
      expect(screen.getByText(/password updated/i)).toBeDefined();
    });
  });
});

