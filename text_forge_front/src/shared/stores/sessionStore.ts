// src/shared/stores/sessionStore.ts
// 增量迁移 P4：合并 authStore + userStore 的会话/身份认证状态。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createIdbStorage } from '@/lib/storage/zustandIdb';
import { setRefreshCookie, clearRefreshCookie } from '@/lib/auth/cookie';
import apiClient from '@/shared/lib/apiClient';
import { API_URL } from '@/lib/config/env';
import { useSettingsStore } from '@/features/settings';

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  isVerified: boolean;
  createdAt: string;
}

interface SessionState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  hasHydrated: boolean;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchCurrentUser: () => Promise<void>;
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>;
  setAuth: (user: UserProfile, accessToken: string, refreshToken?: string | null) => void;
  updateUser: (data: Partial<UserProfile>) => void;
  setAccessToken: (token: string) => void;
  restoreFromCookie: () => Promise<boolean>;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setHasHydrated: (v: boolean) => void;
}

// 登录后 10 秒静默预热本地向量检索模型（后台下载，不阻塞 UI）。
// 预热用户「AI 偏好」中选中的精度档，而非固定默认档。
let prewarmTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleEmbedPrewarm() {
  if (prewarmTimer) return;
  prewarmTimer = setTimeout(() => {
    prewarmTimer = null;
    import('@/lib/rag/embed')
      .then((m) => {
        try {
          const { embedTierId } = useSettingsStore.getState();
          m.setEmbedTier(embedTierId);
        } catch {
          // 忽略，prewarm 内部会用默认档
        }
        return m.prewarmEmbed();
      })
      .catch(() => {});
  }, 10_000);
}

function applyAuth(
  user: UserProfile | null,
  accessToken: string | null,
  refreshToken?: string | null
) {
  if (refreshToken) {
    setRefreshCookie(refreshToken);
  }
  useSessionStore.setState({
    user,
    accessToken,
    refreshToken: refreshToken ?? null,
    isAuthenticated: !!accessToken,
  });
  scheduleEmbedPrewarm();
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      hasHydrated: false,

      setHasHydrated: (v) => set({ hasHydrated: v }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),

      setAuth: (user, accessToken, refreshToken) => {
        applyAuth(user, accessToken, refreshToken);
      },
      updateUser: (data) => set((state) => ({
        user: state.user ? { ...state.user, ...data } : null,
      })),
      setAccessToken: (token) => set({ accessToken: token, isAuthenticated: !!token }),
      restoreFromCookie: async () => {
        return refreshToken();
      },

      // 登录：复制自 login-form.tsx 的 API 模式
      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            const detail: string = data.detail || '';
            throw new Error(detail || '登录失败');
          }

          const data = await res.json() as {
            access_token: string;
            refresh_token?: string;
            user: UserProfile;
          };

          applyAuth(data.user, data.access_token, data.refresh_token);

          // 登录后触发全量同步（匹配 login-form.tsx 行为）
          const { syncAllStores } = await import('@/lib/storage/sync');
          syncAllStores().catch(() => {});
        } catch (e) {
          set({ error: e instanceof Error ? e.message : '登录失败' });
          throw e;
        } finally {
          set({ isLoading: false });
        }
      },

      // 注册：复制自 register/page.tsx 的 API 模式
      register: async (email, password, name) => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: name, email, password }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            const detail: string = data.detail || '';
            throw new Error(detail || '注册失败');
          }
        } catch (e) {
          set({ error: e instanceof Error ? e.message : '注册失败' });
          throw e;
        } finally {
          set({ isLoading: false });
        }
      },

      // 登出：复制自 authStore.logout
      logout: async () => {
        set({ isLoading: true, error: null });
        try {
          const refreshTokenVal = useSessionStore.getState().refreshToken;
          if (refreshTokenVal) {
            await fetch(`${API_URL}/api/auth/logout`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: refreshTokenVal }),
              credentials: 'include',
            }).catch(() => {});
          }
        } finally {
          clearRefreshCookie();
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            error: null,
          });
          set({ isLoading: false });
        }
      },

      // 拉取当前用户信息（后端暂无专用 GET 端点，通过 refresh 恢复）
      fetchCurrentUser: async () => {
        set({ isLoading: true, error: null });
        try {
          const ok = await refreshToken();
          if (!ok) throw new Error('获取用户信息失败');
        } catch (e) {
          set({ error: e instanceof Error ? e.message : '获取用户信息失败' });
          throw e;
        } finally {
          set({ isLoading: false });
        }
      },

      // 更新用户资料（本地乐观更新 + 后台同步）
      updateProfile: async (patch) => {
        set({ isLoading: true, error: null });
        try {
          const body: Record<string, unknown> = {};
          if (patch.username !== undefined) body.username = patch.username;
          if (patch.email !== undefined) body.email = patch.email;
          const res = await apiClient.put<{ user: UserProfile }>(
            '/api/user/profile',
            body,
          );
          const updated = res.data.user ?? (res.data as unknown as UserProfile);
          set((s) => ({
            user: s.user ? { ...s.user, ...updated } : updated,
          }));
        } catch (e) {
          set({ error: e instanceof Error ? e.message : '更新用户信息失败' });
          throw e;
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'session-storage',
      storage: createIdbStorage(),
      // 不持久化 refreshToken：刷新令牌存于 cookie，避免 IndexedDB 残留陨旧令牌
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          // 持久化数据损坏：重置为未登录，避免永久卡在加载态
          useSessionStore.setState({
            hasHydrated: true,
            isAuthenticated: false,
            accessToken: null,
            refreshToken: null,
            user: null,
          });
          return;
        }
        const isAuth = !!state?.accessToken;
        useSessionStore.setState({ hasHydrated: true, isAuthenticated: isAuth });
        if (isAuth) scheduleEmbedPrewarm();
      },
    }
  )
);

// 刷新访问令牌：读取存储的 refresh token（state 或 cookie），调用后端刷新接口。
// 作为独立导出函数（类似 authStore 的 getAccessToken），避免与 `refreshToken` 状态属性命名冲突。
export async function refreshToken(): Promise<boolean> {
  try {
    let token = useSessionStore.getState().refreshToken;
    if (!token) {
      const match = document.cookie.match(new RegExp('(^| )tf_rt=([^;]+)'));
      if (!match) return false;
      token = decodeURIComponent(match[2]);
    }

    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: token }),
      credentials: 'include',
      cache: 'no-store',
    });

    if (!res.ok) return false;

    const data = await res.json() as {
      access_token?: string;
      refresh_token?: string;
      user?: UserProfile;
    };

    const newToken = data.access_token;
    if (!newToken) return false;

    applyAuth(data.user ?? null, newToken, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

// 客户端显式触发 rehydrate：在 SSR/CSR 水合阶段，zustand persist 在某些情况下
// 不会自动从 IndexedDB 恢复，导致 isLoggedIn 停留在初始 false。
if (typeof window !== 'undefined') {
  void useSessionStore.persist.rehydrate();
}

export function getAccessToken(): string | null {
  return useSessionStore.getState().accessToken;
}
