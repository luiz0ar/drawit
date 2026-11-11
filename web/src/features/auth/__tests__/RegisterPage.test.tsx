import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAuthStore } from '../../../stores/authStore';

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

import { RegisterPage } from '../RegisterPage';

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all required registration fields', () => {
    render(<RegisterPage />);
    expect(screen.getByLabelText(/username/i)).toBeDefined();
    expect(screen.getByLabelText(/^email$/i)).toBeDefined();
    expect(screen.getByLabelText(/^password$/i)).toBeDefined();
    expect(screen.getByLabelText(/confirm password/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /create account/i })).toBeDefined();
  });

  it('validates password mismatch on client side', async () => {
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'alice_dev' } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'different123' } });

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/passwords do not match/i);
    });
  });

  it('submits registration and redirects to check-email on success', async () => {
    const registerSpy = vi.spyOn(useAuthStore.getState(), 'register').mockResolvedValueOnce({
      message: 'Account created',
      email: 'alice@example.com',
    });

    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'alice_dev' } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password123' } });

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(registerSpy).toHaveBeenCalledWith(
        'alice_dev',
        'alice@example.com',
        'password123',
        'password123'
      );
      expect(mockNavigate).toHaveBeenCalledWith(
        '/check-email?email=alice%40example.com',
        { replace: true }
      );
    });
  });
});
