import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { setLoginFlag, clearLoginFlag, getLoginFlag } from '@/lib/auth/cookie';
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
  /** 仅在内存中维护（会话期间），且不持久化；刷新页面后由后端 HttpOnly cookie 换取新的 access token。 */
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

function applyAuth(user: UserProfile | null, accessToken: string | null, refreshToken?: string | null) {
  // refresh token 由后端在响应头以 HttpOnly cookie 下发；前端仅维护非敏感登录标志
  // （供 middleware/proxy 判断登录态），不再写入任何凭据到 JS 可读存储。
  if (user) {
    setLoginFlag();
  }
  useAuthStore.setState({
    user,
    accessToken,
    // 刷新接口只返回新 access token，不提供 refreshToken 参数时保留既有 refresh token，
    // 避免被覆盖成 null 导致登出时跳过服务端撤销。
    refreshToken: refreshToken ?? useAuthStore.getState().refreshToken,
    isAuthenticated: !!accessToken,
  });
}

/** 等待 authStore 从持久层恢复，避免页面刚加载时请求裸奔导致 401。 */
export async function waitForHydration(): Promise<void> {
  if (useAuthStore.getState().hasHydrated) {
    await hydrationRefresh;
    return;
  }
  await useAuthStore.persist.rehydrate();
  await hydrationRefresh;
}

/** F5 后从 refresh cookie 换取 access token 的异步任务（rehydrate 期间启动，hydration 等待其完成）。 */
let hydrationRefresh: Promise<void> | null = null;

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
          const at = get().accessToken;
          // refresh token 由后端从 HttpOnly cookie 读取；access token 仍传 body 供黑名单。
          await authApi.logoutApi(at ?? undefined);
        } finally {
          clearLoginFlag();
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
              // HttpOnly cookie 自动携带 refresh token，前端无需也不可读取
              const data = await authApi.refreshTokenApi();
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
      // accessToken 与 refreshToken 均不持久化（XSS 不可读）：
      // accessToken 仅在内存中使用，F5 后由后端 HttpOnly refresh cookie 换取；
      // 登录标志（非敏感）写入独立 cookie 供 proxy 判断登录态。
      partialize: (state) => ({
        // 仅持久化非敏感的 user 信息，避免在 IndexedDB 暴露短期/长期凭据。
        user: state.user,
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
          hydrationRefresh = Promise.resolve();
          return;
        }
        // 乐观认为有 user 且存在登录标志 cookie 即已登录，避免 F5 瞬间被守卫误判未登录。
        // 真实 refresh token 在 HttpOnly cookie 中，JS 不可读，刷新时自动携带。
        const hasSession = !!(getLoginFlag() && state?.user);
        useAuthStore.setState({ hasHydrated: true, isAuthenticated: hasSession });
        if (hasSession) {
          // accessToken 未持久化：用 refresh cookie 换取新的 access token，失败则清空会话。
          hydrationRefresh = useAuthStore.getState().refreshAccessToken().then((ok) => {
            if (!ok) {
              useAuthStore.setState({ user: null, isAuthenticated: false });
            }
          });
        } else {
          useAuthStore.setState({ isAuthenticated: false });
          hydrationRefresh = Promise.resolve();
        }
      },
    },
  ),
);

export function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}
