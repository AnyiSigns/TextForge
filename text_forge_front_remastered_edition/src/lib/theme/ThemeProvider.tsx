'use client';

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes';

/**
 * next-themes 包装组件：消除 React 19 对客户端渲染 <script> 的警告。
 *
 * next-themes 为防主题闪烁（FOUC）会在 Provider 内渲染内联 script（SSR 阶段
 * 由浏览器原生执行）。React 19 起，客户端渲染 script 标签会报
 * 「Encountered a script tag while rendering React component」警告。
 * 通过在客户端把 script 的 type 设为 application/json（React 不会尝试执行
 * 且跳过警告），服务端仍以默认 type（text/javascript）输出并正常执行，
 * 功能不受影响。
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const scriptProps =
    typeof window === 'undefined'
      ? undefined
      : ({ type: 'application/json' } as const);
  return (
    <NextThemesProvider {...props} scriptProps={scriptProps}>
      {children}
    </NextThemesProvider>
  );
}
