// src/shared/stores/preferencesStore.ts
// 增量迁移 P4：合并 modelStore + settings/layout 的偏好配置。
// 主要作为别名/代理 store：模型配置访问器代理到 useModelStore，
// 外观偏好（glassEnabled / fontSize / reducedMotion / theme）在此 store 管理。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createIdbStorage } from '@/lib/storage/zustandIdb';
import { useModelStore } from '@/features/settings/stores/modelStore';
import type { ModelConfig, ModelRole, RoleModelConfig } from '@/types';

export type Theme = 'light' | 'dark' | 'system';

interface PreferencesStore {
  // Appearance preferences
  glassEnabled: boolean;
  fontSize: number;
  reducedMotion: boolean;
  theme: Theme;

  // Setters
  setGlassEnabled: (v: boolean) => void;
  setFontSize: (v: number) => void;
  setReducedMotion: (v: boolean) => void;
  setTheme: (v: Theme) => void;

  // Re-exported model config accessors (proxied to useModelStore)
  getDefaultModel: (category: ModelConfig['category']) => ModelConfig | undefined;
  resolveModelByTier: (
    category: ModelConfig['category'],
    tier: 'cheap' | 'standard'
  ) => ModelConfig | undefined;
  getMainModel: () => RoleModelConfig | null;
  getTextRoleModel: (role: ModelRole) => RoleModelConfig | null;
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      // Defaults
      glassEnabled: true,
      fontSize: 14,
      reducedMotion: false,
      theme: 'system',

      setGlassEnabled: (v) => set({ glassEnabled: v }),
      setFontSize: (v) => set({ fontSize: v }),
      setReducedMotion: (v) => set({ reducedMotion: v }),
      setTheme: (v) => set({ theme: v }),

      // Proxy model config accessors to useModelStore
      getDefaultModel: (category) => useModelStore.getState().getDefaultModel(category),
      resolveModelByTier: (category, tier) =>
        useModelStore.getState().resolveModelByTier(category, tier),
      getMainModel: () => useModelStore.getState().getMainModel(),
      getTextRoleModel: (role) => useModelStore.getState().getTextRoleModel(role),
    }),
    {
      name: 'preferences-storage',
      storage: createIdbStorage(),
      partialize: (s) => ({
        glassEnabled: s.glassEnabled,
        fontSize: s.fontSize,
        reducedMotion: s.reducedMotion,
        theme: s.theme,
      }),
    }
  )
);

// Re-export model store and its types for consumers migrating away from useModelStore
export { useModelStore };
export type { ModelConfig, ModelRole, RoleModelConfig };
