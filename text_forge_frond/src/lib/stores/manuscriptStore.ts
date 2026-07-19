// src/lib/stores/manuscriptStore.ts
// 作家手稿：独立于工作台 AI steps，按项目维护章节树（增删改、排序、导入/导出）。
import { create } from 'zustand';
import type { ManuscriptChapter } from '@/types';
import {
  putManuscriptChapter,
  getManuscriptChapters,
  deleteManuscriptChapter,
  deleteManuscriptByProject,
} from '@/lib/storage/indexedDB';

import { uid } from '@/lib/utils/id';

interface ManuscriptStore {
  chapters: ManuscriptChapter[];
  loadedProject: string | null;
  load: (projectId: string) => Promise<void>;
  addChapter: (projectId: string, title?: string) => Promise<ManuscriptChapter>;
  updateChapter: (id: string, patch: Partial<Pick<ManuscriptChapter, 'title' | 'content' | 'index'>>) => Promise<void>;
  removeChapter: (id: string) => Promise<void>;
  importFromStep: (projectId: string, title: string, content: string, linkedStepId?: string, source?: 'ai' | 'ai_edited' | 'manual' | 'imported') => Promise<ManuscriptChapter>;
  clearProject: (projectId: string) => Promise<void>;
  byProject: (projectId: string) => ManuscriptChapter[];
}

export const useManuscriptStore = create<ManuscriptStore>((set, get) => ({
  chapters: [],
  loadedProject: null,

  load: async (projectId) => {
    const chapters = await getManuscriptChapters(projectId);
    set({ chapters, loadedProject: projectId });
  },

  addChapter: async (projectId, title) => {
    const list = get().chapters.filter((c) => c.projectId === projectId);
    // 默认标题基于实时列表长度，并对重名做去重（避免并发/双调用产生同名"第 N 章"）
    let finalTitle = title || `第 ${list.length + 1} 章`;
    if (!title) {
      const existing = new Set(list.map((c) => c.title));
      let n = list.length + 1;
      while (existing.has(`第 ${n} 章`)) n += 1;
      finalTitle = `第 ${n} 章`;
    }
    const chapter: ManuscriptChapter = {
      id: uid('ms'),
      projectId,
      index: list.length,
      title: finalTitle,
      content: '',
      updatedAt: new Date().toISOString(),
      source: 'manual',
    };
    await putManuscriptChapter(chapter);
    set((s) => ({ chapters: [...s.chapters, chapter] }));
    return chapter;
  },

  updateChapter: async (id, patch) => {
    const prev = get().chapters.find((c) => c.id === id);
    if (!prev) return;
    const next: ManuscriptChapter = { ...prev, ...patch, updatedAt: new Date().toISOString() };
    await putManuscriptChapter(next);
    set((s) => ({ chapters: s.chapters.map((c) => (c.id === id ? next : c)) }));
  },

  removeChapter: async (id) => {
    await deleteManuscriptChapter(id);
    set((s) => ({ chapters: s.chapters.filter((c) => c.id !== id) }));
  },

  importFromStep: async (projectId, title, content, linkedStepId, source = 'imported') => {
    const list = get().chapters.filter((c) => c.projectId === projectId);
    const chapter: ManuscriptChapter = {
      id: uid('ms'),
      projectId,
      index: list.length,
      title: title || `导入章节 ${list.length + 1}`,
      content,
      updatedAt: new Date().toISOString(),
      source,
      linkedStepId,
    };
    await putManuscriptChapter(chapter);
    set((s) => ({ chapters: [...s.chapters, chapter] }));
    return chapter;
  },

  clearProject: async (projectId) => {
    await deleteManuscriptByProject(projectId);
    set((s) => ({ chapters: s.chapters.filter((c) => c.projectId !== projectId) }));
  },

  byProject: (projectId) => get().chapters.filter((c) => c.projectId === projectId),
}));
