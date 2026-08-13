// tests/auth/authApi.test.ts
// auth.ts 各接口的错误信息解析与返回契约测试。
// 覆盖 P0-1 回归：字符串 detail、对象 detail {message,email}、422 数组 detail 均需透出具体原因。
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '@/shared/api/auth';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('auth api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('登录失败：字符串 detail 原样抛出', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(401, { detail: '密码错误' }));
    await expect(authApi.loginApi('a@b.com', 'x')).rejects.toThrow('密码错误');
  });

  it('注册失败：对象 detail 提取 message（P0-1 回归）', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, { detail: { message: '用户名已被注册', email: 'a@b.com' } }),
    );
    await expect(authApi.registerApi('u', 'a@b.com', 'p')).rejects.toThrow('用户名已被注册');
  });

  it('注册失败：422 数组 detail 拼成可读信息（P0-1 回归）', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(422, {
        detail: [
          { loc: ['body', 'user_name'], msg: 'String should have at least 3 characters', type: 'string_too_short' },
        ],
      }),
    );
    await expect(authApi.registerApi('u', 'a@b.com', 'p')).rejects.toThrow(
      'body.user_name: String should have at least 3 characters',
    );
  });

  it('注册成功：返回 email_sent（邮件未送达也可继续进验证页）', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { message: '注册成功，但验证邮件发送失败', email: 'a@b.com', email_sent: false }),
    );
    await expect(authApi.registerApi('u', 'a@b.com', 'p')).resolves.toEqual({ email_sent: false });
  });

  it('重发验证：502 错误文案透出', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(502, { detail: '验证邮件发送失败，请稍后再试' }),
    );
    await expect(authApi.resendVerifyApi('a@b.com')).rejects.toThrow('验证邮件发送失败，请稍后再试');
  });

  it('登录成功：返回 access_token / user（refresh_token 由 HttpOnly cookie 下发，不进响应体）', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        access_token: 'at',
        token_type: 'bearer',
        user: { id: 1, username: 'u', email: 'a@b.com', isVerified: true, createdAt: '' },
      }),
    );
    const data = await authApi.loginApi('a@b.com', 'p');
    expect(data.access_token).toBe('at');
    expect(data.user.username).toBe('u');
  });
});
