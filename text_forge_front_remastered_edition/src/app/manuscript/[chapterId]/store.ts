'use client';

import { create } from 'zustand';
import * as contentsApi from '@/shared/api/contents';

interface ManuscriptState {
  chapterId: number;
  title: string;
  content: string;
  version: number;
  dirty: boolean;
  saving: boolean;
  savedAt: string | null;
  versions: Array<{ version: number; content: string; createdAt: string }>;
  showVersions: boolean;
  diffState: { fromVersion: number; toVersion: number; fromContent: string; toContent: string } | null;

  setChapterId: (id: number) => void;
  setTitle: (title: string) => void;
  setContent: (content: string) => void;
  markDirty: () => void;
  load: (chapterId: number) => Promise<void>;
  save: () => Promise<void>;
  loadVersions: () => Promise<void>;
  showDiff: (fromVersion: number, toVersion: number) => Promise<void>;
  clearDiff: () => void;
  toggleVersions: () => void;
}

export const useManuscriptStore = create<ManuscriptState>((set, get) => ({
  chapterId: 0,
  title: '',
  content: '',
  version: 0,
  dirty: false,
  saving: false,
  savedAt: null,
  versions: [],
  showVersions: false,
  diffState: null,

  setChapterId: (id) => set({ chapterId: id }),
  setTitle: (title) => set({ title }),
  setContent: (content) => set({ content, dirty: true }),
  markDirty: () => set({ dirty: true }),

  load: async (chapterId) => {
    try {
      const latest = await contentsApi.fetchLatestContent(chapterId);
      set({
        chapterId,
        content: latest.content || '',
        version: latest.version,
        dirty: false,
        savedAt: latest.createdAt,
      });
    } catch {
      set({ chapterId, content: '', version: 0, dirty: false });
    }
  },

  save: async () => {
    const { chapterId, content, dirty, saving } = get();
    if (!dirty || saving) return;
    set({ saving: true });
    try {
      const saved = await contentsApi.saveContent(chapterId, content);
      set({ version: saved.version, dirty: false, savedAt: saved.createdAt, saving: false });
    } catch {
      set({ saving: false });
    }
  },

  loadVersions: async () => {
    const { chapterId } = get();
    try {
      const versions = await contentsApi.fetchContentVersions(chapterId);
      set({ versions });
    } catch { /* silent */ }
  },

  showDiff: async (fromVersion, toVersion) => {
    const { chapterId } = get();
    try {
      const diff = await contentsApi.fetchVersionDiff(chapterId, fromVersion, toVersion);
      set({ diffState: diff });
    } catch { /* silent */ }
  },

  clearDiff: () => set({ diffState: null }),
  toggleVersions: () => set((s) => ({ showVersions: !s.showVersions, versions: s.showVersions ? [] : s.versions })),
}));
