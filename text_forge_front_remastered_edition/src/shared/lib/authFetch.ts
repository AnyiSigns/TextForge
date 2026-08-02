import { useAuthStore } from '@/shared/stores/authStore';

export async function authFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  });
}
