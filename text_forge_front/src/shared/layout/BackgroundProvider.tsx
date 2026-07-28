// src/components/layout/BackgroundProvider.tsx
'use client';

import { useSettingsStore } from '@/features/settings';
import { usePathname } from 'next/navigation';

export function BackgroundProvider({ children }: { children: React.ReactNode }) {
  const bgImage = useSettingsStore((s) => s.bgImage);
  const bgOpacity = useSettingsStore((s) => s.bgOpacity);
  const bgBlur = useSettingsStore((s) => s.bgBlur);
  const bgArea = useSettingsStore((s) => s.bgArea);
  const inkEnabled = useSettingsStore((s) => s.inkEnabled);
  const hasHydrated = useSettingsStore((s) => s.hasHydrated);

  const pathname = usePathname();

  const shouldShowBg = (() => {
    if (!hasHydrated) return false;
    if (!bgImage) return false;
    if (bgArea === 'global') return true;
    if (bgArea === 'dashboard') return pathname === '/';
    return pathname === `/${bgArea}` || pathname.startsWith(`/${bgArea}/`);
  })();

  return (
    <div className="relative min-h-screen">
      {shouldShowBg && (
        <div
          className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat transition-all duration-700"
          style={{
            backgroundImage: `url(${bgImage})`,
            opacity: bgOpacity / 100,
            filter: `blur(${bgBlur}px)`,
          }}
        />
      )}

      {/* 实色层：在背景图之上、内容之下。不透明度可调，
          调低透出背景图（HDR 感强），调高接近纯色底 */}
      <div
        className="fixed inset-0 -z-[9] bg-background transition-opacity duration-300"
        style={{ opacity: 'var(--bg-solid-opacity, 0.7)' }}
      />

      {inkEnabled && (
        <>
          <div className="ink-noise" aria-hidden />
          <div className="ink-overlay" aria-hidden />
        </>
      )}

      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
