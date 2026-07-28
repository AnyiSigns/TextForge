import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { saveDraft, getDraft, saveVersion, getVersionHistory, type ProjectVersion, type ProjectTemplate } from '@/lib/storage/indexedDB';
import { fetchBooks, createBook as apiCreateBook, deleteBook as apiDeleteBook } from '@/features/projects';
import { uid } from '@/lib/utils/id';
import { createIdbStorage } from '@/lib/storage/zustandIdb';
import type { Book, Step } from '@/types';
import { syncManager } from '@/lib/storage/syncManager';
import { toast } from 'sonner';
import type { ApiError } from '@/lib/storage/syncQueue';

interface BookVersionMeta {
  lastSyncAt: string;
  version?: number;
}

const DEFAULT_TEMPLATES: ProjectTemplate[] = [
  { id: 't-novel', name: '通用小说', description: '适合各类题材的通用起点：先定设定与人物，再逐步推进章节。', genre: 'general', createdAt: new Date(0).toISOString() },
  { id: 't-scifi', name: '科幻', description: '以科技、未来与世界设定驱动：先搭世界观与核心概念，再展开人物与情节。', genre: 'science-fiction', createdAt: new Date(0).toISOString() },
  { id: 't-fantasy', name: '奇幻', description: '以魔法、种族与架空大陆为背景：先立世界规则与势力，再写冒险主线。', genre: 'fantasy', createdAt: new Date(0).toISOString() },
];

interface BookStore {
  books: Book[];
  loaded: boolean;
  hasHydrated: boolean;
  templates: ProjectTemplate[];
  setHasHydrated: (v: boolean) => void;
  load: () => Promise<void>;
  addBook: (input: { title: string; description: string; genre: string }) => Promise<Book>;
  removeBook: (id: number) => Promise<void>;
  togglePin: (id: number) => void;
  getVersionMeta: () => BookVersionMeta;
  setVersionMeta: (meta: BookVersionMeta) => void;
  saveDraft: (bookId: number, steps: Step[]) => Promise<void>;
  getDraft: (bookId: number) => Promise<Step[] | null>;
  saveVersion: (bookId: number, steps: Step[]) => Promise<void>;
  getVersionHistory: (bookId: number) => Promise<ProjectVersion[]>;
}
function emptyVersionMeta(): BookVersionMeta {
  return { lastSyncAt: new Date(0).toISOString(), version: 0 };
}

let bookVersionMeta = emptyVersionMeta();

export const useBookStore = create<BookStore>()(
  persist(
    (set, get) => ({
      books: [],
      loaded: false,
      hasHydrated: false,
      templates: DEFAULT_TEMPLATES,
      setHasHydrated: (v) => set({ hasHydrated: v }),
      getVersionMeta: () => bookVersionMeta,
      setVersionMeta: (meta) => { bookVersionMeta = meta; },

      load: async () => {
        if (get().loaded) return;
        try {
          const books = await fetchBooks();
          set({ books, loaded: true });
        } catch {
          set({ loaded: true });
        }
      },

      addBook: async (input) => {
        const now = new Date().toISOString();
        const optimistic: Book = {
          id: Date.now(),
          title: input.title,
          description: input.description,
          genre: input.genre,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ books: [optimistic, ...s.books] }));
        try {
          const created = await apiCreateBook(input);
          set((s) => ({ books: s.books.map((b) => (b.id === optimistic.id ? { ...optimistic, id: created.id || optimistic.id } : b)) }));
          return created ?? optimistic;
        } catch (e) {
          const apiError = e as ApiError;
          if (apiError.status === 409) {
            await syncManager.resolveConflict('books', get().books, null);
            toast.error('创建冲突', { description: '服务器已有更新版本，已尝试自动合并，请重试' });
          }
          set((s) => ({ books: s.books.filter((b) => b.id !== optimistic.id) }));
          throw e;
        }
      },

      removeBook: async (id) => {
        const prev = get().books;
        set((s) => ({ books: s.books.filter((b) => b.id !== id) }));
        try {
          await apiDeleteBook(id);
        } catch (e) {
          const apiError = e as ApiError;
          if (apiError.status === 409) {
            await syncManager.resolveConflict('books', prev, null);
            toast.error('删除冲突', { description: '服务器已有更新版本，已尝试自动合并，请重试' });
          }
          set({ books: prev });
          throw e;
        }
      },

      togglePin: (id) => {
        set({
          books: get().books.map((b) =>
            b.id === id ? { ...b, pinned: !b.pinned } : b
          ),
        });
      },

      saveDraft: async (bookId, steps) => {
        await saveDraft(String(bookId), steps);
      },

      getDraft: async (bookId) => {
        const draft = await getDraft(String(bookId));
        return draft?.steps ?? null;
      },

      saveVersion: async (bookId, steps) => {
        const version: ProjectVersion = {
          id: uid('v'),
          bookId: String(bookId),
          steps,
          createdAt: new Date().toISOString(),
          wordCount: steps.reduce((acc, s) => acc + (s.content?.length || 0), 0),
        };
        await saveVersion(String(bookId), version);
      },

      getVersionHistory: async (bookId) => {
        return getVersionHistory(String(bookId));
      },
    }),
    {
      name: 'novel-books',
      storage: createIdbStorage(),
      partialize: (s) => ({ books: s.books }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/** 兼容旧引用，后续逐步迁移到 useBookStore */
export const useProjectStore = useBookStore;

syncManager.register({
  name: 'books',
  applyUpdates: (updates, version) => {
    useBookStore.setState((s) => {
      const map = new Map((updates as Book[]).map((u) => [u.id, u]));
      const books = s.books.map((b) => map.get(b.id) || b);
      return { books };
    });
    if (version !== undefined) {
      bookVersionMeta = { ...bookVersionMeta, lastSyncAt: new Date().toISOString(), version };
    }
  },
  getMeta: () => useBookStore.getState().getVersionMeta(),
  setMeta: (meta) => useBookStore.getState().setVersionMeta(meta),
});
