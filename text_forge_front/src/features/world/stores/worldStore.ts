import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createIdbStorage } from '@/lib/storage/zustandIdb';
import type { Location, TimelineEvent, Foreshadowing, PlotThread } from '@/types';
import { syncManager } from '@/lib/storage/syncManager';
import {
  fetchLocations,
  createLocation as apiCreateLocation,
  updateLocation as apiUpdateLocation,
  deleteLocation as apiDeleteLocation,
} from '@/features/world/api/locations';
import {
  fetchTimelineEvents,
  createTimelineEvent as apiCreateTimelineEvent,
  updateTimelineEvent as apiUpdateTimelineEvent,
  deleteTimelineEvent as apiDeleteTimelineEvent,
} from '@/features/world/api/timeline';
import {
  fetchForeshadowings,
  createForeshadowing as apiCreateForeshadowing,
  updateForeshadowing as apiUpdateForeshadowing,
  deleteForeshadowing as apiDeleteForeshadowing,
} from '@/features/world/api/foreshadowing';
import {
  fetchPlotThreads,
  createPlotThread as apiCreatePlotThread,
  updatePlotThread as apiUpdatePlotThread,
  deletePlotThread as apiDeletePlotThread,
} from '@/features/world/api/plotThreads';

interface WorldStore {
  locations: Location[];
  timelineEvents: TimelineEvent[];
  foreshadowings: Foreshadowing[];
  plotThreads: PlotThread[];
  hasHydrated: boolean;

  load: (bookId: number) => Promise<void>;

  setLocations: (locations: Location[]) => void;
  addLocation: (bookId: number, input: Partial<Location>) => Promise<Location>;
  updateLocation: (id: number, patch: Partial<Location>) => Promise<Location>;
  removeLocation: (id: number, bookId: number) => Promise<void>;

  setTimelineEvents: (events: TimelineEvent[]) => void;
  addTimelineEvent: (bookId: number, input: Partial<TimelineEvent>) => Promise<TimelineEvent>;
  updateTimelineEvent: (id: number, patch: Partial<TimelineEvent>) => Promise<TimelineEvent>;
  removeTimelineEvent: (id: number, bookId: number) => Promise<void>;

  setForeshadowings: (foreshadowings: Foreshadowing[]) => void;
  addForeshadowing: (bookId: number, input: Partial<Foreshadowing>) => Promise<Foreshadowing>;
  updateForeshadowing: (id: number, patch: Partial<Foreshadowing>) => Promise<Foreshadowing>;
  removeForeshadowing: (id: number, bookId: number) => Promise<void>;

  setPlotThreads: (threads: PlotThread[]) => void;
  addPlotThread: (bookId: number, input: Partial<PlotThread>) => Promise<PlotThread>;
  updatePlotThread: (id: number, patch: Partial<PlotThread>) => Promise<PlotThread>;
  removePlotThread: (id: number, bookId: number) => Promise<void>;

  setHasHydrated: (v: boolean) => void;
  getVersionMeta: () => { lastSyncAt: string; version?: number };
  setVersionMeta: (meta: { lastSyncAt: string; version?: number }) => void;
}

let worldVersionMeta: { lastSyncAt: string; version?: number } = { lastSyncAt: new Date(0).toISOString(), version: 0 };
let tempId = 0;
const nextTempId = (): number => --tempId;

export const useWorldStore = create<WorldStore>()(
  persist(
    (set, get) => ({
      locations: [],
      timelineEvents: [],
      foreshadowings: [],
      plotThreads: [],
      hasHydrated: false,

      setHasHydrated: (v) => set({ hasHydrated: v }),

      load: async (bookId) => {
        try {
          const [locations, timelineEvents, foreshadowings, plotThreads] = await Promise.all([
            fetchLocations(bookId),
            fetchTimelineEvents(bookId),
            fetchForeshadowings(bookId),
            fetchPlotThreads(bookId),
          ]);
          set({ locations, timelineEvents, foreshadowings, plotThreads });
        } catch {
          // 后端未就绪，保留本地 IndexedDB 缓存
        }
      },

      setLocations: (locations) => set({ locations }),
      addLocation: async (bookId, input) => {
        const now = new Date().toISOString();
        const optimistic: Location = { id: nextTempId(), bookId, ...input, createdAt: now, updatedAt: now } as Location;
        set((s) => ({ locations: [...s.locations, optimistic] }));
        try {
          const created = await apiCreateLocation(bookId, input);
          set((s) => ({
            locations: s.locations.map((l) => (l.id === optimistic.id ? created : l)),
          }));
          return created;
        } catch (e) {
          set((s) => ({ locations: s.locations.filter((l) => l.id !== optimistic.id) }));
          throw e;
        }
      },
      updateLocation: async (id, patch) => {
        const prev = get().locations;
        set((s) => ({
          locations: s.locations.map((l) =>
            l.id === id ? { ...l, ...patch, updatedAt: new Date().toISOString() } : l,
          ),
        }));
        try {
          const updated = await apiUpdateLocation(id, patch);
          set((s) => ({
            locations: s.locations.map((l) => (l.id === id ? updated : l)),
          }));
          return updated;
        } catch (e) {
          set({ locations: prev });
          throw e;
        }
      },
      removeLocation: async (id, bookId) => {
        const prev = get().locations;
        set((s) => ({ locations: s.locations.filter((l) => l.id !== id) }));
        try {
          await apiDeleteLocation(id, bookId);
        } catch (e) {
          set({ locations: prev });
          throw e;
        }
      },

      setTimelineEvents: (events) => set({ timelineEvents: events }),
      addTimelineEvent: async (bookId, input) => {
        const now = new Date().toISOString();
        const optimistic: TimelineEvent = { id: nextTempId(), bookId, ...input, createdAt: now, updatedAt: now } as TimelineEvent;
        set((s) => ({ timelineEvents: [...s.timelineEvents, optimistic] }));
        try {
          const created = await apiCreateTimelineEvent(bookId, input);
          set((s) => ({
            timelineEvents: s.timelineEvents.map((e) => (e.id === optimistic.id ? created : e)),
          }));
          return created;
        } catch (e) {
          set((s) => ({ timelineEvents: s.timelineEvents.filter((e) => e.id !== optimistic.id) }));
          throw e;
        }
      },
      updateTimelineEvent: async (id, patch) => {
        const prev = get().timelineEvents;
        set((s) => ({
          timelineEvents: s.timelineEvents.map((e) =>
            e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e,
          ),
        }));
        try {
          const updated = await apiUpdateTimelineEvent(id, patch);
          set((s) => ({
            timelineEvents: s.timelineEvents.map((e) => (e.id === id ? updated : e)),
          }));
          return updated;
        } catch (e) {
          set({ timelineEvents: prev });
          throw e;
        }
      },
      removeTimelineEvent: async (id, bookId) => {
        const prev = get().timelineEvents;
        set((s) => ({ timelineEvents: s.timelineEvents.filter((e) => e.id !== id) }));
        try {
          await apiDeleteTimelineEvent(id, bookId);
        } catch (e) {
          set({ timelineEvents: prev });
          throw e;
        }
      },

      setForeshadowings: (foreshadowings) => set({ foreshadowings }),
      addForeshadowing: async (bookId, input) => {
        const now = new Date().toISOString();
        const optimistic: Foreshadowing = { id: nextTempId(), bookId, ...input, createdAt: now, updatedAt: now } as Foreshadowing;
        set((s) => ({ foreshadowings: [...s.foreshadowings, optimistic] }));
        try {
          const created = await apiCreateForeshadowing(bookId, input);
          set((s) => ({
            foreshadowings: s.foreshadowings.map((f) => (f.id === optimistic.id ? created : f)),
          }));
          return created;
        } catch (e) {
          set((s) => ({ foreshadowings: s.foreshadowings.filter((f) => f.id !== optimistic.id) }));
          throw e;
        }
      },
      updateForeshadowing: async (id, patch) => {
        const prev = get().foreshadowings;
        set((s) => ({
          foreshadowings: s.foreshadowings.map((f) =>
            f.id === id ? { ...f, ...patch, updatedAt: new Date().toISOString() } : f,
          ),
        }));
        try {
          const updated = await apiUpdateForeshadowing(id, patch);
          set((s) => ({
            foreshadowings: s.foreshadowings.map((f) => (f.id === id ? updated : f)),
          }));
          return updated;
        } catch (e) {
          set({ foreshadowings: prev });
          throw e;
        }
      },
      removeForeshadowing: async (id, bookId) => {
        const prev = get().foreshadowings;
        set((s) => ({ foreshadowings: s.foreshadowings.filter((f) => f.id !== id) }));
        try {
          await apiDeleteForeshadowing(id, bookId);
        } catch (e) {
          set({ foreshadowings: prev });
          throw e;
        }
      },

      setPlotThreads: (threads) => set({ plotThreads: threads }),
      addPlotThread: async (bookId, input) => {
        const now = new Date().toISOString();
        const optimistic: PlotThread = { id: nextTempId(), bookId, ...input, createdAt: now, updatedAt: now } as PlotThread;
        set((s) => ({ plotThreads: [...s.plotThreads, optimistic] }));
        try {
          const created = await apiCreatePlotThread(bookId, input);
          set((s) => ({
            plotThreads: s.plotThreads.map((t) => (t.id === optimistic.id ? created : t)),
          }));
          return created;
        } catch (e) {
          set((s) => ({ plotThreads: s.plotThreads.filter((t) => t.id !== optimistic.id) }));
          throw e;
        }
      },
      updatePlotThread: async (id, patch) => {
        const prev = get().plotThreads;
        set((s) => ({
          plotThreads: s.plotThreads.map((t) =>
            t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t,
          ),
        }));
        try {
          const updated = await apiUpdatePlotThread(id, patch);
          set((s) => ({
            plotThreads: s.plotThreads.map((t) => (t.id === id ? updated : t)),
          }));
          return updated;
        } catch (e) {
          set({ plotThreads: prev });
          throw e;
        }
      },
      removePlotThread: async (id, bookId) => {
        const prev = get().plotThreads;
        set((s) => ({ plotThreads: s.plotThreads.filter((t) => t.id !== id) }));
        try {
          await apiDeletePlotThread(id, bookId);
        } catch (e) {
          set({ plotThreads: prev });
          throw e;
        }
      },

      getVersionMeta: () => worldVersionMeta,
      setVersionMeta: (meta) => {
        worldVersionMeta = meta;
      },
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
      const items = updates as Array<{ _type?: string; [key: string]: unknown }>;
      const state = useWorldStore.getState();
      const locs: Location[] = [];
      const events: TimelineEvent[] = [];
      const fores: Foreshadowing[] = [];
      const threads: PlotThread[] = [];
      for (const item of items) {
        switch (item._type) {
          case 'location':
            locs.push(item as unknown as Location);
            break;
          case 'timeline_event':
            events.push(item as unknown as TimelineEvent);
            break;
          case 'foreshadowing':
            fores.push(item as unknown as Foreshadowing);
            break;
          case 'plot_thread':
            threads.push(item as unknown as PlotThread);
            break;
        }
      }
      if (locs.length) state.setLocations(locs);
      if (events.length) state.setTimelineEvents(events);
      if (fores.length) state.setForeshadowings(fores);
      if (threads.length) state.setPlotThreads(threads);
    },
    getMeta: () => useWorldStore.getState().getVersionMeta(),
    setMeta: (meta) => useWorldStore.getState().setVersionMeta(meta),
  });
}, 0);
