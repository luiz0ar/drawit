import React, { useEffect, useState } from 'react';
import { Mail, ArrowRight, Loader2, AlertCircle, CheckCircle2, RotateCw } from 'lucide-react';
import { Link } from '../../lib/router';
import { ApiError, AuthApi } from '../../lib/api';

const DEFAULT_COOLDOWN_SECONDS = 90;

export const CheckEmailPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [cooldown, setCooldown] = useState(DEFAULT_COOLDOWN_SECONDS);
  const [isResending, setIsResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const emailParam = params.get('email');
      if (emailParam) {
        setEmail(emailParam);
      }
    }
  }, []);

  // Countdown timer for 90s cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleResend = async () => {
    if (!email) {
      setError('Please provide your email address to resend.');
      return;
    }
    if (cooldown > 0) return;

    setError(null);
    setMessage(null);
    setIsResending(true);

    try {
      const res = await AuthApi.resendVerification(email);
      setMessage(res.message || 'A new verification email has been dispatched.');
      setCooldown(DEFAULT_COOLDOWN_SECONDS);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.problem.retryAfter) {
          setCooldown(err.problem.retryAfter);
        }
        setError(err.problem.detail || err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to resend verification email.');
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center bg-background text-foreground px-4">
      <div className="w-full max-w-md bg-card border rounded-2xl shadow-xl p-8 space-y-6 text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Mail className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a verification link to{' '}
            <span className="font-semibold text-foreground">{email || 'your email'}</span>.
            Click the link in the message to activate your account.
          </p>
        </div>

        {message && (
          <div
            role="status"
            className="flex items-start gap-2.5 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 text-xs text-left"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{message}</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs text-left"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3 pt-2">
          <button
            type="button"
            disabled={cooldown > 0 || isResending}
            onClick={handleResend}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isResending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Resending...</span>
              </>
            ) : cooldown > 0 ? (
              <>
                <RotateCw className="w-4 h-4 opacity-70" />
                <span>Resend email in {cooldown}s</span>
              </>
            ) : (
              <>
                <RotateCw className="w-4 h-4" />
                <span>Resend verification email</span>
              </>
            )}
          </button>

          <Link
            to="/login"
            className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg border hover:bg-muted text-sm font-medium transition-colors"
          >
            <span>Back to Sign in</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="pt-2 border-t text-xs text-muted-foreground">
          Didn't receive the email? Check your spam/junk folder or wait for the timer to resend.
        </div>
      </div>
    </div>
  );
};
