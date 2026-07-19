import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { handleDevApi } from '@/mocks';

const REFRESH_COOKIE = 'tf_rt';

// 开发期：浏览器端 transformers.js 拉取模型权重时，国内镜像（hf-mirror 等）
// 大多不支持 CORS，直接从浏览器跨域拉取会 Failed to fetch。
// 这里用同源代理把 /hf/* 转发到镜像源，规避 CORS。
const MODEL_MIRRORS = [
  'https://hf-mirror.com',
  'https://mirrors.tuna.tsinghua.edu.cn/huggingface',
];

async function proxyModelFile(request: NextRequest, pathname: string): Promise<NextResponse | null> {
  const rest = pathname.replace(/^\/hf\//, '');
  if (!rest) return null;
  for (const base of MODEL_MIRRORS) {
    const target = `${base}/${rest}`;
    try {
      const upstream = await fetch(target, { redirect: 'follow' });
      if (!upstream.ok) continue;
      // 流式转发上游 body：大文件（如 onnx 24MB）一次性 arrayBuffer 易触发连接重置，
      // 流式更稳定。content-length 视上游是否提供。
      const headers = new Headers();
      const ct = upstream.headers.get('content-type');
      if (ct) headers.set('content-type', ct);
      const cl = upstream.headers.get('content-length');
      if (cl) headers.set('content-length', cl);
      const cc = upstream.headers.get('cache-control');
      if (cc) headers.set('cache-control', cc);
      const etag = upstream.headers.get('etag');
      if (etag) headers.set('etag', etag);
      headers.set('access-control-allow-origin', '*');
      return new NextResponse(upstream.body, { status: 200, headers });
    } catch {
      /* 尝试下一个镜像 */
    }
  }
  return NextResponse.json({ error: 'model fetch failed' }, { status: 502 });
}

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

  // 模型权重同源代理（浏览器端 transformers.js 经此拉取，规避镜像 CORS）
  if (pathname.startsWith('/hf/')) {
    const r = await proxyModelFile(request, pathname);
    if (r) return r;
  }

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
