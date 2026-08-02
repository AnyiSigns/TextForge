import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { setRefreshCookie, clearRefreshCookie } from '@/lib/auth/cookie';
import * as authApi from '@/shared/api/auth';

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  avatar?: string;
  isVerified: boolean;
  createdAt: string;
}

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasHydrated: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setAuth: (user: UserProfile, accessToken: string, refreshToken: string) => void;
  setAccessToken: (token: string) => void;
  refreshAccessToken: () => Promise<boolean>;
  setHasHydrated: (v: boolean) => void;
}

function applyAuth(user: UserProfile | null, accessToken: string | null, refreshToken?: string | null) {
  if (refreshToken) {
    setRefreshCookie(refreshToken);
  }
  useAuthStore.setState({
    user,
    accessToken,
    refreshToken: refreshToken ?? null,
    isAuthenticated: !!accessToken,
  });
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      hasHydrated: false,

      setHasHydrated: (v) => set({ hasHydrated: v }),
      setAccessToken: (token) => set({ accessToken: token, isAuthenticated: !!token }),

      setAuth: (user, accessToken, refreshToken) => {
        applyAuth(user, accessToken, refreshToken);
      },

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const data = await authApi.loginApi(email, password);
          applyAuth(data.user, data.access_token, data.refresh_token);
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (username, email, password) => {
        set({ isLoading: true });
        try {
          await authApi.registerApi(username, email, password);
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          const rt = get().refreshToken;
          if (rt) await authApi.logoutApi(rt);
        } finally {
          clearRefreshCookie();
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      refreshAccessToken: async () => {
        try {
          let token = get().refreshToken;
          if (!token) {
            const match = document.cookie.match(new RegExp('(^| )tf_rt=([^;]+)'));
            if (!match) return false;
            token = decodeURIComponent(match[2]);
          }
          const data = await authApi.refreshTokenApi(token);
          applyAuth(data.user, data.access_token);
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        let dbPromise: Promise<IDBDatabase> | null = null;
        const getDb = (): Promise<IDBDatabase> => {
          if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
              const req = indexedDB.open('text-forge-auth', 99);
              req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains('keyval')) {
                  req.result.createObjectStore('keyval');
                }
              };
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => reject(req.error);
            });
          }
          return dbPromise;
        };
        return {
          getItem: async (key: string) => {
            try {
              const db = await getDb();
              return new Promise((resolve) => {
                const tx = db.transaction('keyval', 'readonly');
                const req = tx.objectStore('keyval').get(key);
                req.onsuccess = () => resolve(req.result ?? null);
                req.onerror = () => resolve(null);
              });
            } catch {
              return null;
            }
          },
          setItem: async (key: string, value: string) => {
            try {
              const db = await getDb();
              const tx = db.transaction('keyval', 'readwrite');
              const store = tx.objectStore('keyval');
              return new Promise<void>((resolve) => {
                const req = store.put(value, key);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
              });
            } catch {
              /* ignore */
            }
          },
          removeItem: async (key: string) => {
            try {
              const db = await getDb();
              const tx = db.transaction('keyval', 'readwrite');
              const store = tx.objectStore('keyval');
              return new Promise<void>((resolve) => {
                const req = store.delete(key);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
              });
            } catch {
              /* ignore */
            }
          },
        };
      }),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          useAuthStore.setState({
            hasHydrated: true,
            isAuthenticated: false,
            accessToken: null,
            refreshToken: null,
            user: null,
          });
          return;
        }
        useAuthStore.setState({ hasHydrated: true, isAuthenticated: !!state?.accessToken });
      },
    },
  ),
);

export function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}
