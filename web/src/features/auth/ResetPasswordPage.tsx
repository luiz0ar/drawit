import React, { useState, useEffect } from 'react';
import {
  Lock,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sun,
  Moon,
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react';
import { Link, navigate } from '../../lib/router';
import { useTheme } from '../../context/ThemeContext';
import { ApiError, AuthApi } from '../../lib/api';
import { validatePassword } from '../../lib/passwordValidation';
import { PasswordRequirements } from './components/PasswordRequirements';

export const ResetPasswordPage: React.FC = () => {
  const { resolvedTheme, setTheme } = useTheme();

  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingToken, setMissingToken] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken && urlToken.trim().length > 0) {
        setToken(urlToken.trim());
      } else {
        setMissingToken(true);
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Invalid or missing password reset token. Please request a new email.');
      return;
    }

    if (!password) {
      setError('Please enter a new password.');
      return;
    }

    if (!confirmPassword) {
      setError('Please confirm your new password.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const validation = validatePassword(password);
    if (!validation.isValid) {
      setError('Password does not meet all security requirements.');
      return;
    }

    setIsSubmitting(true);
    try {
      await AuthApi.resetPassword({
        token,
        password,
        confirmPassword,
      });

      // Clear token from browser URL bar to protect privacy
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/reset-password');
      }

      setIsSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        const paramErr =
          err.problem.invalidParams?.[0]?.reason ||
          err.problem.invalid_params?.[0]?.reason;
        setError(paramErr || err.problem.detail || err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to reset password.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center bg-background text-foreground px-4 relative overflow-hidden">
      {/* Background ambient decorative glow using brand colors */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#0f40bd]/10 dark:bg-[#0f40bd]/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-[#84ff00]/10 dark:bg-[#84ff00]/15 rounded-full blur-3xl" />
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
            <h1 className="text-2xl font-bold tracking-tight">
              {isSuccess ? 'Password Reset Complete' : 'Reset Your Password'}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isSuccess
                ? 'Your password has been updated securely.'
                : 'Choose a strong new password for your Drawit account.'}
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

        {missingToken && !isSuccess ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive space-y-2">
              <p className="font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Missing Reset Token
              </p>
              <p className="text-muted-foreground">
                No password reset token was detected in your link, or the link may have expired. Please request a fresh reset link.
              </p>
            </div>
            <Link
              to="/forgot-password"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
            >
              <span>Request New Reset Email</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : isSuccess ? (
          <div className="space-y-5">
            <div
              role="status"
              className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-foreground space-y-2 text-center"
            >
              <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span className="text-sm">Password Updated</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Your new password has been saved, and all existing active sessions have been securely signed out.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
            >
              <span>Sign In with New Password</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="reset-password"
                className="text-xs font-semibold text-foreground block"
              >
                New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="reset-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  placeholder="Enter new secure password"
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

              {password.length > 0 && (
                <PasswordRequirements password={password} className="mt-2" />
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="reset-confirm-password"
                className="text-xs font-semibold text-foreground block"
              >
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="reset-confirm-password"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2 text-sm rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  className="p-1 rounded text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
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
                  <span>Updating password...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Reset Password</span>
                </>
              )}
            </button>
          </form>
        )}

        <div className="pt-2 border-t text-center text-xs text-muted-foreground">
          <Link
            to="/login"
            className="font-semibold text-primary hover:underline"
          >
            Back to Sign In
          </Link>
        </div>
      </div>

      <footer className="mt-8 text-center text-xs text-muted-foreground flex items-center gap-2">
        <img
          src="/brand/cup-transparent.png"
          alt="Drawit"
          className="w-4 h-4 object-contain opacity-75"
        />
        <span>Drawit &mdash; Modern Whiteboard for System Design</span>
      </footer>
    </div>
  );
};
