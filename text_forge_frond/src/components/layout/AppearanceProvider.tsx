// src/components/layout/AppearanceProvider.tsx
'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '@/lib/stores/settingsStore';

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const cardGlassOpacity = useSettingsStore((s) => s.cardGlassOpacity);
  const cardGlassBlur = useSettingsStore((s) => s.cardGlassBlur);
  const sidebarGlassOpacity = useSettingsStore((s) => s.sidebarGlassOpacity);
  const sidebarGlassBlur = useSettingsStore((s) => s.sidebarGlassBlur);
  const glassEnabled = useSettingsStore((s) => s.glassEnabled);
  const inkEnabled = useSettingsStore((s) => s.inkEnabled);
  const inkOpacity = useSettingsStore((s) => s.inkOpacity);
  const bgSolidOpacity = useSettingsStore((s) => s.bgSolidOpacity);
  const motionEnabled = useSettingsStore((s) => s.motionEnabled);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--card-glass-opacity', String(cardGlassOpacity / 100));
    root.style.setProperty('--card-glass-blur', `${cardGlassBlur}px`);
    root.style.setProperty('--sidebar-glass-opacity', String(sidebarGlassOpacity / 100));
    root.style.setProperty('--sidebar-glass-blur', `${sidebarGlassBlur}px`);
    root.style.setProperty('--ink-opacity', inkEnabled ? String(inkOpacity / 100) : '0');
    root.style.setProperty('--bg-solid-opacity', String(bgSolidOpacity / 100));

    root.classList.toggle('no-glass', !glassEnabled);
    root.classList.toggle('reduce-motion', !motionEnabled);
  }, [cardGlassOpacity, cardGlassBlur, sidebarGlassOpacity, sidebarGlassBlur, glassEnabled, inkEnabled, inkOpacity, bgSolidOpacity, motionEnabled]);

  return <>{children}</>;
}
