// src/lib/stores/manuscriptStore.ts
// 作家手稿：独立于工作台 AI steps，按项目维护章节树（增删改、排序、导入/导出）。
import { create } from 'zustand';
import type { ManuscriptChapter } from '@/types';
import {
  putManuscriptChapter,
  getManuscriptChapters,
  deleteManuscriptChapter,
  deleteManuscriptByBook,
} from '@/lib/storage/indexedDB';
import { syncManager } from '@/lib/storage/syncManager';

interface ManuscriptStore {
  chapters: ManuscriptChapter[];
  loadedProject: number | null;
  load: (bookId: number) => Promise<void>;
  addChapter: (bookId: number, title?: string) => Promise<ManuscriptChapter>;
  updateChapter: (id: number, patch: Partial<Pick<ManuscriptChapter, 'title' | 'content' | 'index'>>) => Promise<void>;
  removeChapter: (id: number) => Promise<void>;
  importFromStep: (bookId: number, title: string, content: string, linkedStepId?: string, source?: 'ai' | 'ai_edited' | 'manual' | 'imported') => Promise<ManuscriptChapter>;
  clearProject: (bookId: number) => Promise<void>;
  byProject: (bookId: number) => ManuscriptChapter[];
  setServerChapterId: (localId: number, serverId: number) => Promise<void>;
  getServerChapterId: (localId: number) => number | undefined;
  syncChapterToServer: (localId: number, volumeId: number) => Promise<number | null>;
  getOrCreateDefaultVolume: (bookId: number) => Promise<number>;
  getVersionMeta: () => { lastSyncAt: string; version?: number };
  setVersionMeta: (meta: { lastSyncAt: string; version?: number }) => void;
}

const nextId = (list: ManuscriptChapter[]) => list.reduce((max, c) => Math.max(max, c.id), 0) + 1;

let manuscriptVersionMeta: { lastSyncAt: string; version?: number } = { lastSyncAt: new Date(0).toISOString(), version: 0 };

export const useManuscriptStore = create<ManuscriptStore>((set, get) => ({
  chapters: [],
  loadedProject: null,

   load: async (bookId) => {
     const chapters = await getManuscriptChapters(bookId);
    set({ chapters, loadedProject: bookId });
  },

  addChapter: async (bookId, title) => {
    const list = get().chapters.filter((c) => c.bookId === bookId);
    let finalTitle = title || `第 ${list.length + 1} 章`;
    if (!title) {
      const existing = new Set(list.map((c) => c.title));
      let n = list.length + 1;
      while (existing.has(`第 ${n} 章`)) n += 1;
      finalTitle = `第 ${n} 章`;
    }
    const chapter: ManuscriptChapter = {
      id: nextId(list),
      bookId,
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

  importFromStep: async (bookId, title, content, linkedStepId, source = 'imported') => {
    const list = get().chapters.filter((c) => c.bookId === bookId);
    const chapter: ManuscriptChapter = {
      id: nextId(list),
      bookId,
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

   clearProject: async (bookId) => {
     await deleteManuscriptByBook(bookId);
    set((s) => ({ chapters: s.chapters.filter((c) => c.bookId !== bookId) }));
  },

  byProject: (bookId) => get().chapters.filter((c) => c.bookId === bookId),

  setServerChapterId: async (localId, serverId) => {
    const prev = get().chapters.find((c) => c.id === localId);
    if (!prev) return;
    const next = { ...prev, serverChapterId: serverId };
    await putManuscriptChapter(next);
    set((s) => ({ chapters: s.chapters.map((c) => (c.id === localId ? next : c)) }));
  },

  getServerChapterId: (localId) => get().chapters.find((c) => c.id === localId)?.serverChapterId,

  syncChapterToServer: async (localId, volumeId) => {
    const chapter = get().chapters.find((c) => c.id === localId);
    if (!chapter) return null;
    try {
      const { createChapter } = await import('@/features/projects/api/chapters');
      const created = await createChapter(volumeId, { title: chapter.title, summary: '' });
      await get().setServerChapterId(localId, created.id);
      return created.id;
    } catch {
      return null;
    }
  },

  getOrCreateDefaultVolume: async (bookId: number) => {
    const { fetchBookVolumes } = await import('@/features/projects/api/projects');
    const { createVolume } = await import('@/features/projects/api/volumes');
    const volumes = await fetchBookVolumes(bookId);
    if (volumes.length > 0) return volumes[0].id;
    const created = await createVolume(bookId, { title: '手稿卷', summary: '手稿自动创建' });
    return created.id;
  },

  getVersionMeta: () => manuscriptVersionMeta,

  setVersionMeta: (meta) => {
    manuscriptVersionMeta = meta;
  },
}));

syncManager.register({
  name: 'manuscript',
  applyUpdates: (updates, version) => {
    useManuscriptStore.setState((s) => {
      const map = new Map((updates as ManuscriptChapter[]).map((u) => [u.id, u]));
      const chapters = s.chapters.map((c) => map.get(c.id) || c);
      return { chapters };
    });
    if (version !== undefined) {
      manuscriptVersionMeta = { ...manuscriptVersionMeta, lastSyncAt: new Date().toISOString(), version };
    }
  },
  getMeta: () => useManuscriptStore.getState().getVersionMeta(),
  setMeta: (meta) => useManuscriptStore.getState().setVersionMeta(meta),
});
