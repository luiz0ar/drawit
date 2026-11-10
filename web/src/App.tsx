import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { usePathname, navigate } from './lib/router';
import { useAuthStore } from './stores/authStore';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
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

    const isAuthRoute = pathname === '/login' || pathname === '/register';

    if (!isAuthenticated && !isAuthRoute) {
      navigate('/login', { replace: true });
    } else if (isAuthenticated && (isAuthRoute || pathname === '/')) {
      navigate('/boards', { replace: true });
    }
  }, [isLoading, isAuthenticated, pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-background text-foreground gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
        <span className="text-xs font-medium text-muted-foreground">
          Initializing DrawIt workspace...
        </span>
      </div>
    );
  }

  if (pathname === '/login') {
    return <LoginPage />;
  }

  if (pathname === '/register') {
    return <RegisterPage />;
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
