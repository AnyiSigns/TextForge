// src/app/(dashboard)/layout.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { BackgroundProvider } from '@/components/layout/BackgroundProvider';
import { AppearanceProvider } from '@/components/layout/AppearanceProvider';
import { Toaster } from 'sonner';
import { GlobalShortcuts } from '@/components/shared/globalShortcuts';
import { GlobalSearch } from '@/components/shared/GlobalSearch';
import { ConflictDialog } from '@/components/shared/ConflictDialog';
import { Footer } from '@/components/layout/Footer';
import { Spinner } from '@/components/shared/states';
import { motion } from 'framer-motion';
import { syncManager } from '@/lib/storage/syncManager';
import { useAuthStore } from '@/lib/stores/authStore';
import { useNetworkStatus } from '@/lib/hooks/useNetworkStatus';
import { useSettingsStore } from '@/lib/stores/settingsStore';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { accessToken, hasHydrated, setHasHydrated, restoreFromCookie } = useAuthStore();
  const isLoggedIn = !!accessToken;
  const router = useRouter();
  useNetworkStatus();
  const contentScale = useSettingsStore((s) => s.contentScale);
  const fontFamily = useSettingsStore((s) => s.fontFamily);

  useEffect(() => {
    void syncManager.syncAll();
  }, []);

  // 整体内容显示大小：通过根字号缩放全部 rem 单位（tailwind 默认基准）
  useEffect(() => {
    document.documentElement.style.fontSize = `${contentScale}%`;
  }, [contentScale]);

  // 界面字体家族：通过 data-font 属性切换，globals.css 据此覆盖 --font-sans / --font-heading
  useEffect(() => {
    if (fontFamily && fontFamily !== 'system') {
      document.documentElement.dataset.font = fontFamily;
    } else {
      delete document.documentElement.dataset.font;
    }
  }, [fontFamily]);

  // 状态一致性兜底：服务端（proxy）以 tf_rt cookie 为登录真相，
  // 前端以 accessToken 为真相。若两者不一致（例如刷新后 cookie 仍在、
  // 但前端 localStorage 被清空/未水合），尝试用 refresh 恢复前端登录态，
  // 避免 proxy 放行 /、layout 却误判未登录而硬跳 /login，造成
  // 「正在加载 ↔ 正在跳转」的死循环。
  useEffect(() => {
    if (hasHydrated && !isLoggedIn && typeof document !== 'undefined') {
      const hasCookie = document.cookie
        .split(';')
        .some((c) => c.trim().startsWith('tf_rt='));
      if (hasCookie) {
        void restoreFromCookie();
      }
    }
  }, [hasHydrated, isLoggedIn, restoreFromCookie]);

  // 未登录：软导航到登录页（不整页 reload，避免水合竞态与 Spinner 抖动）。
  // 仅在当前确实停留在受保护路由、且并非登录页自身时才跳转，杜绝翻转循环。
  useEffect(() => {
    if (!hasHydrated || isLoggedIn) return;
    const path = window.location.pathname;
    const alreadyOnLogin = path === '/login' || path.startsWith('/login/');
    if (alreadyOnLogin) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.get('redirect')) params.set('redirect', path + window.location.search);
    router.replace(`/login?${params.toString()}`);
  }, [hasHydrated, isLoggedIn, router]);

  // 开发期兜底：localStorage 偶发不触发 rehydrate 时，避免永久卡在加载态。
  // 注意：不能包在 process.env.NODE_ENV 判断里——客户端 bundle 中
  // NODE_ENV 可能是 'production'，会导致兜底永不执行、永久白屏。
  useEffect(() => {
    const t = setTimeout(() => {
      if (!useAuthStore.getState().hasHydrated) setHasHydrated(true);
    }, 1000);
    return () => clearTimeout(t);
  }, [setHasHydrated]);

  if (!hasHydrated) {
    return <Spinner label="正在加载..." className="h-screen" />;
  }

  if (!isLoggedIn) {
    // 硬导航进行中，先占位（不会渲染空白内容）
    return <Spinner label="正在跳转..." className="h-screen" />;
  }

  return (
    <>
      <AppearanceProvider>
        <BackgroundProvider>
          <div className="group/sidebar-layout flex h-screen overflow-hidden">
            <Sidebar />
            <main className="dash-main flex-1 overflow-hidden md:ml-[16rem] transition-all duration-300 md:[html.sidebar-collapsed_&]:ml-[92px]">
              <motion.div
                className="h-full min-h-full flex flex-col"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-6 py-6 md:px-8 md:py-7">{children}</div>
                <Footer />
              </motion.div>
            </main>
            <Toaster position="top-right" richColors closeButton />
          </div>
        </BackgroundProvider>
      </AppearanceProvider>
      <GlobalShortcuts />
      <GlobalSearch />
      <ConflictDialog />
    </>
  );
}
