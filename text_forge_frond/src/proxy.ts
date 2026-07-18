import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { handleDevApi } from '@/mocks';

const REFRESH_COOKIE = 'tf_rt';

const PROTECTED_ROOTS = [
  '/',
  '/projects',
  '/characters',
  '/assets',
  '/tasks',
  '/knowledge',
  '/api-keys',
  '/settings',
];

const AUTH_EXEMPT_ROUTES = [
  '/login',
  '/register',
  '/verify-email',
];

function isProtected(pathname: string): boolean {
  if (pathname === '/') return true;
  if (PROTECTED_ROOTS.includes(pathname)) return true;
  return PROTECTED_ROOTS.some((root) => pathname.startsWith(root + '/'));
}

function isAuthExempt(pathname: string): boolean {
  return AUTH_EXEMPT_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );
}

function redirectToLogin(request: NextRequest, pathname: string) {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', pathname);
  const res = NextResponse.redirect(loginUrl);
  res.cookies.delete(REFRESH_COOKIE);
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasRefreshCookie = request.cookies.has(REFRESH_COOKIE);

  // 开发期 mock：后端未就绪时，让前端本地跑通登录与各列表页
  if (process.env.NODE_ENV !== 'production' && pathname.startsWith('/api/')) {
    return handleDevApi(request);
  }

  if (isAuthExempt(pathname)) {
    // 登录/注册/验证页永远放行，避免「已登录却误判未登录」时
    // 在 /login 与 / 之间反复 302 形成死循环（跳转竞争交由前端处理）。
    return NextResponse.next();
  }

  // 乐观守卫：仅依据 tf_rt cookie 是否存在判断（与官方认证文档一致，
  // proxy 不应在此发起网络请求验证 session，否则后端未就绪/偶发 401
  // 会把已登录用户踢到登录页，与前端 layout 形成重定向死循环）。
  // session 真实性由前端的 restoreFromCookie / apiClient 拦截器在请求时校验。
  if (isProtected(pathname) && !hasRefreshCookie) {
    return redirectToLogin(request, pathname);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
