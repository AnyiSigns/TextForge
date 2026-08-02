'use client';

import { create } from 'zustand';
import * as booksApi from '@/shared/api/books';
import * as contentsApi from '@/shared/api/contents';
import type { Volume, Chapter } from '@/shared/api/types';

interface ChapterTreeItem {
  id: number;
  title: string;
  type: 'volume' | 'chapter';
  chapterId?: number;
  volumeId?: number;
  sortOrder: number;
}

interface ManuscriptState {
  bookId: number;
  bookTitle: string;
  volumes: (Volume & { chapters: Chapter[] })[];
  chapters: ChapterTreeItem[];

  activeChapterId: number | null;
  activeChapterTitle: string;
  content: string;
  version: number;
  dirty: boolean;
  saving: boolean;
  savedAt: string | null;

  showVersions: boolean;
  versions: Array<{ version: number; content: string; createdAt: string }>;
  diffState: { fromVersion: number; toVersion: number; fromContent: string; toContent: string } | null;

  loadBook: (bookId: number) => Promise<void>;
  setActiveChapter: (chapterId: number) => void;
  setContent: (content: string) => void;
  setChapterTitle: (title: string) => void;
  save: () => Promise<void>;
  loadVersions: () => Promise<void>;
  showDiff: (fromVersion: number, toVersion: number) => Promise<void>;
  clearDiff: () => void;
  toggleVersions: () => void;
}

export const useManuscriptStore = create<ManuscriptState>((set, get) => ({
  bookId: 0,
  bookTitle: '',
  volumes: [],
  chapters: [],

  activeChapterId: null,
  activeChapterTitle: '',
  content: '',
  version: 0,
  dirty: false,
  saving: false,
  savedAt: null,

  showVersions: false,
  versions: [],
  diffState: null,

  loadBook: async (bookId) => {
    try {
      const book = await booksApi.fetchBook(bookId);
      const vols = await booksApi.fetchChaptersTree(bookId);
      const tree: ChapterTreeItem[] = [];
      for (const v of vols) {
        tree.push({ id: v.id, title: v.title || `第${v.sortOrder}卷`, type: 'volume', volumeId: v.id, sortOrder: v.sortOrder });
        for (const ch of v.chapters) {
          tree.push({ id: ch.id, title: ch.title, type: 'chapter', chapterId: ch.id, volumeId: v.id, sortOrder: ch.sortOrder });
        }
      }
      set({ bookId, bookTitle: book.title, volumes: vols, chapters: tree });
    } catch { /* silent */ }
  },

  setActiveChapter: (chapterId) => {
    const ch = get().chapters.find((c) => c.chapterId === chapterId);
    if (!ch) return;
    set({
      activeChapterId: chapterId,
      activeChapterTitle: ch.title,
      content: '',
      version: 0,
      dirty: false,
      savedAt: null,
    });
    contentsApi.fetchLatestContent(chapterId).then((latest) => {
      set({ content: latest.content || '', version: latest.version, savedAt: latest.createdAt });
    }).catch(() => {});
  },

  setContent: (content) => set({ content, dirty: true }),
  setChapterTitle: (title) => set({ activeChapterTitle: title, dirty: true }),

  save: async () => {
    const { activeChapterId, content, dirty, saving } = get();
    if (!activeChapterId || !dirty || saving) return;
    set({ saving: true });
    try {
      const saved = await contentsApi.saveContent(activeChapterId, content);
      set({ version: saved.version, dirty: false, savedAt: saved.createdAt, saving: false });
    } catch { set({ saving: false }); }
  },

  loadVersions: async () => {
    const { activeChapterId } = get();
    if (!activeChapterId) return;
    try {
      const versions = await contentsApi.fetchContentVersions(activeChapterId);
      set({ versions });
    } catch { /* silent */ }
  },

  showDiff: async (fromVersion, toVersion) => {
    const { activeChapterId } = get();
    if (!activeChapterId) return;
    try {
      const diff = await contentsApi.fetchVersionDiff(activeChapterId, fromVersion, toVersion);
      set({ diffState: diff });
    } catch { /* silent */ }
  },

  clearDiff: () => set({ diffState: null }),
  toggleVersions: () => set((s) => ({ showVersions: !s.showVersions })),
}));
