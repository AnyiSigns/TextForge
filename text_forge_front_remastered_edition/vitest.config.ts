import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const resolve = (p: string) => fileURLToPath(new URL(p, import.meta.url).href);

// 测试文件统一放在项目顶层 tests/ 目录，与 src/ 源码隔离。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
  resolve: {
    alias: [
      // 顺序重要：更具体的路径必须先于 @/* 匹配（与 tsconfig.json paths 对应）
      { find: /^@\/components\/ui(\/.*)?$/, replacement: resolve('./src/shared/ui$1') },
      { find: /^@\/shared(\/.*)?$/, replacement: resolve('./src/shared$1') },
      { find: /^@\/lib(\/.*)?$/, replacement: resolve('./src/lib$1') },
      { find: /^@\/(.*)?$/, replacement: resolve('./src/$1') },
    ],
  },
});
