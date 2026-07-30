import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { enqueueSync } from '@/lib/storage/syncQueue';
import type { BookCreativeSetting, CustomDimension, Origin } from '@/types';
import apiClient from '@/shared/lib/apiClient';
import { createIdbStorage } from '@/lib/storage/zustandIdb';
import { syncManager } from '@/lib/storage/syncManager';
import { updateCreativeSetting } from '../api/creativeSettings';

interface CreativeSettingStore {
  settings: Record<number, BookCreativeSetting>;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  getSetting: (bookId: number) => BookCreativeSetting | undefined;
  upsertSetting: (setting: BookCreativeSetting, origin?: Origin) => void;

  getVersionMeta: () => { lastSyncAt: string; version?: number };
  setVersionMeta: (meta: { lastSyncAt: string; version?: number }) => void;
}

let settingVersionMeta: { lastSyncAt: string; version?: number } = { lastSyncAt: new Date(0).toISOString(), version: 0 };

export const useCreativeSettingStore = create<CreativeSettingStore>()(
  persist(
    (set, get) => ({
      settings: {},
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),

      getSetting: (bookId) => get().settings[bookId],

      getVersionMeta: () => settingVersionMeta,
      setVersionMeta: (meta) => { settingVersionMeta = meta; },

      upsertSetting: (setting, _origin: Origin = 'user') => {
        set((s) => {
          const _prev = s.settings[setting.bookId];
          return {
            settings: {
              ...s.settings,
              [setting.bookId]: { ...setting, updatedAt: new Date().toISOString() },
            },
          };
        });
        const run = async () => {
          await updateCreativeSetting(setting.bookId, setting);
        };
        run().catch(() => {
          enqueueSync(`creativeSetting:${setting.bookId}`, run);
        });
      },
    }),
    {
      name: 'novel-creative-settings',
      storage: createIdbStorage(),
      partialize: (s) => ({ settings: s.settings }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

syncManager.register({
  name: 'creativeSettings',
  applyUpdates: (updates, version) => {
    useCreativeSettingStore.setState((s) => {
      const settings = { ...s.settings };
      for (const u of updates as BookCreativeSetting[]) {
        settings[u.bookId] = u;
      }
      return { settings };
    });
    if (version !== undefined) {
      settingVersionMeta = { ...settingVersionMeta, lastSyncAt: new Date().toISOString(), version };
    }
  },
  getMeta: () => useCreativeSettingStore.getState().getVersionMeta(),
  setMeta: (meta) => useCreativeSettingStore.getState().setVersionMeta(meta),
});

export function creativeSettingToContextLine(setting?: BookCreativeSetting): string {
  if (!setting) return '';
  const parts: string[] = [];
  if (setting.worldview) parts.push(`世界观：${setting.worldview}`);
  if (setting.tone) parts.push(`基调：${setting.tone}`);
  if (setting.writingTaboos) parts.push(`禁忌：${setting.writingTaboos}`);
  for (const s of setting.customDimensions ?? []) {
    if (s.pinned && s.content.trim()) parts.push(`${s.title}：${s.content}`);
  }
  return parts.join('；');
}

export function creativeSettingDimensionsToContext(
  dimensions: CustomDimension[] | undefined,
  pickedIds: string[],
): string {
  if (!dimensions?.length || !pickedIds.length) return '';
  return dimensions
    .filter((s) => pickedIds.includes(s.id) && s.content.trim())
    .map((s) => `${s.title}：${s.content}`)
    .join('；');
}
