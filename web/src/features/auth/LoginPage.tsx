import React, { useState } from 'react';
import {
  Layers,
  User,
  Lock,
  ArrowRight,
  Loader2,
  AlertCircle,
  Sun,
  Moon,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { Link, navigate } from '../../lib/router';
import { useTheme } from '../../context/ThemeContext';
import { ApiError } from '../../lib/api';

const REMEMBERED_USERNAME_KEY = 'drawit_remembered_username';

export const LoginPage: React.FC = () => {
  const { login } = useAuthStore();
  const { resolvedTheme, setTheme } = useTheme();

  const [username, setUsername] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(REMEMBERED_USERNAME_KEY) || '';
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(window.localStorage.getItem(REMEMBERED_USERNAME_KEY));
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUser = username.trim();
    if (trimmedUser.length < 3 || trimmedUser.length > 30) {
      setError('Username must be between 3 and 30 characters.');
      return;
    }
    if (password.length < 6) {
      setError('Password must have at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(trimmedUser, password);

      // Handle Remember Me persistence
      if (rememberMe) {
        window.localStorage.setItem(REMEMBERED_USERNAME_KEY, trimmedUser);
      } else {
        window.localStorage.removeItem(REMEMBERED_USERNAME_KEY);
      }

      navigate('/boards', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        const paramErr =
          err.problem.invalidParams?.[0]?.reason ||
          err.problem.invalid_params?.[0]?.reason;
        setError(paramErr || err.problem.detail || err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to sign in.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center bg-background text-foreground px-4 relative">
      {/* Theme Toggle */}
      <div className="absolute top-4 right-4">
        <button
          type="button"
          title="Toggle Theme"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-lg border bg-card hover:bg-muted text-foreground transition-colors shadow-sm"
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
      </div>

      <div className="w-full max-w-md bg-card border rounded-2xl shadow-xl p-8 space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <Layers className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Sign in to Drawit</h1>
          <p className="text-xs text-muted-foreground">
            System Design & Architecture Whiteboard
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="login-username"
              className="text-xs font-semibold text-foreground block"
            >
              Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-username"
                name="username"
                type="text"
                autoComplete="username"
                required
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="login-password"
              className="text-xs font-semibold text-foreground block"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-10 py-2 text-sm rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="p-1 rounded text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between py-0.5">
            <label
              htmlFor="login-remember-me"
              className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none"
            >
              <input
                id="login-remember-me"
                name="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary focus:ring-offset-background cursor-pointer accent-primary"
              />
              <span>Remember me</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="pt-2 border-t text-center text-xs text-muted-foreground">
          <span>Don&apos;t have an account? </span>
          <Link
            to="/register"
            className="font-semibold text-primary hover:underline"
          >
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
};
