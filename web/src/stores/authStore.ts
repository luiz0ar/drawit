import { create } from 'zustand';
import { AuthApi, UserProfile, setAccessToken, setOnUnauthorized } from '../lib/api';
import { navigate } from '../lib/router';

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => {
  setOnUnauthorized(() => {
    setAccessToken(null);
    set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
    navigate('/login', { replace: true });
  });

  return {
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: true,

    login: async (username: string, password: string) => {
      const res = await AuthApi.login(username, password);
      set({
        user: res.user,
        accessToken: res.access_token,
        isAuthenticated: true,
        isLoading: false,
      });
    },

    register: async (username: string, password: string) => {
      const res = await AuthApi.register(username, password);
      set({
        user: res.user,
        accessToken: res.access_token,
        isAuthenticated: true,
        isLoading: false,
      });
    },

    logout: async () => {
      await AuthApi.logout();
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
      });
      navigate('/login', { replace: true });
    },

    logoutAll: async () => {
      await AuthApi.logoutAll();
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
        isLoading: false,
      });
      navigate('/login', { replace: true });
    },

    checkAuth: async () => {
      set({ isLoading: true });
      try {
        const res = await AuthApi.refresh();
        set({
          user: res.user,
          accessToken: res.access_token,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (_unauthenticated) {
        // User session is unauthenticated or cookie expired; reset auth state safely
        setAccessToken(null);
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    },
  };
});

