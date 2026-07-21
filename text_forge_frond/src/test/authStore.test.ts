import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore, getAccessToken } from '@/lib/stores/authStore';
import type { User } from '@/lib/stores/authStore';

vi.mock('@/lib/auth/cookie', () => ({
  setRefreshCookie: vi.fn(),
  clearRefreshCookie: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  default: {
    post: vi.fn().mockResolvedValue({}),
  },
}));

describe('11.1 单元测试 - authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoggedIn: false,
      hasHydrated: false,
    });
  });

  describe('setAuth', () => {
    it('设置用户认证信息', () => {
      const user: User = {
        id: 'u1',
        username: 'testuser',
        email: 'test@example.com',
        avatar: '',
        isVerified: true,
        createdAt: new Date().toISOString(),
      };

      useAuthStore.getState().setAuth(user, 'token123', 'refresh123');

      expect(useAuthStore.getState().user).toEqual(user);
      expect(useAuthStore.getState().accessToken).toBe('token123');
      expect(useAuthStore.getState().refreshToken).toBe('refresh123');
      expect(useAuthStore.getState().isLoggedIn).toBe(true);
    });

    it('无refreshToken时不设置', () => {
      const user: User = {
        id: 'u1',
        username: 'testuser',
        email: 'test@example.com',
        avatar: '',
        isVerified: true,
        createdAt: new Date().toISOString(),
      };

      useAuthStore.getState().setAuth(user, 'token123');

      expect(useAuthStore.getState().refreshToken).toBe(null);
    });
  });

  describe('updateUser', () => {
    it('更新用户信息', () => {
      const user: User = {
        id: 'u1',
        username: 'testuser',
        email: 'test@example.com',
        avatar: '',
        isVerified: true,
        createdAt: new Date().toISOString(),
      };

      useAuthStore.getState().setAuth(user, 'token');
      useAuthStore.getState().updateUser({ username: 'newname' });

      expect(useAuthStore.getState().user?.username).toBe('newname');
      expect(useAuthStore.getState().user?.email).toBe('test@example.com');
    });
  });

  describe('logout', async () => {
    it('清除认证状态', async () => {
      const user: User = {
        id: 'u1',
        username: 'testuser',
        email: 'test@example.com',
        avatar: '',
        isVerified: true,
        createdAt: new Date().toISOString(),
      };

      useAuthStore.getState().setAuth(user, 'token', 'refresh');
      await useAuthStore.getState().logout();

      expect(useAuthStore.getState().user).toBe(null);
      expect(useAuthStore.getState().accessToken).toBe(null);
      expect(useAuthStore.getState().isLoggedIn).toBe(false);
    });

    it('发送 refresh_token 到后端', async () => {
      const user: User = {
        id: 'u1',
        username: 'testuser',
        email: 'test@example.com',
        avatar: '',
        isVerified: true,
        createdAt: new Date().toISOString(),
      };

      useAuthStore.getState().setAuth(user, 'token', 'my-refresh-token');
      await useAuthStore.getState().logout();

      const apiClient = (await import('@/lib/api/client')).default;
      expect(apiClient.post).toHaveBeenCalledWith('/api/auth/logout', { refresh_token: 'my-refresh-token' });
    });
  });

  describe('getAccessToken', () => {
    it('获取当前访问令牌', () => {
      useAuthStore.getState().setAccessToken('mytoken');
      expect(getAccessToken()).toBe('mytoken');
    });

    it('无令牌时返回null', () => {
      expect(getAccessToken()).toBe(null);
    });
  });

  describe('setHasHydrated', () => {
    it('设置 hydration 状态', () => {
      useAuthStore.getState().setHasHydrated(true);
      expect(useAuthStore.getState().hasHydrated).toBe(true);
    });
  });
});
