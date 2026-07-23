import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { uid } from '@/lib/utils/id';
import { createIdbStorage } from '@/lib/storage/zustandIdb';
import type { ModelConfig, ModelRole, RoleModelConfig } from '@/types';
import { syncManager } from '@/lib/storage/syncManager';
import { MODEL_TEMPLATES } from '../api/templates';

function buildRoleModel(templateKey: string, role: ModelRole, overrides: Partial<RoleModelConfig> = {}): RoleModelConfig {
  const t = MODEL_TEMPLATES.find((x) => x.key === templateKey)!;
  const extra: Record<string, string | number> = {};
  t.extraFields?.forEach((f) => { if (f.default !== undefined) extra[f.key] = f.default; });
  return {
    id: uid(),
    role,
    name: t.vendor,
    provider: t.vendor,
    adapter: t.adapter,
    baseUrl: t.defaultBaseUrl ?? '',
    apiKey: '',
    modelId: t.defaultModelId,
    deployment: t.deployment,
    extra: Object.keys(extra).length ? extra : undefined,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function defaultTextRoleModels(): Record<ModelRole, RoleModelConfig | null> {
  return {
    main: buildRoleModel('deepseek', 'main'),
    compression: null,
    router: null,
    tool: null,
  };
}

interface ModelStore {
  models: ModelConfig[];
  textRoleModels: Record<ModelRole, RoleModelConfig | null>;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;

  addModel: (m: ModelConfig) => void;
  updateModel: (id: string, patch: Partial<ModelConfig>) => void;
  removeModel: (id: string) => void;
  setDefault: (id: string, category: ModelConfig['category']) => void;
  getDefaultModel: (category: ModelConfig['category']) => ModelConfig | undefined;
  resolveModelByTier: (category: ModelConfig['category'], tier: 'cheap' | 'standard') => ModelConfig | undefined;

  setTextRoleModel: (role: ModelRole, model: RoleModelConfig | null) => void;
  getTextRoleModel: (role: ModelRole) => RoleModelConfig | null;
  getMainModel: () => RoleModelConfig | null;

  getVersionMeta: () => { lastSyncAt: string; version?: number };
  setVersionMeta: (meta: { lastSyncAt: string; version?: number }) => void;
}

let modelVersionMeta: { lastSyncAt: string; version?: number } = { lastSyncAt: new Date(0).toISOString(), version: 0 };

export const useModelStore = create<ModelStore>()(
  persist(
    (set, get) => ({
      models: [],
      textRoleModels: defaultTextRoleModels(),
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),

      getVersionMeta: () => modelVersionMeta,
      setVersionMeta: (meta: { lastSyncAt: string; version?: number }) => { modelVersionMeta = meta; },

      addModel: (m) => set({ models: [...get().models, m] }),
      updateModel: (id, patch) => set({ models: get().models.map((m) => (m.id === id ? { ...m, ...patch } : m)) }),
      removeModel: (id) => set({ models: get().models.filter((m) => m.id !== id) }),
      setDefault: (id, category) => set({
        models: get().models.map((m) => m.category === category ? { ...m, isDefault: m.id === id } : m),
      }),
      getDefaultModel: (category) => {
        const list = get().models.filter((m) => m.category === category);
        if (!list.length) return undefined;
        return list.find((m) => m.isDefault) ?? list[0];
      },
      resolveModelByTier: (category, tier) => {
        const list = get().models.filter((m) => m.category === category);
        if (!list.length) return undefined;
        if (tier === 'cheap') {
          const cheap = list.find((m) => m.deployment === 'local')
            ?? list.find((m) => m.isDefault && m.deployment !== 'cloud');
          if (cheap) return cheap;
        }
        return list.find((m) => m.isDefault) ?? list[0];
      },

      setTextRoleModel: (role, model) => {
        set((s) => ({
          textRoleModels: { ...s.textRoleModels, [role]: model },
        }));
      },
      getTextRoleModel: (role) => get().textRoleModels[role],
      getMainModel: () => get().textRoleModels.main,
    }),
    {
      name: 'novel-models',
      storage: createIdbStorage(),
      partialize: (s) => ({
        models: s.models.map((m) => ({ ...m, apiKey: undefined })),
        textRoleModels: Object.fromEntries(
          Object.entries(s.textRoleModels).map(([k, v]) => [k, v ? { ...v, apiKey: undefined } : null])
        ) as Record<ModelRole, RoleModelConfig | null>,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// 注册统一同步管理器（延迟执行）
setTimeout(() => {
  syncManager.register({
    name: 'models',
    applyUpdates: (updates, version) => {
      useModelStore.setState((s) => {
        const map = new Map((updates as ModelConfig[]).map((u) => [u.id, u]));
        const models = s.models.map((m) => map.get(m.id) || m);
        return { models };
      });
      if (version !== undefined) {
        modelVersionMeta = { ...modelVersionMeta, lastSyncAt: new Date().toISOString(), version };
      }
    },
    getMeta: () => useModelStore.getState().getVersionMeta(),
    setMeta: (meta) => useModelStore.getState().setVersionMeta(meta),
  });
}, 0);
