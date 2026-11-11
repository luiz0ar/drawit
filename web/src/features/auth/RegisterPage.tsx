import React, { useState } from 'react';
import {
  User,
  Mail,
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

export const RegisterPage: React.FC = () => {
  const { register } = useAuthStore();
  const { resolvedTheme, setTheme } = useTheme();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUser = username.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (trimmedUser.length < 3 || trimmedUser.length > 30) {
      setError('Username must be between 3 and 30 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmedUser)) {
      setError('Username can only contain letters, numbers, dots, hyphens, and underscores.');
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please provide a valid email address.');
      return;
    }
    if (password.length < 6 || password.length > 128) {
      setError('Password must be between 6 and 128 characters.');
      return;
    }
    if (!confirmPassword) {
      setError('Please confirm your password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register(trimmedUser, trimmedEmail, password, confirmPassword);
      navigate(`/check-email?email=${encodeURIComponent(trimmedEmail)}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        const paramErr =
          err.problem.invalidParams?.[0]?.reason ||
          err.problem.invalid_params?.[0]?.reason;
        setError(paramErr || err.problem.detail || err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Registration failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center bg-background text-foreground px-4 relative overflow-hidden">
      {/* Background ambient decorative glow using brand colors */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#0f40bd]/10 dark:bg-[#0f40bd]/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#84ff00]/10 dark:bg-[#84ff00]/15 rounded-full blur-3xl" />
      </div>

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
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative group cursor-pointer">
            <div className="w-16 h-16 rounded-2xl bg-[#0f40bd] flex items-center justify-center shadow-lg shadow-blue-600/25 ring-4 ring-[#0f40bd]/15 p-2.5 transition-transform duration-200 group-hover:scale-105">
              <img
                src="/brand/cup-transparent.png"
                alt="Drawit Mascot"
                className="w-11 h-11 object-contain drop-shadow"
              />
            </div>
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Create Account</h1>
            <p className="text-xs text-muted-foreground">
              Get started with your personal System Design workspace
            </p>
          </div>
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
              htmlFor="register-username"
              className="text-xs font-semibold text-foreground block"
            >
              Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="register-username"
                name="username"
                type="text"
                autoComplete="username"
                required
                placeholder="Choose a unique username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="register-email"
              className="text-xs font-semibold text-foreground block"
            >
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="register-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="register-password"
              className="text-xs font-semibold text-foreground block"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="register-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                placeholder="At least 6 characters"
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

          <div className="space-y-1.5">
            <label
              htmlFor="register-confirm-password"
              className="text-xs font-semibold text-foreground block"
            >
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="register-confirm-password"
                name="confirmPassword"
                type={'password'}
                autoComplete="new-password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-9 pr-10 py-2 text-sm rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating account...</span>
              </>
            ) : (
              <>
                <span>Create Account</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="pt-2 border-t text-center text-xs text-muted-foreground">
          <span>Already have an account? </span>
          <Link
            to="/login"
            className="font-semibold text-primary hover:underline"
          >
            Sign in
          </Link>
        </div>
      </div>

      <footer className="mt-8 text-center text-xs text-muted-foreground flex items-center gap-2">
        <img src="/brand/cup-transparent.png" alt="Drawit" className="w-4 h-4 object-contain opacity-75" />
        <span>Drawit &mdash; Modern Whiteboard for System Design</span>
      </footer>
    </div>
  );
};

