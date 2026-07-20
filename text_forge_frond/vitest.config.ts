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