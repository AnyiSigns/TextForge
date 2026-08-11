'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  loadThemeBackground,
  saveThemeBgImage,
  saveThemeBgOpacity,
  saveThemeBgBlur,
  saveGlassEnabled,
  saveGlassOpacity,
  saveGlassBlur,
  removeThemeBackground,
  resetAll,
} from '@/lib/storage/themeBackground';

const SAFE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 10 * 1024 * 1024;

const compressImage = (dataUri: string, maxWidth: number, quality: number): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = Math.min(img.width, maxWidth);
      const h = Math.round((img.height / img.width) * w);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUri); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  });
};

export function useAppearanceSettings() {
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [bgOpacity, setBgOpacity] = useState(0.3);
  const [bgBlur, setBgBlur] = useState(0);
  const [glassEnabled, setGlassEnabledState] = useState(false);
  const [glassOpacity, setGlassOpacityState] = useState(0.7);
  const [glassBlur, setGlassBlurState] = useState(12);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sliderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 滑块拖动时实时写 CSS 变量预览，IndexedDB 落库防抖 200ms
  const debouncedSliderSave = (fn: () => void) => {
    if (sliderTimer.current) clearTimeout(sliderTimer.current);
    sliderTimer.current = setTimeout(fn, 200);
  };
  const applyVar = (prop: string, value: string) => {
    document.documentElement.style.setProperty(prop, value);
  };

  useEffect(() => {
    loadThemeBackground().then((s) => {
      setBgImage(s.bgImage);
      setBgOpacity(s.bgOpacity);
      setBgBlur(s.bgBlur);
      setGlassEnabledState(s.glassEnabled);
      setGlassOpacityState(s.glassOpacity);
      setGlassBlurState(s.glassBlur);
    }).catch(() => {});
  }, []);

  const handleBgUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type && !SAFE_TYPES.includes(file.type)) {
      toast.error('仅支持 JPG/PNG/WebP/GIF 图片');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      let dataUri = reader.result as string;
      if (file.size > MAX_SIZE) {
        dataUri = await compressImage(dataUri, 1920, 0.8);
      }
      setBgImage(dataUri);
      saveThemeBgImage(dataUri).catch(() => toast.error('保存背景图片失败'));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const handleBgRemove = useCallback(() => {
    setBgImage(null);
    setBgOpacity(0.3);
    setBgBlur(0);
    removeThemeBackground().catch(() => {});
  }, []);

  const handleBgOpacityChange = useCallback((v: number) => {
    setBgOpacity(v);
    applyVar('--bg-image-opacity', String(v));
    debouncedSliderSave(() => saveThemeBgOpacity(v).catch(() => {}));
  }, []);

  const handleBgBlurChange = useCallback((v: number) => {
    setBgBlur(v);
    applyVar('--bg-image-blur', `${v}px`);
    debouncedSliderSave(() => saveThemeBgBlur(v).catch(() => {}));
  }, []);

  const handleGlassToggle = useCallback((enabled: boolean) => {
    setGlassEnabledState(enabled);
    saveGlassEnabled(enabled).catch(() => {});
  }, []);

  const handleGlassOpacityChange = useCallback((v: number) => {
    setGlassOpacityState(v);
    applyVar('--glass-opacity', String(v));
    debouncedSliderSave(() => saveGlassOpacity(v).catch(() => {}));
  }, []);

  const handleGlassBlurChange = useCallback((v: number) => {
    setGlassBlurState(v);
    applyVar('--glass-blur', `${v}px`);
    debouncedSliderSave(() => saveGlassBlur(v).catch(() => {}));
  }, []);

  const handleResetAll = useCallback(() => {
    setBgImage(null);
    setBgOpacity(0.3);
    setBgBlur(0);
    setGlassEnabledState(false);
    setGlassOpacityState(0.7);
    setGlassBlurState(12);
    resetAll().then(() => toast.success('已还原默认')).catch(() => {});
  }, []);

  return {
    bgImage,
    bgOpacity,
    bgBlur,
    glassEnabled,
    glassOpacity,
    glassBlur,
    fileInputRef,
    handleBgUpload,
    handleBgRemove,
    handleBgOpacityChange,
    handleBgBlurChange,
    handleGlassToggle,
    handleGlassOpacityChange,
    handleGlassBlurChange,
    handleResetAll,
  };
}
