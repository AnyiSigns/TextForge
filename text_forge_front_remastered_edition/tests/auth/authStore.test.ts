// tests/auth/authStore.test.ts
// authStore 回归测试：
//  - P0-3：刷新后 refreshToken 不被覆盖为 null，登出仍能带上服务端撤销
//  - P1-8：并发刷新单飞（只发一次刷新请求）
//  - refreshToken 不再持久化（XSS 暴露面收窄）
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/shared/stores/authStore';

vi.mock('@/shared/api/auth', () => ({
  loginApi: vi.fn(),
  registerApi: vi.fn(),
  refreshTokenApi: vi.fn(),
  logoutApi: vi.fn(),
  resendVerifyApi: vi.fn(),
  verifyEmailApi: vi.fn(),
}));

vi.mock('@/lib/auth/cookie', () => ({
  setRefreshCookie: vi.fn(),
  getRefreshCookie: vi.fn(() => null),
  clearRefreshCookie: vi.fn(),
}));

import * as authApi from '@/shared/api/auth';
import { clearRefreshCookie, getRefreshCookie, setRefreshCookie } from '@/lib/auth/cookie';

const user = { id: 1, username: 'u', email: 'a@b.com', isVerified: true, createdAt: '2026-01-01' };

async function resetStore() {
  await useAuthStore.persist.rehydrate();
  useAuthStore.setState({
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    hasHydrated: true,
  });
}

describe('authStore', () => {
  beforeEach(async () => {
    await resetStore();
    vi.clearAllMocks();
  });

  it('登录写入 accessToken/refreshToken 并设置 cookie', async () => {
    vi.mocked(authApi.loginApi).mockResolvedValue({
      access_token: 'at',
      refresh_token: 'rt',
      token_type: 'bearer',
      user,
    });

    await useAuthStore.getState().login('a@b.com', 'p');

    const s = useAuthStore.getState();
    expect(s.accessToken).toBe('at');
    expect(s.refreshToken).toBe('rt');
    expect(s.isAuthenticated).toBe(true);
    expect(setRefreshCookie).toHaveBeenCalledWith('rt');
  });

  it('刷新后保留 refreshToken（P0-3 回归）', async () => {
    useAuthStore.setState({
      user,
      accessToken: 'at',
      refreshToken: 'rt',
      isAuthenticated: true,
    });
    vi.mocked(authApi.refreshTokenApi).mockResolvedValue({ access_token: 'at2', user });

    const ok = await useAuthStore.getState().refreshAccessToken();

    expect(ok).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe('at2');
    expect(useAuthStore.getState().refreshToken).toBe('rt');
  });

  it('刷新后登出仍调用 logoutApi（cookie 兜底，P0-3 回归）', async () => {
    useAuthStore.setState({
      user,
      accessToken: 'at',
      refreshToken: null,
      isAuthenticated: true,
    });
    vi.mocked(getRefreshCookie).mockReturnValue('rt-cookie');

    await useAuthStore.getState().logout();

    expect(authApi.logoutApi).toHaveBeenCalledWith('rt-cookie', 'at');
    expect(clearRefreshCookie).toHaveBeenCalled();
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(false);
    expect(s.accessToken).toBeNull();
    expect(s.refreshToken).toBeNull();
  });

  it('并发刷新只发一次请求（单飞）', async () => {
    useAuthStore.setState({
      user,
      accessToken: 'at',
      refreshToken: 'rt',
      isAuthenticated: true,
    });
    let resolve!: (v: { access_token: string; user: typeof user }) => void;
    vi.mocked(authApi.refreshTokenApi).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const p1 = useAuthStore.getState().refreshAccessToken();
    const p2 = useAuthStore.getState().refreshAccessToken();
    expect(authApi.refreshTokenApi).toHaveBeenCalledTimes(1);

    resolve({ access_token: 'at2', user });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe('at2');
  });

  it('无 refresh token（含 cookie）时刷新返回 false 且不发请求', async () => {
    vi.mocked(getRefreshCookie).mockReturnValue(null);
    const ok = await useAuthStore.getState().refreshAccessToken();
    expect(ok).toBe(false);
    expect(authApi.refreshTokenApi).not.toHaveBeenCalled();
  });
});
