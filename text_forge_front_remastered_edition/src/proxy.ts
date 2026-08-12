import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { LOGIN_FLAG_COOKIE } from './lib/auth/cookie';

const PROTECTED_PREFIXES = ['/books', '/workflow', '/knowledge', '/settings'];
const AUTH_PAGES = ['/login', '/register', '/verify-email'];

function isProtected(pathname: string): boolean {
  if (pathname === '/') return true;
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // 真实 refresh token 在 HttpOnly cookie（tf_rt）中不可读；这里用非敏感登录标志判断
  const hasSession = Boolean(request.cookies.get(LOGIN_FLAG_COOKIE)?.value);

  if (hasSession && isAuthPage(pathname)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (!hasSession && isProtected(pathname)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
