// src/lib/stores/briefStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getItem, setItem, removeItem } from '@/lib/storage/indexedDB';
import { enqueueSync } from '@/lib/storage/syncQueue';
import type { ProjectBrief, BriefSection, Origin } from '@/types';
import apiClient from '@/lib/api/client';
import { syncManager } from '@/lib/storage/syncManager';

// 后端未就绪时，Brief 以「项目 id -> Brief」形式存本地；
// 后端就绪后由 syncManager 与服务器对齐（接口契约预留）。
interface BriefStore {
  briefs: Record<string, ProjectBrief>;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  getBrief: (projectId: string) => ProjectBrief | undefined;
  upsertBrief: (brief: ProjectBrief, origin?: Origin) => void;

  getVersionMeta: () => { lastSyncAt: string; version?: number };
  setVersionMeta: (meta: { lastSyncAt: string; version?: number }) => void;
}

const idbStorage = {
  getItem: async (name: string): Promise<string | null> => (await getItem<string>(name)) ?? null,
  setItem: async (name: string, value: string): Promise<void> => { await setItem(name, value); },
  removeItem: async (name: string): Promise<void> => { await removeItem(name); },
};

let briefVersionMeta: { lastSyncAt: string; version?: number } = { lastSyncAt: new Date(0).toISOString(), version: 0 };

export const useBriefStore = create<BriefStore>()(
  persist(
    (set, get) => ({
      briefs: {},
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),

      getBrief: (projectId) => get().briefs[projectId],

      getVersionMeta: () => briefVersionMeta,
      setVersionMeta: (meta) => { briefVersionMeta = meta; },

  upsertBrief: (brief, origin: Origin = 'user') => {
    set((s) => {
      const prev = s.briefs[brief.projectId];
      // 用户手动保存：把本次保存涉及的字段标记为 user（种子不覆盖）。
      // 种子回填走 mergeBrief，不会经过此分支，故 origin 默认 user 安全。
      const fieldOrigins: NonNullable<ProjectBrief['fieldOrigins']> = {
        ...(prev?.fieldOrigins ?? {}),
        ...(brief.fieldOrigins ?? {}),
      };
      if (origin === 'user') {
        for (const f of ['genre', 'worldview', 'tone', 'forbidden', 'styleGuide', 'defaultVisionModel', 'defaultStyle', 'wordCountGoal', 'dailyWordCountGoal'] as const) {
          if (brief[f] !== undefined && brief[f] !== '') fieldOrigins[f] = 'user';
        }
        for (const sec of brief.sections ?? []) {
          if (sec.origin === undefined) sec.origin = 'user';
        }
      }
      return {
        briefs: { ...s.briefs, [brief.projectId]: { ...brief, fieldOrigins, updatedAt: new Date().toISOString() } },
      };
    });
    // 后端未就绪时入队重试
    const run = async () => {
      await apiClient.put(`/api/projects/${brief.projectId}/brief`, { brief });
    };
    run().catch(() => {
      enqueueSync(`brief:${brief.projectId}`, run);
    });
  },
    }),
    {
      name: 'novel-briefs',
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ briefs: s.briefs }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

// 注册统一同步管理器
syncManager.register({
  name: 'briefs',
  applyUpdates: (updates, version) => {
    useBriefStore.setState((s) => {
      const briefs = { ...s.briefs };
      for (const u of updates as ProjectBrief[]) {
        briefs[u.projectId] = u;
      }
      return { briefs };
    });
    if (version !== undefined) {
      briefVersionMeta.version = version;
    }
  },
  getMeta: () => useBriefStore.getState().getVersionMeta(),
  setMeta: (meta) => useBriefStore.getState().setVersionMeta(meta),
});

// 将 Brief 折叠成一行文本上下文，注入生成/对话请求
export function briefToContextLine(brief?: ProjectBrief): string {
  if (!brief) return '';
  const parts: string[] = [];
  if (brief.genre) parts.push(`类型：${brief.genre}`);
  if (brief.worldview) parts.push(`世界观：${brief.worldview}`);
  if (brief.tone) parts.push(`基调：${brief.tone}`);
  if (brief.styleGuide) parts.push(`风格：${brief.styleGuide}`);
  if (brief.forbidden) parts.push(`禁忌：${brief.forbidden}`);
  // 自定义维度：pinned 的常驻注入；其余按需（章节级再挑选）
  for (const s of brief.sections ?? []) {
    if (s.pinned && s.content.trim()) parts.push(`${s.title}：${s.content}`);
  }
  return parts.join('；');
}

// 章节级按需挑选相关维度（仅本章相关的自定义设定，避免全量注入）
export function briefSectionsToContext(
  sections: BriefSection[] | undefined,
  pickedIds: string[],
): string {
  if (!sections?.length || !pickedIds.length) return '';
  return sections
    .filter((s) => pickedIds.includes(s.id) && s.content.trim())
    .map((s) => `${s.title}：${s.content}`)
    .join('；');
}