// src/lib/stores/portfolioStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { MediaTask } from '@/lib/api/generation';
import { syncManager } from '@/lib/storage/syncManager';
import { createIdbStorage } from '@/lib/storage/zustandIdb';

interface PortfolioStore {
  portfolio: MediaTask[];
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;

  setPortfolio: (portfolio: MediaTask[]) => void;
  addToPortfolio: (item: MediaTask) => void;
  removeFromPortfolio: (id: string) => void;
  updateInPortfolio: (id: string, updates: Partial<MediaTask>) => void;

  getVersionMeta: () => { lastSyncAt: string; version?: number };
  setVersionMeta: (meta: { lastSyncAt: string; version?: number }) => void;
}

let portfolioVersionMeta: { lastSyncAt: string; version?: number } = { lastSyncAt: new Date(0).toISOString(), version: 0 };

export const usePortfolioStore = create<PortfolioStore>()(
  persist(
    (set) => ({
      portfolio: [],
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),

      setPortfolio: (portfolio) => set({ portfolio }),
      addToPortfolio: (item) => set((s) => ({ portfolio: [...s.portfolio, item] })),
      removeFromPortfolio: (id) => set((s) => ({ portfolio: s.portfolio.filter((item) => item.id !== id) })),
      updateInPortfolio: (id, updates) => set((s) => ({
        portfolio: s.portfolio.map((item) => (item.id === id ? { ...item, ...updates } : item))
      })),

      getVersionMeta: () => portfolioVersionMeta,
      setVersionMeta: (meta) => { portfolioVersionMeta = meta; },
    }),
    {
      name: 'novel-portfolio',
      storage: createIdbStorage(),
      partialize: (s) => ({ portfolio: s.portfolio }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

// 注册统一同步管理器
syncManager.register({
  name: 'portfolio',
  applyUpdates: (updates, version) => {
    const current = usePortfolioStore.getState().portfolio;
    const map = new Map((updates as MediaTask[]).map((u) => [u.id, u]));
    const portfolio = current.map((t) => map.get(t.id) || t);
    usePortfolioStore.setState({ portfolio });
    if (version !== undefined) {
      portfolioVersionMeta = { ...portfolioVersionMeta, lastSyncAt: new Date().toISOString(), version };
    }
  },
  getMeta: () => usePortfolioStore.getState().getVersionMeta(),
  setMeta: (meta) => usePortfolioStore.getState().setVersionMeta(meta),
});