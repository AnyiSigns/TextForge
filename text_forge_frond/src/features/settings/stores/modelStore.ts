import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { enqueueSync } from '@/lib/storage/syncQueue';
import { MODEL_TEMPLATES } from '../api/templates';
import { uid } from '@/lib/utils/id';
import { createIdbStorage } from '@/lib/storage/zustandIdb';
import type { ModelConfig, ModelRole, RoleModelConfig } from '@/types';
import { syncManager } from '@/lib/storage/syncManager';

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

  // 通用视觉/向量模型操作（保留现状）
  addModel: (m: ModelConfig) => void;
  updateModel: (id: string, patch: Partial<ModelConfig>) => void;
  removeModel: (id: string) => void;
  setDefault: (id: string, category: ModelConfig['category']) => void;
  getDefaultModel: (category: ModelConfig['category']) => ModelConfig | undefined;
  resolveModelByTier: (category: ModelConfig['category'], tier: 'cheap' | 'standard') => ModelConfig | undefined;

  // 文本角色模型操作
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

      addModel: (m) => {
        set({ models: [...get().models, m] });
        const run = async () => {
          await syncModelsByCategory(get().models);
        };
        run().catch(() => {
          enqueueSync('models', run);
        });
      },
      updateModel: (id, patch) => {
        set({ models: get().models.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
        const run = async () => {
          await syncModelsByCategory(get().models);
        };
        run().catch(() => {
          enqueueSync('models', run);
        });
      },
      removeModel: (id) => {
        set({ models: get().models.filter((m) => m.id !== id) });
        const run = async () => {
          await syncModelsByCategory(get().models);
        };
        run().catch(() => {
          enqueueSync('models', run);
        });
      },
      setDefault: (id, category) => {
        set({
          models: get().models.map((m) =>
            m.category === category ? { ...m, isDefault: m.id === id } : m
          ),
        });
        const run = async () => {
          await syncModelsByCategory(get().models);
        };
        run().catch(() => {
          enqueueSync('models', run);
        });
      },
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

// 精简后端存储字段
function toBackendVisionModel(m: ModelConfig) {
  return {
    id: m.id,
    adapter: m.adapter,
    modelId: m.modelId,
    baseUrl: m.baseUrl,
    apiKey: m.apiKey,
    category: m.category,
  };
}

// 按 category 分组同步视觉/向量模型
async function syncModelsByCategory(models: ModelConfig[]) {
  const groups = models.reduce<Record<string, ModelConfig[]>>((acc, m) => {
    (acc[m.category] = acc[m.category] || []).push(m);
    return acc;
  }, {});
  const apiClient = (await import('@/lib/api/client')).default;
  await Promise.all(
    Object.entries(groups).map(([category, group]) =>
      apiClient.put(`/api/user/models/${category}`, { models: group.map(toBackendVisionModel) })
    )
  );
}

// 注册统一同步管理器（延迟执行，避免循环依赖）
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
