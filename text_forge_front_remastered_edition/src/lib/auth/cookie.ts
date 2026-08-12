/**
 * 认证 cookie 管理（HttpOnly 化后的前端侧）：
 * - 真正的 refresh token 由后端在登录/刷新响应头以 HttpOnly cookie（tf_rt）下发，
 *   JS 不可读、不可写；前端刷新时凭 cookie 自动携带，后端从 cookie 读取。
 * - 本文件仅维护一个非敏感「登录标志」cookie（tf_logged_in = 1），供
 *   middleware/proxy 判断登录态。标志无凭据价值，即使被 XSS 读取也无害。
 */
export const REFRESH_COOKIE = 'tf_rt';
export const LOGIN_FLAG_COOKIE = 'tf_logged_in';

const isProduction = process.env.NODE_ENV === 'production';

export function setLoginFlag(maxAgeSeconds = 7 * 24 * 60 * 60) {
  const secure = isProduction ? '; Secure' : '';
  document.cookie = `${LOGIN_FLAG_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function getLoginFlag(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.includes(`${LOGIN_FLAG_COOKIE}=1`);
}

export function clearLoginFlag() {
  const secure = isProduction ? '; Secure' : '';
  document.cookie = `${LOGIN_FLAG_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}
