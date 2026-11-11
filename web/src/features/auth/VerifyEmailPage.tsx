import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2, ArrowRight, ShieldCheck } from 'lucide-react';
import { Link } from '../../lib/router';
import { ApiError, AuthApi } from '../../lib/api';

export const VerifyEmailPage: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken) {
        setToken(urlToken);
      } else {
        setStatus('error');
        setErrorMessage('No verification token was provided in the link.');
      }
    }
  }, []);

  const handleConfirmVerification = async () => {
    if (!token) return;

    setStatus('loading');
    setErrorMessage(null);

    try {
      await AuthApi.verifyEmail(token);
      // Clean up sensitive token from browser history / URL bar
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/verify-email');
      }
      setStatus('success');
    } catch (err) {
      setStatus('error');
      if (err instanceof ApiError) {
        const paramErr =
          err.problem.invalidParams?.[0]?.reason ||
          err.problem.invalid_params?.[0]?.reason;
        setErrorMessage(paramErr || err.problem.detail || err.message);
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Verification failed.');
      }
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center bg-background text-foreground px-4">
      <div className="w-full max-w-md bg-card border rounded-2xl shadow-xl p-8 space-y-6 text-center">
        {status === 'success' ? (
          <>
            <div className="mx-auto w-14 h-14 rounded-2xl bg-green-500/10 text-green-600 dark:text-green-400 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">Email Verified!</h1>
              <p className="text-sm text-muted-foreground">
                Your email address has been successfully verified. You can now access your DrawIt workspace.
              </p>
            </div>

            <div className="pt-4">
              <Link
                to="/login"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
              >
                <span>Proceed to Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </>
        ) : status === 'error' ? (
          <>
            <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertCircle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">Verification Failed</h1>
              <p className="text-sm text-destructive font-medium">
                {errorMessage || 'Unable to verify your email.'}
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <Link
                to="/login"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
              >
                <span>Go to Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <ShieldCheck className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">Confirm Email Verification</h1>
              <p className="text-sm text-muted-foreground">
                Click the button below to confirm and activate your DrawIt account.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={status === 'loading' || !token}
                onClick={handleConfirmVerification}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors shadow-sm"
              >
                {status === 'loading' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm & Activate Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
