// 带鉴权的 fetch：自动附带 Bearer token，并在 401 时尝试用 refresh token 刷新后重试一次。
// 行为与 apiClient 的拦截器一致，供 SSE 流式（raw fetch）接口复用，避免 access token
// 过期时流式接口直接 401 而其他接口自动恢复的不一致。
import { getAccessToken, useAuthStore } from '@/shared/stores/authStore';

/** 等待 authStore 从 IndexedDB 完成恢复，避免页面刚加载时请求裸奔导致 401。 */
async function waitForHydration(): Promise<void> {
  if (useAuthStore.getState().hasHydrated) return;
  await useAuthStore.persist.rehydrate();
}

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
