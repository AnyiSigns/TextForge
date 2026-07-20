// src/lib/config/env.ts
// 生产/测试：默认直连后端 http://localhost:8000（可在 .env 用 NEXT_PUBLIC_API_URL 覆盖）。
// 开发期：默认同源空串，使请求走 /api/* 由 proxy.ts 的 dev mock 拦截，无需启动后端。
const isDev = process.env.NODE_ENV !== 'production';
export const API_URL = process.env.NEXT_PUBLIC_API_URL || (isDev ? '' : 'http://localhost:8000');
