import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { syncManager } from '@/lib/storage/syncManager';
import { createIdbStorage } from '@/lib/storage/zustandIdb';
import { now } from '@/lib/utils/time';

export type SuggestionFrequency = 'high' | 'medium' | 'manual';
export type BgArea = 'global' | 'dashboard' | 'projects' | 'characters' | 'knowledge' | 'tasks' | 'assets' | 'api-keys' | 'settings';

interface SettingsStore {
  bgImage: string | null;
  bgOpacity: number;
  bgBlur: number;
  bgArea: BgArea;
  bgSolidOpacity: number;

  cardGlassOpacity: number;
  cardGlassBlur: number;
  sidebarGlassOpacity: number;
  sidebarGlassBlur: number;
  glassEnabled: boolean;
  inkEnabled: boolean;
  inkOpacity: number;
  motionEnabled: boolean;

  suggestionFrequency: SuggestionFrequency;
  theme: 'light' | 'dark' | 'system';
  processNavPosition: 'top' | 'bottom' | 'left' | 'right';

  // 整体内容显示大小（百分比，100 为原始大小；调小更紧凑，调大更舒展）
  contentScale: number;

  // 界面字体家族：system / sans / serif / kai / yuan / fangsong
  fontFamily: string;

  // 个人库向量检索模型档位（维度）：small=512 / base=768 / large=1024
  embedTierId: string;

  hasHydrated: boolean;

  setBgImage: (url: string | null) => void;
  setBgOpacity: (value: number) => void;
  setBgBlur: (value: number) => void;
  setBgArea: (area: BgArea) => void;
  setBgSolidOpacity: (value: number) => void;

  setCardGlassOpacity: (value: number) => void;
  setCardGlassBlur: (value: number) => void;
  setSidebarGlassOpacity: (value: number) => void;
  setSidebarGlassBlur: (value: number) => void;
  setGlassEnabled: (value: boolean) => void;
  setInkEnabled: (value: boolean) => void;
  setInkOpacity: (value: number) => void;
  setMotionEnabled: (value: boolean) => void;

  setSuggestionFrequency: (value: SuggestionFrequency) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setProcessNavPosition: (pos: 'top' | 'bottom' | 'left' | 'right') => void;
  setContentScale: (value: number) => void;
  setFontFamily: (value: string) => void;
  setEmbedTierId: (id: string) => void;
  setHasHydrated: (value: boolean) => void;
  getVersionMeta: () => { lastSyncAt: string; version?: number };
  setVersionMeta: (meta: { lastSyncAt: string; version?: number }) => void;
}

let settingsVersionMeta: { lastSyncAt: string; version?: number } = { lastSyncAt: new Date(0).toISOString(), version: 0 };

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      bgImage: null,
      bgOpacity: 60,
      bgBlur: 8,
      bgArea: 'global',
      bgSolidOpacity: 70,

      cardGlassOpacity: 40,
      cardGlassBlur: 22,
      sidebarGlassOpacity: 88,
      sidebarGlassBlur: 20,
      glassEnabled: true,
      inkEnabled: true,
      inkOpacity: 22,
      motionEnabled: true,

      suggestionFrequency: 'medium',
      theme: 'system',
      processNavPosition: 'top',
      contentScale: 100,
      fontFamily: 'system',

      embedTierId: 'base',

      hasHydrated: false,

      getVersionMeta: () => settingsVersionMeta,
      setVersionMeta: (meta: { lastSyncAt: string; version?: number }) => { settingsVersionMeta = meta; },

      setBgImage: (url) => set({ bgImage: url }),
      setBgOpacity: (value) => set({ bgOpacity: value }),
      setBgBlur: (value) => set({ bgBlur: value }),
      setBgArea: (area) => set({ bgArea: area }),
      setBgSolidOpacity: (value) => set({ bgSolidOpacity: value }),

      setCardGlassOpacity: (value) => set({ cardGlassOpacity: value }),
      setCardGlassBlur: (value) => set({ cardGlassBlur: value }),
      setSidebarGlassOpacity: (value) => set({ sidebarGlassOpacity: value }),
      setSidebarGlassBlur: (value) => set({ sidebarGlassBlur: value }),
      setGlassEnabled: (value) => set({ glassEnabled: value }),
      setInkEnabled: (value) => set({ inkEnabled: value }),
      setInkOpacity: (value) => set({ inkOpacity: value }),
      setMotionEnabled: (value) => set({ motionEnabled: value }),

      setSuggestionFrequency: (value) => set({ suggestionFrequency: value }),
      setTheme: (theme) => set({ theme }),
      setProcessNavPosition: (pos) => set({ processNavPosition: pos }),
      setContentScale: (value) => set({ contentScale: value }),
      setFontFamily: (value) => set({ fontFamily: value }),
      setEmbedTierId: (id) => set({ embedTierId: id }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'novel-settings',
      storage: createIdbStorage(),
      partialize: (s) => ({
        bgImage: s.bgImage,
        bgOpacity: s.bgOpacity,
        bgBlur: s.bgBlur,
        bgArea: s.bgArea,
        bgSolidOpacity: s.bgSolidOpacity,
        cardGlassOpacity: s.cardGlassOpacity,
        cardGlassBlur: s.cardGlassBlur,
        sidebarGlassOpacity: s.sidebarGlassOpacity,
        sidebarGlassBlur: s.sidebarGlassBlur,
        glassEnabled: s.glassEnabled,
        inkEnabled: s.inkEnabled,
        inkOpacity: s.inkOpacity,
        motionEnabled: s.motionEnabled,
        suggestionFrequency: s.suggestionFrequency,
        theme: s.theme,
        processNavPosition: s.processNavPosition,
        contentScale: s.contentScale,
        fontFamily: s.fontFamily,
        embedTierId: s.embedTierId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
        // 一次性迁移：旧持久化的侧边栏玻璃过低会导致浅色主题下对话页显白
        if (state && typeof state.sidebarGlassOpacity === 'number' && state.sidebarGlassOpacity < 60) {
          state.sidebarGlassOpacity = 88;
        }
      },
    }
  )
);

// 注册统一同步管理器（延迟执行，避免循环依赖）
setTimeout(() => {
  syncManager.register({
    name: 'settings',
    applyUpdates: (updates, version) => {
      const update = (updates as SettingsStore[])[0];
      if (update) {
        useSettingsStore.setState({
          bgImage: update.bgImage,
          bgOpacity: update.bgOpacity,
          bgBlur: update.bgBlur,
          bgArea: update.bgArea,
          cardGlassOpacity: update.cardGlassOpacity,
          cardGlassBlur: update.cardGlassBlur,
          sidebarGlassOpacity: update.sidebarGlassOpacity,
          sidebarGlassBlur: update.sidebarGlassBlur,
          glassEnabled: update.glassEnabled,
          inkEnabled: update.inkEnabled,
          inkOpacity: update.inkOpacity,
          motionEnabled: update.motionEnabled,
          suggestionFrequency: update.suggestionFrequency,
          theme: update.theme,
        });
      }
      if (version !== undefined) {
        settingsVersionMeta = { ...settingsVersionMeta, lastSyncAt: new Date().toISOString(), version };
      }
    },
    getMeta: () => useSettingsStore.getState().getVersionMeta(),
    setMeta: (meta) => useSettingsStore.getState().setVersionMeta(meta),
  });
}, 0);
