import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { enqueueSync } from '@/lib/storage/syncQueue';
import apiClient from '@/lib/api/client';
import { MODEL_TEMPLATES } from '@/lib/models/templates';
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

function defaultModels(): ModelConfig[] {
  const openai = buildFromTemplate('openai', { name: 'GPT-4o (默认)', isDefault: true });
  const ollama = buildFromTemplate('ollama');
  const kling = buildFromTemplate('kling');
  const embed = buildFromTemplate('openai-embed');
  return [openai, ollama, kling, embed];
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
        // 后端未就绪时入队重试
        const run = async () => {
          await apiClient.put('/api/user/models', { models: get().models });
        };
        run().catch(() => {
          enqueueSync('models', run);
        });
      },
      updateModel: (id, patch) => {
        set({ models: get().models.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
        const run = async () => {
          await apiClient.put('/api/user/models', { models: get().models });
        };
        run().catch(() => {
          enqueueSync('models', run);
        });
      },
      removeModel: (id) => {
        set({ models: get().models.filter((m) => m.id !== id) });
        const run = async () => {
          await apiClient.put('/api/user/models', { models: get().models });
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
          await apiClient.put('/api/user/models', { models: get().models });
        };
        run().catch(() => {
          enqueueSync('models', run);
        });
      },
    }),
    {
      name: 'novel-models',
      storage: createIdbStorage(),
      partialize: (s) => ({ models: s.models }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// 注册统一同步管理器
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