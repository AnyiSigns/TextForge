import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createIdbStorage } from '@/lib/storage/zustandIdb';
import type { Location, TimelineEvent, Foreshadowing, PlotThread } from '@/types';
import { syncManager } from '@/lib/storage/syncManager';

interface WorldStore {
  locations: Location[];
  timelineEvents: TimelineEvent[];
  foreshadowings: Foreshadowing[];
  plotThreads: PlotThread[];
  hasHydrated: boolean;

  setLocations: (locations: Location[]) => void;
  addLocation: (location: Location) => void;
  updateLocation: (id: number, patch: Partial<Location>) => void;
  removeLocation: (id: number) => void;

  setTimelineEvents: (events: TimelineEvent[]) => void;
  addTimelineEvent: (event: TimelineEvent) => void;
  updateTimelineEvent: (id: number, patch: Partial<TimelineEvent>) => void;
  removeTimelineEvent: (id: number) => void;

  setForeshadowings: (foreshadowings: Foreshadowing[]) => void;
  addForeshadowing: (foreshadowing: Foreshadowing) => void;
  updateForeshadowing: (id: number, patch: Partial<Foreshadowing>) => void;
  removeForeshadowing: (id: number) => void;

  setPlotThreads: (threads: PlotThread[]) => void;
  addPlotThread: (thread: PlotThread) => void;
  updatePlotThread: (id: number, patch: Partial<PlotThread>) => void;
  removePlotThread: (id: number) => void;

  setHasHydrated: (v: boolean) => void;
  getVersionMeta: () => { lastSyncAt: string; version?: number };
  setVersionMeta: (meta: { lastSyncAt: string; version?: number }) => void;
}

let worldVersionMeta: { lastSyncAt: string; version?: number } = { lastSyncAt: new Date(0).toISOString(), version: 0 };

export const useWorldStore = create<WorldStore>()(
  persist(
    (set) => ({
      locations: [],
      timelineEvents: [],
      foreshadowings: [],
      plotThreads: [],
      hasHydrated: false,

      setHasHydrated: (v) => set({ hasHydrated: v }),

      setLocations: (locations) => set({ locations }),
      addLocation: (location) => set((s) => ({ locations: [...s.locations, location] })),
      updateLocation: (id, patch) =>
        set((s) => ({
          locations: s.locations.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        })),
      removeLocation: (id) =>
        set((s) => ({ locations: s.locations.filter((l) => l.id !== id) })),

      setTimelineEvents: (events) => set({ timelineEvents: events }),
      addTimelineEvent: (event) => set((s) => ({ timelineEvents: [...s.timelineEvents, event] })),
      updateTimelineEvent: (id, patch) =>
        set((s) => ({
          timelineEvents: s.timelineEvents.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      removeTimelineEvent: (id) =>
        set((s) => ({ timelineEvents: s.timelineEvents.filter((e) => e.id !== id) })),

      setForeshadowings: (foreshadowings) => set({ foreshadowings }),
      addForeshadowing: (foreshadowing) => set((s) => ({ foreshadowings: [...s.foreshadowings, foreshadowing] })),
      updateForeshadowing: (id, patch) =>
        set((s) => ({
          foreshadowings: s.foreshadowings.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        })),
      removeForeshadowing: (id) =>
        set((s) => ({ foreshadowings: s.foreshadowings.filter((f) => f.id !== id) })),

      setPlotThreads: (threads) => set({ plotThreads: threads }),
      addPlotThread: (thread) => set((s) => ({ plotThreads: [...s.plotThreads, thread] })),
      updatePlotThread: (id, patch) =>
        set((s) => ({
          plotThreads: s.plotThreads.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      removePlotThread: (id) =>
        set((s) => ({ plotThreads: s.plotThreads.filter((t) => t.id !== id) })),

      getVersionMeta: () => worldVersionMeta,
      setVersionMeta: (meta) => { worldVersionMeta = meta; },
    }),
    {
      name: 'novel-world',
      storage: createIdbStorage(),
      partialize: (s) => ({
        locations: s.locations,
        timelineEvents: s.timelineEvents,
        foreshadowings: s.foreshadowings,
        plotThreads: s.plotThreads,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

setTimeout(() => {
  syncManager.register({
    name: 'world',
    applyUpdates: (updates) => {
      const worldUpdates = updates as { locations?: Location[]; timelineEvents?: TimelineEvent[]; foreshadowings?: Foreshadowing[]; plotThreads?: PlotThread[] };
      const state = useWorldStore.getState();
      if (worldUpdates.locations) state.setLocations(worldUpdates.locations);
      if (worldUpdates.timelineEvents) state.setTimelineEvents(worldUpdates.timelineEvents);
      if (worldUpdates.foreshadowings) state.setForeshadowings(worldUpdates.foreshadowings);
      if (worldUpdates.plotThreads) state.setPlotThreads(worldUpdates.plotThreads);
    },
    getMeta: () => useWorldStore.getState().getVersionMeta(),
    setMeta: (meta) => useWorldStore.getState().setVersionMeta(meta),
  });
}, 0);