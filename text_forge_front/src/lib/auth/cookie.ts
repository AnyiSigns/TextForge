// src/lib/auth/cookie.ts
export const REFRESH_COOKIE = 'tf_rt';

const isProduction = process.env.NODE_ENV === 'production';

export function setRefreshCookie(token: string, maxAgeSeconds = 7 * 24 * 60 * 60) {
  const secure = isProduction ? '; Secure' : '';
  document.cookie = `${REFRESH_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearRefreshCookie() {
  const secure = isProduction ? '; Secure' : '';
  document.cookie = `${REFRESH_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}
