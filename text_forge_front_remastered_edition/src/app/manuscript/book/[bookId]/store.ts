'use client';

import { create } from 'zustand';
import { toast } from 'sonner';
import * as booksApi from '@/shared/api/books';
import * as contentsApi from '@/shared/api/contents';
import * as charactersApi from '@/shared/api/characters';
import type { Volume, Chapter, CreativeSetting, Character } from '@/shared/api/types';

interface ChapterTreeItem {
  id: number;
  title: string;
  type: 'volume' | 'chapter';
  chapterId?: number;
  volumeId?: number;
  sortOrder: number;
}

export type SuggestionFrequency = 'off' | 'medium' | 'high';

interface HoverPreview {
  chapterId: number;
  title: string;
  content: string;
  top: number;
  left: number;
}

interface ManuscriptState {
  bookId: number;
  bookTitle: string;
  volumes: (Volume & { chapters: Chapter[] })[];
  chapters: ChapterTreeItem[];
  loading: boolean;
  error: string | null;

  characters: Character[];
  creativeSetting: CreativeSetting | null;

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

  focusMode: boolean;
  treeWidth: number;
  suggestionFrequency: SuggestionFrequency;
  showSuggestHint: boolean;
  hoverPreview: HoverPreview | null;
  previewCache: Record<number, string>;

  loadBook: (bookId: number) => Promise<void>;
  setActiveChapter: (chapterId: number) => void;
  setContent: (content: string) => void;
  setChapterTitle: (title: string) => void;
  save: () => Promise<void>;
  loadVersions: () => Promise<void>;
  showDiff: (fromVersion: number, toVersion: number) => Promise<void>;
  clearDiff: () => void;
  toggleVersions: () => void;

  addVolume: (title?: string) => Promise<void>;
  addChapter: (volumeId: number, title?: string) => Promise<void>;
  removeChapter: (chapterId: number) => Promise<void>;
  reorderChapters: (draggedId: number, targetId: number) => Promise<void>;
  importBook: (chapters: { title: string; content: string }[]) => Promise<void>;

  toggleFocusMode: () => void;
  setTreeWidth: (width: number) => void;
  setSuggestionFrequency: (freq: SuggestionFrequency) => void;
  dismissSuggestHint: () => void;

  requestHoverPreview: (chapterId: number, title: string, top: number, left: number) => void;
  clearHoverPreview: () => void;
}

const TREE_WIDTH_KEY = 'tf_ms_tree_width';
const FOCUS_KEY = 'tf_ms_focus';
const FREQ_KEY = 'tf_ms_suggest_freq';
const HINT_KEY = 'tf_ms_suggest_hint_seen';

function readNumber(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    if (v == null) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function buildTree(vols: (Volume & { chapters: Chapter[] })[]): ChapterTreeItem[] {
  const tree: ChapterTreeItem[] = [];
  for (const v of vols) {
    tree.push({ id: v.id, title: v.title || `第${v.sortOrder}卷`, type: 'volume', volumeId: v.id, sortOrder: v.sortOrder });
    for (const ch of v.chapters) {
      tree.push({ id: ch.id, title: ch.title, type: 'chapter', chapterId: ch.id, volumeId: v.id, sortOrder: ch.sortOrder });
    }
  }
  return tree;
}

export const useManuscriptStore = create<ManuscriptState>((set, get) => {
  const refreshTree = async () => {
    const { bookId, activeChapterId } = get();
    const vols = await booksApi.fetchChaptersTree(bookId);
    set({ volumes: vols, chapters: buildTree(vols), activeChapterId });
  };

  return {
    bookId: 0,
    bookTitle: '',
    volumes: [],
    chapters: [],
    loading: false,
    error: null,

    characters: [],
    creativeSetting: null,

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

    focusMode: false,
    treeWidth: 260,
    suggestionFrequency: 'medium',
    showSuggestHint: false,
    hoverPreview: null,
    previewCache: {},

    loadBook: async (bookId) => {
      set({ loading: true, error: null });
      try {
        const [book, vols, chars, setting] = await Promise.all([
          booksApi.fetchBook(bookId),
          booksApi.fetchChaptersTree(bookId),
          charactersApi.fetchCharacters(bookId).catch(() => [] as Character[]),
          booksApi.fetchCreativeSetting(bookId).catch(() => null as CreativeSetting | null),
        ]);
        set({
          bookId,
          bookTitle: book.title,
          volumes: vols,
          chapters: buildTree(vols),
          loading: false,
          characters: chars,
          creativeSetting: setting,
          focusMode: readNumber(FOCUS_KEY, 0) === 1,
          treeWidth: Math.min(480, Math.max(180, readNumber(TREE_WIDTH_KEY, 260))),
          suggestionFrequency: (localStorage.getItem(FREQ_KEY) as SuggestionFrequency) || 'medium',
          showSuggestHint: localStorage.getItem(HINT_KEY) !== '1',
        });
      } catch {
        set({ loading: false, error: '加载失败，请检查网络连接或登录状态' });
      }
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
      } catch (err) {
        set({ saving: false });
        // 1.4（〇-5）：保存失败必须展示具体原因（锁定章 409 / 网络错误），避免静默失败
        toast.error(`保存失败：${err instanceof Error && err.message ? err.message : '请稍后重试'}`);
      }
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

    addVolume: async (title) => {
      const { bookId } = get();
      await booksApi.createVolume(bookId, title ?? '新卷');
      await refreshTree();
    },

    addChapter: async (volumeId, title) => {
      const { chapters } = get();
      const count = chapters.filter((c) => c.volumeId === volumeId && c.type === 'chapter').length;
      const ch = await booksApi.createChapter(volumeId, { title: title ?? `第 ${count + 1} 章` });
      await refreshTree();
      get().setActiveChapter(ch.id);
    },

    removeChapter: async (chapterId) => {
      const { activeChapterId } = get();
      await booksApi.deleteChapter(chapterId);
      if (activeChapterId === chapterId) {
        const remaining = get().chapters.filter((c) => c.type === 'chapter' && c.chapterId !== chapterId);
        const next = remaining[0]?.chapterId ?? null;
        set({ activeChapterId: next, activeChapterTitle: '', content: '', version: 0, dirty: false });
      }
      await refreshTree();
    },

    reorderChapters: async (draggedId, targetId) => {
      const { chapters } = get();
      const dragged = chapters.find((c) => c.chapterId === draggedId);
      const target = chapters.find((c) => c.chapterId === targetId);
      if (!dragged || !target || dragged.volumeId !== target.volumeId) return;
      const ids = chapters
        .filter((c) => c.volumeId === dragged.volumeId && c.type === 'chapter')
        .map((c) => c.chapterId as number);
      const fromIdx = ids.indexOf(draggedId);
      const toIdx = ids.indexOf(targetId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
      ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]);
      const order = new Map(ids.map((id, i) => [id, i + 1]));
      set((s) => ({
        chapters: s.chapters.map((c) =>
          c.chapterId && order.has(c.chapterId) ? { ...c, sortOrder: order.get(c.chapterId) as number } : c,
        ),
      }));
      for (const id of ids) {
        await booksApi.updateChapter(id, { sortOrder: order.get(id) as number }).catch(() => {});
      }
      await refreshTree();
    },

    importBook: async (items) => {
      const { bookId, volumes } = get();
      let volumeId = volumes[0]?.id;
      if (!volumeId) {
        const v = await booksApi.createVolume(bookId, '导入');
        volumeId = v.id;
      }
      for (const item of items) {
        const ch = await booksApi.createChapter(volumeId, { title: item.title });
        if (item.content) await contentsApi.saveContent(ch.id, item.content).catch(() => {});
      }
      await refreshTree();
    },

    toggleFocusMode: () =>
      set((s) => {
        const next = !s.focusMode;
        try { localStorage.setItem(FOCUS_KEY, next ? '1' : '0'); } catch { /* ignore */ }
        return { focusMode: next };
      }),

    setTreeWidth: (width) => {
      const clamped = Math.min(480, Math.max(180, Math.round(width)));
      try { localStorage.setItem(TREE_WIDTH_KEY, String(clamped)); } catch { /* ignore */ }
      set({ treeWidth: clamped });
    },

    setSuggestionFrequency: (freq) => {
      try { localStorage.setItem(FREQ_KEY, freq); } catch { /* ignore */ }
      set({ suggestionFrequency: freq });
    },

    dismissSuggestHint: () => {
      try { localStorage.setItem(HINT_KEY, '1'); } catch { /* ignore */ }
      set({ showSuggestHint: false });
    },

    requestHoverPreview: (chapterId, title, top, left) => {
      const { previewCache, hoverPreview } = get();
      if (hoverPreview?.chapterId === chapterId) return;
      const cached = previewCache[chapterId];
      if (cached !== undefined) {
        set({ hoverPreview: { chapterId, title, content: cached, top, left } });
        return;
      }
      contentsApi.fetchLatestContent(chapterId).then((latest) => {
        set((s) => ({
          previewCache: { ...s.previewCache, [chapterId]: latest.content || '' },
          hoverPreview: { chapterId, title, content: latest.content || '', top, left },
        }));
      }).catch(() => {
        set({ hoverPreview: { chapterId, title, content: '（暂无内容）', top, left } });
      });
    },

    clearHoverPreview: () => set({ hoverPreview: null }),
  };
});
