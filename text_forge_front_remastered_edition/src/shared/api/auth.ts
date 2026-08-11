import type { UserProfile } from '@/shared/stores/authStore';
import { API_BASE, extractApiDetail } from './client';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserProfile;
}

interface RefreshResponse {
  access_token: string;
  user: UserProfile;
}

/** 从非 2xx 响应提取后端具体错误原因（字符串 / 422 数组 / {message} 对象），兜底文案。 */
async function throwApiError(res: Response, fallback: string): Promise<never> {
  const detail = await extractApiDetail(res);
  throw new Error(detail ?? fallback);
}

export async function loginApi(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  });
  if (!res.ok) await throwApiError(res, '登录失败');
  return res.json();
}

/** 注册成功后的邮件发送结果（后端可能因 SMTP 故障发信失败但仍已建号）。 */
export async function registerApi(
  username: string,
  email: string,
  password: string,
): Promise<{ email_sent: boolean }> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  if (!res.ok) await throwApiError(res, '注册失败');
  const data = (await res.json()) as { email_sent?: boolean };
  return { email_sent: !!data.email_sent };
}

export async function refreshTokenApi(refreshToken: string): Promise<RefreshResponse> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) await throwApiError(res, '令牌刷新失败');
  return res.json();
}

export async function logoutApi(refreshToken: string, accessToken?: string): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken, access_token: accessToken ?? null }),
    credentials: 'include',
  }).catch(() => {});
}

export async function resendVerifyApi(email: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/resend-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) await throwApiError(res, '发送失败');
}

export async function verifyEmailApi(email: string, code: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  if (!res.ok) await throwApiError(res, '验证失败');
}
