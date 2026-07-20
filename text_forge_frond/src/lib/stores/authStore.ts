// src/lib/stores/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setRefreshCookie, clearRefreshCookie } from '@/lib/auth/cookie';
import apiClient from '@/lib/api/client';
import { API_URL } from '@/lib/config/env';
import { useSettingsStore } from '@/features/settings';
export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  isVerified: boolean;
  createdAt: string;
}

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoggedIn: boolean;
  hasHydrated: boolean;

  setAuth: (user: User, accessToken: string, refreshToken?: string | null) => void;
  updateUser: (data: Partial<User>) => void;
  logout: () => void;
  setAccessToken: (token: string) => void;
  setHasHydrated: (v: boolean) => void;
  restoreFromCookie: () => Promise<boolean>;
}

// 登录后 10 秒静默预热本地向量检索模型（后台下载，不阻塞 UI）。
// 预热用户「AI 偏好」中选中的精度档，而非固定默认档。
// 在 setAuth（主动登录）与 onRehydrateStorage（刷新后恢复登录态）两处触发。
let prewarmTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleEmbedPrewarm() {
  if (prewarmTimer) return;
  prewarmTimer = setTimeout(() => {
    prewarmTimer = null;
    import('@/lib/rag/embed')
      .then((m) => {
        try {
          // 先切到用户选中档，再预热该档（避免预热了默认档却用不上）
          const { embedTierId } = useSettingsStore.getState();
          m.setEmbedTier(embedTierId);
        } catch {
          /* 忽略，prewarm 内部会用默认档 */
        }
        return m.prewarmEmbed();
      })
      .catch(() => {});
  }, 10_000);
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoggedIn: false,
      hasHydrated: false,

      setHasHydrated: (v) => set({ hasHydrated: v }),

      setAuth: (user, accessToken, refreshToken) => {
        if (refreshToken) {
          setRefreshCookie(refreshToken);
        }
        set({ user, accessToken, refreshToken: refreshToken ?? null, isLoggedIn: !!accessToken });
        scheduleEmbedPrewarm();
      },

      updateUser: (data) => set((state) => ({
        user: state.user ? { ...state.user, ...data } : null
      })),

      logout: async () => {
        try {
          await apiClient.post('/api/auth/logout').catch(() => {});
        } finally {
          clearRefreshCookie();
          set({ user: null, accessToken: null, refreshToken: null, isLoggedIn: false });
        }
      },

      setAccessToken: (token) => set({ accessToken: token, isLoggedIn: !!token }),

      // cookie 存在但前端 accessToken 缺失（两套登录态不一致）时，
      // 用 refresh 接口恢复前端登录态，避免 proxy 放行 / 而 layout 误判未登录
      // 造成的「加载 ↔ 跳转」死循环。失败则保持未登录，由 layout 跳登录页。
      restoreFromCookie: async () => {
        try {
          const res = await fetch(`${API_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            cache: 'no-store',
          });
          if (!res.ok) return false;
          const data = (await res.json()) as { access_token?: string; user?: User };
          const token = data.access_token;
          if (!token) return false;
          set({ accessToken: token, isLoggedIn: true });
          if (data.user) set({ user: data.user });
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      // 版本化 key：使旧的脏 localStorage（含持久化 isLoggedIn:true 但无 token）
      // 自动失效，老用户首次加载落到干净初始态，不再陷入登录/首页重定向死循环。
      name: 'auth-storage-v2',
      // 不持久化 isLoggedIn：登录态应由 accessToken 派生，避免 localStorage 残留"假登录态"
      // 与已失效的 cookie/token 冲突，导致刷新后重定向链卡死（清除浏览器数据才能恢复）。
      partialize: (state) => ({ user: state.user, accessToken: state.accessToken }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          // 持久化数据损坏：重置为未登录，避免永久卡在加载态
          useAuthStore.setState({ hasHydrated: true, isLoggedIn: false, accessToken: null, user: null });
          return;
        }
        const loggedIn = !!state?.accessToken;
        useAuthStore.setState({ hasHydrated: true, isLoggedIn: loggedIn });
        if (loggedIn) scheduleEmbedPrewarm();
      },
    }
  )
);

// 客户端显式触发 rehydrate：在 SSR/CSR 水合阶段，zustand persist 在某些情况下
// 不会自动从 localStorage 恢复（尤其是路由组 layout 异步水合竞态），导致
// isLoggedIn 停留在初始 false，进而被 dashboard layout 误判为"未登录"而硬跳走、
// 表现为刷新即被踢/转圈。这里在浏览器端强制 rehydrate 一次，并在完成后标记
// hasHydrated；配合 layout 的 1s 超时兜底，避免永久卡在加载态。
if (typeof window !== 'undefined') {
  void useAuthStore.persist.rehydrate();
}

export function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}
