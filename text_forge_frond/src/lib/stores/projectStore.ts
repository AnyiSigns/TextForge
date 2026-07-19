import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getItem, setItem, removeItem, saveDraft, getDraft, saveVersion, getVersionHistory, type ProjectVersion, type ProjectTemplate } from '@/lib/storage/indexedDB';
import { fetchProjects, createProject as apiCreateProject, deleteProject as apiDeleteProject } from '@/lib/api/projects';
import type { Project, ProjectBrief, Step } from '@/types';
import { syncManager } from '@/lib/storage/syncManager';
import { toast } from 'sonner';
import type { ApiError } from '@/lib/storage/syncQueue';

interface ProjectVersionMeta {
  lastSyncAt: string;
  version?: number;
}

const DEFAULT_TEMPLATES: ProjectTemplate[] = [
  { id: 't-novel', name: '小说', description: '标准小说创作流程', genre: 'general', createdAt: new Date(0).toISOString() },
  { id: 't-scifi', name: '科幻小说', description: '科幻世界观模板', genre: 'science-fiction', createdAt: new Date(0).toISOString() },
  { id: 't-fantasy', name: '奇幻小说', description: '奇幻冒险模板', genre: 'fantasy', createdAt: new Date(0).toISOString() },
];

interface ProjectStore {
  projects: Project[];
  loaded: boolean;
  hasHydrated: boolean;
  templates: ProjectTemplate[];
  setHasHydrated: (v: boolean) => void;
  load: () => Promise<void>;
  addProject: (input: { title: string; description: string; genre: string }) => Promise<Project>;
  removeProject: (id: string) => Promise<void>;
  togglePin: (id: string) => void;
  getVersionMeta: () => ProjectVersionMeta;
  setVersionMeta: (meta: ProjectVersionMeta) => void;
  saveDraft: (projectId: string, steps: Step[]) => Promise<void>;
  getDraft: (projectId: string) => Promise<Step[] | null>;
  saveVersion: (projectId: string, steps: Step[], brief?: ProjectBrief) => Promise<void>;
  getVersionHistory: (projectId: string) => Promise<ProjectVersion[]>;
  loadTemplates: () => Promise<void>;
  createProject: (templateId?: string) => Promise<Project>;
}

const idbStorage = {
  getItem: async (name: string): Promise<string | null> => (await getItem<string>(name)) ?? null,
  setItem: async (name: string, value: string): Promise<void> => { await setItem(name, value); },
  removeItem: async (name: string): Promise<void> => { await removeItem(name); },
};

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyVersionMeta(): ProjectVersionMeta {
  return { lastSyncAt: new Date(0).toISOString(), version: 0 };
}

let projectVersionMeta = emptyVersionMeta();

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],
      loaded: false,
      hasHydrated: false,
      templates: DEFAULT_TEMPLATES,
      setHasHydrated: (v) => set({ hasHydrated: v }),
      getVersionMeta: () => projectVersionMeta,
      setVersionMeta: (meta) => { projectVersionMeta = meta; },

      load: async () => {
        if (get().loaded) return;
        try {
          const projects = await fetchProjects();
          set({ projects, loaded: true });
        } catch {
          set({ loaded: true });
        }
      },

addProject: async (input) => {
         const now = new Date().toISOString();
         const optimistic: Project = {
           id: uid(),
           title: input.title,
           description: input.description,
           genre: input.genre,
           status: 'draft',
           createdAt: now,
           updatedAt: now,
         };
         set((s) => ({ projects: [optimistic, ...s.projects] }));
          try {
            // 新建资源用 POST，不带 If-Match 乐观锁头（否则后端会 412）
            const created = await apiCreateProject(input);
            const { version } = get().getVersionMeta();
            projectVersionMeta = { lastSyncAt: new Date().toISOString(), version: created.version ?? (version ? version + 1 : 1) };
           set((s) => ({ projects: s.projects.map((p) => (p.id === optimistic.id ? { ...optimistic, id: created.id || optimistic.id, version: created.version } : p)) }));
           return created ?? optimistic;
         } catch (e) {
           const apiError = e as ApiError;
           if (apiError.response?.status === 409) {
             await syncManager.resolveConflict('projects', get().projects, null);
             toast.error('数据冲突', { description: '本地修改已保留（前端优先）' });
           }
           set((s) => ({ projects: s.projects.filter((p) => p.id !== optimistic.id) }));
           throw e;
         }
       },

       removeProject: async (id) => {
         const prev = get().projects;
         set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
         try {
           const { version } = get().getVersionMeta();
           await apiDeleteProject(id, version);
           projectVersionMeta = { ...get().getVersionMeta(), lastSyncAt: new Date().toISOString(), version: (version ? version + 1 : 1) };
         } catch (e) {
           const apiError = e as ApiError;
           if (apiError.response?.status === 409) {
             await syncManager.resolveConflict('projects', prev, null);
             toast.error('数据冲突', { description: '本地修改已保留（前端优先）' });
           }
           set({ projects: prev });
           throw e;
         }
       },

      togglePin: (id) => {
        set({
          projects: get().projects.map((p) =>
            p.id === id ? { ...p, pinned: !p.pinned } : p
          ),
        });
      },

      saveDraft: async (projectId, steps) => {
        await saveDraft(projectId, steps);
      },

      getDraft: async (projectId) => {
        const draft = await getDraft(projectId);
        return draft?.steps ?? null;
      },

      saveVersion: async (projectId, steps, brief) => {
        const version: ProjectVersion = {
          id: `v-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}`,
          projectId,
          steps,
          brief,
          createdAt: new Date().toISOString(),
          wordCount: steps.reduce((acc, s) => acc + (s.content?.length || 0), 0),
        };
        await saveVersion(projectId, version);
      },

      getVersionHistory: async (projectId) => {
        return getVersionHistory(projectId);
      },

      loadTemplates: async () => {
        set({ templates: DEFAULT_TEMPLATES });
      },

      createProject: async (templateId) => {
        const template = templateId ? DEFAULT_TEMPLATES.find((t) => t.id === templateId) : undefined;
        const input = {
          title: `新${template?.name || '项目'}`,
          description: template?.description || '',
          genre: template?.genre || 'general',
        };
        return get().addProject(input);
      },
    }),
    {
      name: 'novel-projects',
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ projects: s.projects }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

syncManager.register({
  name: 'projects',
  applyUpdates: (updates, version) => {
    useProjectStore.setState((s) => {
      const map = new Map((updates as Project[]).map((u) => [u.id, u]));
      const projects = s.projects.map((p) => map.get(p.id) || p);
      return { projects };
    });
    if (version !== undefined) {
      projectVersionMeta.version = version;
    }
  },
  getMeta: () => useProjectStore.getState().getVersionMeta(),
  setMeta: (meta) => useProjectStore.getState().setVersionMeta(meta),
});