// tests/auth/apiError.test.ts
// apiError 统一解析：字符串 / 对象 / 422 数组 / 网络错误 → 具体文案。
import { describe, expect, it } from 'vitest';
import { getApiErrorMessage, getApiErrorHint, parseApiError } from '@/shared/lib/apiError';

function axiosErr(status: number, data?: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });
}

describe('apiError 解析', () => {
  it('字符串 detail 原样透出', () => {
    expect(getApiErrorMessage(axiosErr(401, { detail: '密码错误' }), '登录失败')).toBe('密码错误');
  });

  it('对象 detail 提取 message', () => {
    expect(
      getApiErrorMessage(axiosErr(400, { detail: { message: '用户名已被注册', email: 'x@y.com' } }), '注册失败'),
    ).toBe('用户名已被注册');
  });

  it('422 数组 detail 拼成可读信息', () => {
    const err = axiosErr(422, {
      detail: [{ loc: ['body', 'user_name'], msg: 'String should have at least 3 characters', type: 'string_too_short' }],
    });
    expect(getApiErrorMessage(err, '注册失败')).toBe(
      'body.user_name: String should have at least 3 characters',
    );
  });

  it('顶层 message 字段', () => {
    expect(getApiErrorMessage(axiosErr(500, { message: '服务器开小差了' }), '操作失败')).toBe(
      '服务器开小差了',
    );
  });

  it('普通 Error 透出 message', () => {
    expect(getApiErrorMessage(new Error('验证码无效或已过期'), '验证失败')).toBe('验证码无效或已过期');
  });

  it('网络错误（空消息且无 response）给出网络提示', () => {
    expect(getApiErrorMessage(new Error(''), '操作失败')).toBe('网络连接失败，请检查网络或代理设置。');
  });

  it('超时错误给出超时提示', () => {
    const err = Object.assign(new Error(''), { code: 'ECONNABORTED' });
    expect(getApiErrorMessage(err, '操作失败')).toBe('请求超时，请稍后重试。');
  });

  it('parseApiError 保留 status', () => {
    expect(parseApiError(axiosErr(401, { detail: '密码错误' })).status).toBe(401);
  });

  it('认证相关错误给出操作建议', () => {
    const err = axiosErr(401, { detail: 'API Key 无效' });
    expect(getApiErrorHint(err)).toContain('设置');
  });
});
