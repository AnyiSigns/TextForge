import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { enqueueSync } from '@/lib/storage/syncQueue';
import apiClient from '@/lib/api/client';
import { MODEL_TEMPLATES } from '../api/templates';
import { uid } from '@/lib/utils/id';
import { createIdbStorage } from '@/lib/storage/zustandIdb';
import type { ModelConfig, ModelCategory } from '@/types';
import { syncManager } from '@/lib/storage/syncManager';

function buildFromTemplate(templateKey: string, overrides: Partial<ModelConfig> = {}): ModelConfig {
  const t = MODEL_TEMPLATES.find((x) => x.key === templateKey)!;
  const extra: Record<string, string | number> = {};
  t.extraFields?.forEach((f) => { if (f.default !== undefined) extra[f.key] = f.default; });
  return {
    id: uid(),
    name: t.vendor,
    category: t.category,
    deployment: t.deployment,
    vendor: t.vendor,
    adapter: t.adapter,
    baseUrl: t.defaultBaseUrl,
    apiKey: '',
    modelId: t.defaultModelId,
    isDefault: false,
    modalities: t.modalities,
    extra: Object.keys(extra).length ? extra : undefined,
    auxiliary: t.category === 'llm' ? [] : undefined,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// 精简后端存储字段：adapter / modelId / baseUrl / apiKey
function toBackendModel(m: ModelConfig) {
  return {
    id: m.id,
    adapter: m.adapter,
    modelId: m.modelId,
    baseUrl: m.baseUrl,
    apiKey: m.apiKey,
  };
}

// 按 category 分组，分别同步到不同端点
async function syncModelsByCategory(models: ModelConfig[]) {
  const groups = models.reduce<Record<string, ModelConfig[]>>((acc, m) => {
    (acc[m.category] = acc[m.category] || []).push(m);
    return acc;
  }, {});
  const apiClient = (await import('@/lib/api/client')).default;
  await Promise.all(
    Object.entries(groups).map(([category, group]) =>
      apiClient.put(`/api/user/models/${category}`, { models: group.map(toBackendModel) })
    )
  );
}

function defaultModels(): ModelConfig[] {
  const ollama = buildFromTemplate('ollama');
  const dashscope = buildFromTemplate('dashscope');
  const deepseek = buildFromTemplate('deepseek');
  const openaiCompat = buildFromTemplate('openai-compat');
  const embed = buildFromTemplate('openai-embed');
  return [ollama, dashscope, deepseek, openaiCompat, embed];
}

interface ModelStore {
  models: ModelConfig[];
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  addModel: (m: ModelConfig) => void;
  updateModel: (id: string, patch: Partial<ModelConfig>) => void;
  removeModel: (id: string) => void;
  setDefault: (id: string, category: ModelCategory) => void;
  getVersionMeta: () => { lastSyncAt: string; version?: number };
  setVersionMeta: (meta: { lastSyncAt: string; version?: number }) => void;
  /** 取某 category 的默认模型（isDefault 优先）；无默认则回退该 category 首个模型；无则 undefined */
  getDefaultModel: (category: ModelCategory) => ModelConfig | undefined;
  /** 按 tier 解析某 category 的默认模型：cheap 优先取额外便宜模型，否则取该 category 默认模型 */
  resolveModelByTier: (category: ModelCategory, tier: 'cheap' | 'standard') => ModelConfig | undefined;
}

let modelVersionMeta: { lastSyncAt: string; version?: number } = { lastSyncAt: new Date(0).toISOString(), version: 0 };

export const useModelStore = create<ModelStore>()(
  persist(
    (set, get) => ({
      models: defaultModels(),
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
          // cheap 档优先取本地部署模型（零成本），回退到无云端计费的默认模型
          const cheap = list.find((m) => m.deployment === 'local')
            ?? list.find((m) => m.isDefault && m.deployment !== 'cloud');
          if (cheap) return cheap;
        }
        return list.find((m) => m.isDefault) ?? list[0];
      },
    }),
    {
      name: 'novel-models',
      storage: createIdbStorage(),
      // C9: 安全收口——本地 IndexedDB 不再持久化 apiKey 明文；
      // 密钥由后端（PUT /api/user/models）作为唯一可信保管方，前端仅保留 id 引用。
      partialize: (s) => ({
        models: s.models.map((m) => ({ ...m, apiKey: undefined })),
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// 注册统一同步管理器（延迟执行，避免循环依赖 modelStore→syncManager→apiClient→authStore→settingsStore→syncManager）
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