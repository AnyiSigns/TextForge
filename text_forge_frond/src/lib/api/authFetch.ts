// 统一的认证 fetch 封装：所有需要携带登录态（Bearer token + cookie）的
// 原生 fetch 调用（SSE 流式、角色对话流等）都应走这里，而不是在每个调用点
// 手拼 Authorization 头，从而保证与 apiClient 拦截器的认证逻辑一致。
import { API_URL } from '@/lib/config/env';
import { useAuthStore } from '@/lib/stores/authStore';

export async function authFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers(init.headers);
  headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
}
