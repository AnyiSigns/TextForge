// tests/auth/userApi.test.ts
// user.ts 账户注销接口契约测试：DELETE /user/account 透传密码并附带当前 access token。
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { authGetStateMock, delMock } = vi.hoisted(() => ({
  authGetStateMock: vi.fn<() => { accessToken: string | null }>(() => ({ accessToken: 'at-test' })),
  delMock: vi.fn(),
}));

vi.mock('@/shared/stores/authStore', () => ({
  getAccessToken: () => 'test-token',
  waitForHydration: async () => {},
  useAuthStore: {
    getState: authGetStateMock,
  },
}));

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    delete: (...a: unknown[]) => delMock(...a),
  },
  extractApiDetail: () => '',
}));

import * as userApi from '@/shared/api/user';

describe('user api 注销', () => {
  beforeEach(() => {
    delMock.mockReset();
    delMock.mockResolvedValue({ data: { message: '账号已注销' } });
    authGetStateMock.mockReturnValue({ accessToken: 'at-test' });
  });

  it('注销成功：请求 DELETE /user/account 并携带密码与 access_token', async () => {
    await userApi.deleteAccount('my-password');
    expect(delMock).toHaveBeenCalledTimes(1);
    const [url, config] = delMock.mock.calls[0] as [string, { data: { password: string; access_token: string | null } }];
    expect(url).toBe('/user/account');
    expect(config.data.password).toBe('my-password');
    expect(config.data.access_token).toBe('at-test');
  });

  it('无 accessToken 时 access_token 传 null', async () => {
    authGetStateMock.mockReturnValue({ accessToken: null });
    await userApi.deleteAccount('pwd');
    const [, config] = delMock.mock.calls[0] as [string, { data: { access_token: string | null } }];
    expect(config.data.access_token).toBeNull();
  });

  it('注销失败：拒绝错误抛给调用方', async () => {
    delMock.mockRejectedValue({ response: { status: 400, data: { detail: '密码错误' } } });
    await expect(userApi.deleteAccount('wrong')).rejects.toMatchObject({
      response: { status: 400 },
    });
  });
});
