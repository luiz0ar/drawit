import React from 'react';
import { useTheme } from './context/ThemeContext';
import { useI18n } from './context/I18nContext';

export const App: React.FC = () => {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground transition-colors duration-200">
      <header className="absolute top-4 right-4 flex items-center gap-3">
        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="px-3 py-1.5 text-sm font-medium border rounded-md shadow-sm hover:bg-muted transition-colors"
          data-testid="theme-toggle-btn"
        >
          {resolvedTheme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
      </header>

      <main className="text-center max-w-lg space-y-4">
        <h1 className="text-4xl font-extrabold tracking-tight">
          {t('app.name')}
        </h1>
        <p className="text-muted-foreground text-lg">
          {t('app.tagline')}
        </p>

        <div className="p-4 border rounded-lg bg-card shadow-sm space-y-2 text-sm text-left">
          <div className="flex justify-between">
            <span className="font-semibold text-muted-foreground">Frontend Status:</span>
            <span className="text-emerald-500 font-medium">✓ Ready (React + Vite + shadcn/ui)</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-muted-foreground">Active Theme:</span>
            <span className="capitalize">{theme} ({resolvedTheme})</span>
          </div>
        </div>
      </main>
    </div>
  );
};
