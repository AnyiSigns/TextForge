import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { saveDraft, getDraft, saveVersion, getVersionHistory, type ProjectVersion, type ProjectTemplate } from '@/lib/storage/indexedDB';
import { fetchProjects, createProject as apiCreateProject, deleteProject as apiDeleteProject } from '@/lib/api/projects';
import { uid } from '@/lib/utils/id';
import { createIdbStorage } from '@/lib/storage/zustandIdb';
import type { Project, ProjectBrief, Step } from '@/types';
import { syncManager } from '@/lib/storage/syncManager';
import { toast } from 'sonner';
import type { ApiError } from '@/lib/storage/syncQueue';

interface ProjectVersionMeta {
  lastSyncAt: string;
  version?: number;
}

const DEFAULT_TEMPLATES: ProjectTemplate[] = [
  { id: 't-novel', name: '??', description: '????????', genre: 'general', createdAt: new Date(0).toISOString() },
  { id: 't-scifi', name: '????', description: '???????', genre: 'science-fiction', createdAt: new Date(0).toISOString() },
  { id: 't-fantasy', name: '????', description: '??????', genre: 'fantasy', createdAt: new Date(0).toISOString() },
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
            // ????? POST??? If-Match ?????????? 412?
            const created = await apiCreateProject(input);
            const { version } = get().getVersionMeta();
            projectVersionMeta = { lastSyncAt: new Date().toISOString(), version: created.version ?? (version ? version + 1 : 1) };
           set((s) => ({ projects: s.projects.map((p) => (p.id === optimistic.id ? { ...optimistic, id: created.id || optimistic.id, version: created.version } : p)) }));
           return created ?? optimistic;
          } catch (e) {
           const apiError = e as ApiError;
            if (apiError.status === 409) {
              await syncManager.resolveConflict('projects', get().projects, null);
              toast.error('????', { description: '?????????????' });
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
            if (apiError.status === 409) {
              await syncManager.resolveConflict('projects', prev, null);
              toast.error('????', { description: '?????????????' });
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
          id: uid('v'),
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
          title: `?${template?.name || '??'}`,
          description: template?.description || '',
          genre: template?.genre || 'general',
        };
        return get().addProject(input);
      },
    }),
    {
      name: 'novel-projects',
      storage: createIdbStorage(),
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
      projectVersionMeta = { ...projectVersionMeta, lastSyncAt: new Date().toISOString(), version };
    }
  },
  getMeta: () => useProjectStore.getState().getVersionMeta(),
  setMeta: (meta) => useProjectStore.getState().setVersionMeta(meta),
});
