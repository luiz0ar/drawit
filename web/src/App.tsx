import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { usePathname, navigate } from './lib/router';
import { useAuthStore } from './stores/authStore';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { CheckEmailPage } from './features/auth/CheckEmailPage';
import { VerifyEmailPage } from './features/auth/VerifyEmailPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { Whiteboard } from './canvas/Whiteboard';

export const App: React.FC = () => {
  const pathname = usePathname();
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (isLoading) return;

    const isAuthRoute =
      pathname === '/login' ||
      pathname === '/register' ||
      pathname === '/check-email' ||
      pathname === '/verify-email';

    if (!isAuthenticated && !isAuthRoute) {
      navigate('/login', { replace: true });
    } else if (isAuthenticated && (isAuthRoute || pathname === '/')) {
      navigate('/boards', { replace: true });
    }
  }, [isLoading, isAuthenticated, pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-background text-foreground gap-4">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-[#0f40bd] flex items-center justify-center shadow-xl shadow-blue-500/20 p-2.5 ring-4 ring-[#0f40bd]/15">
            <img
              src="/brand/cup-transparent.png"
              alt="Drawit"
              className="w-11 h-11 object-contain animate-pulse"
            />
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#84ff00] opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-[#84ff00] border-2 border-background" />
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          <span>Initializing Drawit workspace...</span>
        </div>
      </div>
    );
  }

  if (pathname === '/login') {
    return <LoginPage />;
  }

  if (pathname === '/register') {
    return <RegisterPage />;
  }

  if (pathname === '/check-email') {
    return <CheckEmailPage />;
  }

  if (pathname === '/verify-email') {
    return <VerifyEmailPage />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (pathname.startsWith('/boards/')) {
    const boardId = pathname.replace('/boards/', '').split('/')[0];
    return <Whiteboard boardId={boardId} />;
  }

  return <DashboardPage />;
};
