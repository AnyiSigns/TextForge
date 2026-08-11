import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { setRefreshCookie, clearRefreshCookie, getRefreshCookie } from '@/lib/auth/cookie';
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
  /** 仅在内存中维护（会话期间），持久化只保留 accessToken；刷新页面后由 cookie 兜底读取。 */
  refreshToken: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
  ) => Promise<{ email_sent: boolean }>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
}

/** 读取当前 refresh token：优先内存态，其次 cookie（刷新/登出均需兜底）。 */
function readRefreshToken(): string | null {
  return useAuthStore.getState().refreshToken ?? getRefreshCookie();
}

function applyAuth(user: UserProfile | null, accessToken: string | null, refreshToken?: string | null) {
  if (refreshToken) {
    setRefreshCookie(refreshToken);
  }
  useAuthStore.setState({
    user,
    accessToken,
    // 刷新接口只返回新 access token，不提供 refreshToken 参数时保留既有 refresh token，
    // 避免被覆盖成 null 导致登出时跳过服务端撤销。
    refreshToken: refreshToken ?? readRefreshToken(),
    isAuthenticated: !!accessToken,
  });
}

/** 等待 authStore 从持久层恢复，避免页面刚加载时请求裸奔导致 401。 */
export async function waitForHydration(): Promise<void> {
  if (useAuthStore.getState().hasHydrated) return;
  await useAuthStore.persist.rehydrate();
}

/** 并发 401 触发多次刷新时只发一个刷新请求（单飞）。 */
let refreshInFlight: Promise<boolean> | null = null;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      hasHydrated: false,

      login: async (email, password) => {
        const data = await authApi.loginApi(email, password);
        applyAuth(data.user, data.access_token, data.refresh_token);
      },

      register: async (username, email, password) => {
        return authApi.registerApi(username, email, password);
      },

      logout: async () => {
        try {
          const rt = readRefreshToken();
          const at = get().accessToken;
          if (rt) await authApi.logoutApi(rt, at ?? undefined);
        } finally {
          clearRefreshCookie();
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
          });
        }
      },

      refreshAccessToken: () => {
        if (!refreshInFlight) {
          refreshInFlight = (async () => {
            try {
              const token = readRefreshToken();
              if (!token) return false;
              const data = await authApi.refreshTokenApi(token);
              applyAuth(data.user, data.access_token);
              return true;
            } catch {
              return false;
            } finally {
              refreshInFlight = null;
            }
          })();
        }
        return refreshInFlight;
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
      // refreshToken 不持久化：仅保留 user 与 accessToken，减少 XSS 下的长期凭据暴露面。
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
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
