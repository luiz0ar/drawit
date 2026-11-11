import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthApi } from '../../../lib/api';

vi.mock('../../../lib/router', () => ({
  Link: ({ children, to, className }: any) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  navigate: vi.fn(),
}));

vi.mock('../../../context/ThemeContext', () => ({
  useTheme: () => ({
    resolvedTheme: 'light',
    setTheme: vi.fn(),
  }),
}));

import { ForgotPasswordPage } from '../ForgotPasswordPage';

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders email input, send button, and back link', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByLabelText(/email address/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /send reset/i })).toBeDefined();
    expect(screen.getByText(/back to sign in/i)).toBeDefined();
  });

  it('validates invalid email address', async () => {
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/valid email address/i);
    });
  });

  it('submits request and displays confirmation card with cooldown', async () => {
    const forgotSpy = vi.spyOn(AuthApi, 'forgotPassword').mockResolvedValueOnce({
      message: 'If an account exists, instructions were sent.',
    });

    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset/i }));

    await waitFor(() => {
      expect(forgotSpy).toHaveBeenCalledWith('user@example.com');
      expect(screen.getByRole('status')).toBeDefined();
      expect(screen.getByText(/instructions sent/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /resend/i })).toBeDefined();
    });
  });
});

