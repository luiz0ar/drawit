import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAuthStore } from '../../../stores/authStore';

// Setup localStorage mock BEFORE importing modules
const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: storageMock,
  writable: true,
});

// Mock router
const mockNavigate = vi.fn();
vi.mock('../../../lib/router', () => ({
  Link: ({ children, to, className }: any) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  navigate: (...args: any[]) => mockNavigate(...args),
}));

// Mock ThemeContext
vi.mock('../../../context/ThemeContext', () => ({
  useTheme: () => ({
    resolvedTheme: 'light',
    setTheme: vi.fn(),
  }),
}));

import { LoginPage } from '../LoginPage';

describe('LoginPage Remember Me functionality', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders Remember me checkbox unchecked by default when no stored email', () => {
    render(<LoginPage />);
    const checkbox = screen.getByLabelText(/remember me/i) as HTMLInputElement;
    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;

    expect(checkbox).toBeDefined();
    expect(checkbox.checked).toBe(false);
    expect(emailInput.value).toBe('');
  });

  it('pre-fills email and checks Remember me if an email was previously remembered', () => {
    window.localStorage.setItem('drawit_remembered_email', 'alice@example.com');

    render(<LoginPage />);
    const checkbox = screen.getByLabelText(/remember me/i) as HTMLInputElement;
    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;

    expect(checkbox.checked).toBe(true);
    expect(emailInput.value).toBe('alice@example.com');
  });

  it('saves email to localStorage on successful login when Remember me is checked', async () => {
    const loginSpy = vi.spyOn(useAuthStore.getState(), 'login').mockResolvedValueOnce(undefined);

    render(<LoginPage />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByPlaceholderText(/enter your password/i);
    const checkbox = screen.getByLabelText(/remember me/i);
    const submitBtn = screen.getByRole('button', { name: /sign in/i });

    fireEvent.change(emailInput, { target: { value: 'alice@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'valid_password_123' } });
    fireEvent.click(checkbox);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith('alice@example.com', 'valid_password_123');
      expect(window.localStorage.getItem('drawit_remembered_email')).toBe('alice@example.com');
      expect(mockNavigate).toHaveBeenCalledWith('/boards', { replace: true });
    });
  });

  it('removes email from localStorage if Remember me is unchecked on successful login', async () => {
    window.localStorage.setItem('drawit_remembered_email', 'old_user@example.com');
    const loginSpy = vi.spyOn(useAuthStore.getState(), 'login').mockResolvedValueOnce(undefined);

    render(<LoginPage />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByPlaceholderText(/enter your password/i);
    const checkbox = screen.getByLabelText(/remember me/i);
    const submitBtn = screen.getByRole('button', { name: /sign in/i });

    // Uncheck Remember me
    fireEvent.click(checkbox);
    fireEvent.change(emailInput, { target: { value: 'alice@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'valid_password_123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith('alice@example.com', 'valid_password_123');
      expect(window.localStorage.getItem('drawit_remembered_email')).toBeNull();
      expect(mockNavigate).toHaveBeenCalledWith('/boards', { replace: true });
    });
  });
});
