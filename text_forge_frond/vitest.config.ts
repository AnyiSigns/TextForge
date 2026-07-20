import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const resolve = (p: string) => fileURLToPath(new URL(p, import.meta.url).href);

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**/*.{test,spec}.{ts,tsx}'],
    // 覆盖率报告与渐进门槛：当前为软提示，不硬卡死 CI（避免一次性大改失败）。
    // 目标线 80%，随测试扩面逐步收紧；后续 PR 可将 thresholds 提高到目标值并加 --fail-on-error。
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'text-summary', 'html', 'json'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test/**',
        'src/**/index.ts',
        'src/mocks/**',
        'src/app/**',
      ],
      thresholds: {
        // 当前为软提示门槛；随组件测试补齐逐步抬升至 80%。
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      },
    },
    alias: [
      { find: /^@\/components\/ui(\/.*)?$/, replacement: resolve('./src/shared/ui$1') },
      { find: /^@\/lib\/utils(\/.*)?$/, replacement: resolve('./src/shared/lib/utils$1') },
      { find: /^@\/lib\/config(\/.*)?$/, replacement: resolve('./src/shared/config$1') },
      { find: /^@\/lib\/api\/client$/, replacement: resolve('./src/shared/lib/apiClient') },
      { find: /^@\/lib\/api\/authFetch$/, replacement: resolve('./src/shared/lib/authFetch') },
      { find: /^@\/lib\/api\/sse$/, replacement: resolve('./src/shared/lib/sse') },
      { find: /^@\/lib\/api\/errorCodes$/, replacement: resolve('./src/shared/lib/errorCodes') },
      { find: '@', replacement: resolve('./src') },
    ],
  },
});