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

  it('renders Remember me checkbox unchecked by default when no stored username', () => {
    render(<LoginPage />);
    const checkbox = screen.getByLabelText(/remember me/i) as HTMLInputElement;
    const usernameInput = screen.getByLabelText(/username/i) as HTMLInputElement;

    expect(checkbox).toBeDefined();
    expect(checkbox.checked).toBe(false);
    expect(usernameInput.value).toBe('');
  });

  it('pre-fills username and checks Remember me if a username was previously remembered', () => {
    window.localStorage.setItem('drawit_remembered_username', 'saved_architect');

    render(<LoginPage />);
    const checkbox = screen.getByLabelText(/remember me/i) as HTMLInputElement;
    const usernameInput = screen.getByLabelText(/username/i) as HTMLInputElement;

    expect(checkbox.checked).toBe(true);
    expect(usernameInput.value).toBe('saved_architect');
  });

  it('saves username to localStorage on successful login when Remember me is checked', async () => {
    const loginSpy = vi.spyOn(useAuthStore.getState(), 'login').mockResolvedValueOnce(undefined);

    render(<LoginPage />);
    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByPlaceholderText(/enter your password/i);
    const checkbox = screen.getByLabelText(/remember me/i);
    const submitBtn = screen.getByRole('button', { name: /sign in/i });

    fireEvent.change(usernameInput, { target: { value: 'alice_designer' } });
    fireEvent.change(passwordInput, { target: { value: 'valid_password_123' } });
    fireEvent.click(checkbox);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith('alice_designer', 'valid_password_123');
      expect(window.localStorage.getItem('drawit_remembered_username')).toBe('alice_designer');
      expect(mockNavigate).toHaveBeenCalledWith('/boards', { replace: true });
    });
  });

  it('removes username from localStorage if Remember me is unchecked on successful login', async () => {
    window.localStorage.setItem('drawit_remembered_username', 'old_user');
    const loginSpy = vi.spyOn(useAuthStore.getState(), 'login').mockResolvedValueOnce(undefined);

    render(<LoginPage />);
    const checkbox = screen.getByLabelText(/remember me/i);
    const passwordInput = screen.getByPlaceholderText(/enter your password/i);
    const submitBtn = screen.getByRole('button', { name: /sign in/i });

    // Uncheck Remember me
    fireEvent.click(checkbox);
    fireEvent.change(passwordInput, { target: { value: 'valid_password_123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith('old_user', 'valid_password_123');
      expect(window.localStorage.getItem('drawit_remembered_username')).toBeNull();
      expect(mockNavigate).toHaveBeenCalledWith('/boards', { replace: true });
    });
  });
});
