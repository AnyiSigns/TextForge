export const REFRESH_COOKIE = 'tf_rt';

const isProduction = process.env.NODE_ENV === 'production';

export function setRefreshCookie(token: string, maxAgeSeconds = 7 * 24 * 60 * 60) {
  const secure = isProduction ? '; Secure' : '';
  document.cookie = `${REFRESH_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function getRefreshCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(^| )${REFRESH_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

export function clearRefreshCookie() {
  const secure = isProduction ? '; Secure' : '';
  document.cookie = `${REFRESH_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}
