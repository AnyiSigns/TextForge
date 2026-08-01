// src/shared/stores/editorStore.ts
// 增量迁移 P4：合并 manuscriptStore + workflowStore 的编辑器状态。
// 内存-only（不持久化），使用 plain zustand。
import { create } from 'zustand';

export type WorkflowStatus = 'idle' | 'running' | 'completed' | 'error';

export interface EditorState {
  currentManuscriptId: string | null;
  manuscriptContent: string | null;
  chapterContent: Record<string, string>;
  workflowStatus: WorkflowStatus;
  workflowProgress: number;
  selectedNodes: string[];

  setManuscript: (id: string, content: string) => void;
  updateChapter: (chapterId: string, content: string) => void;
  setWorkflowStatus: (status: WorkflowStatus) => void;
  setWorkflowProgress: (pct: number) => void;
  selectNodes: (ids: string[]) => void;
  clearEditor: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  currentManuscriptId: null,
  manuscriptContent: null,
  chapterContent: {},
  workflowStatus: 'idle',
  workflowProgress: 0,
  selectedNodes: [],

  setManuscript: (id, content) =>
    set({ currentManuscriptId: id, manuscriptContent: content }),

  updateChapter: (chapterId, content) =>
    set((s) => ({
      chapterContent: { ...s.chapterContent, [chapterId]: content },
    })),

  setWorkflowStatus: (status) => set({ workflowStatus: status }),

  setWorkflowProgress: (pct) =>
    set({ workflowProgress: Math.max(0, Math.min(100, pct)) }),

  selectNodes: (ids) => set({ selectedNodes: ids }),

  clearEditor: () =>
    set({
      currentManuscriptId: null,
      manuscriptContent: null,
      chapterContent: {},
      workflowStatus: 'idle',
      workflowProgress: 0,
      selectedNodes: [],
    }),
}));
