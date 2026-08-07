'use client';

import { useEffect, useState } from 'react';
import { loadThemeBackground, THEME_BG_EVENT, type ThemeBgSettings } from './themeBackground';

export function ThemeBgInit() {
  const [bgImage, setBgImage] = useState<string | null>(null);

  useEffect(() => {
    loadThemeBackground()
      .then((s) => setBgImage(s.bgImage))
      .catch(() => {});
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<ThemeBgSettings>).detail;
      setBgImage(detail?.bgImage ?? null);
    };
    window.addEventListener(THEME_BG_EVENT, onUpdate);
    return () => window.removeEventListener(THEME_BG_EVENT, onUpdate);
  }, []);

  return (
    <div
      className="theme-bg"
      aria-hidden
      style={bgImage ? { backgroundImage: `url(${bgImage})` } : undefined}
    />
  );
}
