// 带鉴权的 fetch：自动附带 Bearer token，并在 401 时尝试用 refresh token 刷新后重试一次。
// 行为与 apiClient 的拦截器一致，供 SSE 流式（raw fetch）接口复用，避免 access token
// 过期时流式接口直接 401 而其他接口自动恢复的不一致。
import { getAccessToken, useAuthStore, waitForHydration } from '@/shared/stores/authStore';

export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  await waitForHydration();
  const headers = new Headers(init.headers);
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(url, { ...init, headers });
  if (res.status !== 401) return res;

  const ok = await useAuthStore.getState().refreshAccessToken();
  if (!ok) return res;
  const newToken = useAuthStore.getState().accessToken;
  if (!newToken) return res;

  headers.set('Authorization', `Bearer ${newToken}`);
  return fetch(url, { ...init, headers });
}
