import React, { useState, useEffect } from 'react';
import {
  Mail,
  ArrowRight,
  Loader2,
  AlertCircle,
  RotateCw,
  Sun,
  Moon,
  ArrowLeft,
} from 'lucide-react';
import { Link } from '../../lib/router';
import { useTheme } from '../../context/ThemeContext';
import { ApiError, AuthApi } from '../../lib/api';

const DEFAULT_COOLDOWN_SECONDS = 90;

export const ForgotPasswordPage: React.FC = () => {
  const { resolvedTheme, setTheme } = useTheme();

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please provide a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await AuthApi.forgotPassword(trimmedEmail);
      setIsSubmitted(true);
      setSuccessMessage(
        res.message ||
        'If an account exists with this email, you will receive password reset instructions shortly.'
      );
      setCooldown(DEFAULT_COOLDOWN_SECONDS);
    } catch (err) {
      if (err instanceof ApiError) {
        const paramErr =
          err.problem.invalidParams?.[0]?.reason ||
          err.problem.invalid_params?.[0]?.reason;
        setError(paramErr || err.problem.detail || err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to request password reset.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const res = await AuthApi.forgotPassword(trimmedEmail);
      setSuccessMessage(
        res.message ||
        'A new password reset email has been dispatched if an account exists.'
      );
      setCooldown(DEFAULT_COOLDOWN_SECONDS);
    } catch (err) {
      if (err instanceof ApiError) {
        const paramErr =
          err.problem.invalidParams?.[0]?.reason ||
          err.problem.invalid_params?.[0]?.reason;
        setError(paramErr || err.problem.detail || err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to resend reset email.');
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
            <h1 className="text-2xl font-bold tracking-tight">Forgot Password</h1>
            <p className="text-xs text-muted-foreground">
              {isSubmitted
                ? 'Check your email inbox for instructions'
                : 'Enter your email to receive a password reset link'}
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

        {!isSubmitted ? (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="forgot-email"
                className="text-xs font-semibold text-foreground block"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="forgot-email"
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

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sending reset email...</span>
                </>
              ) : (
                <>
                  <span>Send Reset Email</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="space-y-5">
            <div
              role="status"
              className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-foreground space-y-2"
            >
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                <span>Instructions Sent</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {successMessage}
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border bg-background hover:bg-muted text-foreground text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Resending...</span>
                  </>
                ) : (
                  <>
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>
                      {cooldown > 0
                        ? `Resend email in ${cooldown}s`
                        : 'Resend reset email'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="pt-2 border-t text-center text-xs text-muted-foreground">
          <Link
            to="/login"
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sign In</span>
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
