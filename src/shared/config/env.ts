// src/shared/config/env.ts
// 多环境配置统一出口。所有前端可公开变量必须经 NEXT_PUBLIC_* 注入（Next.js 编译期内联）。
// 规范要求的多环境字段：NEXT_PUBLIC_ENV（development/staging/production）、NEXT_PUBLIC_API_URL、NEXT_PUBLIC_SENTRY_DSN。

export type AppEnv = 'development' | 'staging' | 'production';

function resolveEnv(): AppEnv {
  const raw = process.env.NEXT_PUBLIC_ENV || process.env.NODE_ENV || 'development';
  if (raw === 'production' || raw === 'prod') return 'production';
  if (raw === 'staging' || raw === 'stage' || raw === 'pre') return 'staging';
  return 'development';
}

export const APP_ENV = resolveEnv();

const isDev = APP_ENV === 'development';

// 开发期默认同源空串，让请求走 /api/* 由 proxy.ts 的 dev mock 拦截，无需启动后端。
// 非开发期默认直连后端，可用 NEXT_PUBLIC_API_URL 覆盖。
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || (isDev ? '' : 'http://localhost:8000');

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || '';

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || `text-forge@${APP_ENV}`;
