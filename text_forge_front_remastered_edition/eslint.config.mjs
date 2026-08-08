import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'out/**',
    'next-env.d.ts',
    'playwright-report/**',
    'test-results/**',
    'public/**',
  ]),
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 下划线前缀标识未使用（如 rest 剥离的 _uid/_body）为约定写法，忽略
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);
