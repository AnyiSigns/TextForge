import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createIdbStorage } from '@/lib/storage/zustandIdb';
import type { AgentMemory } from '@/types';
import { syncManager } from '@/lib/storage/syncManager';

interface MemoryStore {
  memories: AgentMemory[];
  hasHydrated: boolean;

  setMemories: (memories: AgentMemory[]) => void;
  addMemory: (memory: AgentMemory) => void;
  updateMemory: (id: number, patch: Partial<AgentMemory>) => void;
  removeMemory: (id: number) => void;

  setHasHydrated: (v: boolean) => void;
  getVersionMeta: () => { lastSyncAt: string; version?: number };
  setVersionMeta: (meta: { lastSyncAt: string; version?: number }) => void;
}

let memoryVersionMeta: { lastSyncAt: string; version?: number } = { lastSyncAt: new Date(0).toISOString(), version: 0 };

export const useMemoryStore = create<MemoryStore>()(
  persist(
    (set) => ({
      memories: [],
      hasHydrated: false,

      setHasHydrated: (v) => set({ hasHydrated: v }),

      setMemories: (memories) => set({ memories }),
      addMemory: (memory) => set((s) => ({ memories: [...s.memories, memory] })),
      updateMemory: (id, patch) =>
        set((s) => ({
          memories: s.memories.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      removeMemory: (id) =>
        set((s) => ({ memories: s.memories.filter((m) => m.id !== id) })),

      getVersionMeta: () => memoryVersionMeta,
      setVersionMeta: (meta) => { memoryVersionMeta = meta; },
    }),
    {
      name: 'novel-memories',
      storage: createIdbStorage(),
      partialize: (s) => ({
        memories: s.memories,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

setTimeout(() => {
  syncManager.register({
    name: 'memories',
    applyUpdates: (updates) => {
      const memoryUpdates = updates as AgentMemory[];
      if (memoryUpdates.length) {
        const current = useMemoryStore.getState().memories;
        const map = new Map(memoryUpdates.map((m) => [m.id, m]));
        const merged = current.map((m) => map.get(m.id) || m);
        useMemoryStore.getState().setMemories(merged);
      }
    },
    getMeta: () => useMemoryStore.getState().getVersionMeta(),
    setMeta: (meta) => useMemoryStore.getState().setVersionMeta(meta),
  });
}, 0);