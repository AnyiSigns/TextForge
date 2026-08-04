import { create } from 'zustand';
import { useMapStore } from './mapStore';
import {
  MOCK_BOOK,
  MOCK_VOLUMES,
  MOCK_CHAPTERS,
  MOCK_SCENE_EVENTS,
  MOCK_LOCATIONS,
  MOCK_CHARACTERS,
  MOCK_FORESHADOWINGS,
  MOCK_PLOT_THREADS,
} from '@/mocks/data';
import type {
  MockBook,
  MockVolume,
  MockChapter,
  MockSceneEvent,
  MockLocation,
  MockCharacter,
  MockForeshadowing,
  MockPlotThread,
} from '@/mocks/data';

interface EntityState {
  book: MockBook;
  volumes: MockVolume[];
  chapters: MockChapter[];
  sceneEvents: MockSceneEvent[];
  locations: MockLocation[];
  characters: MockCharacter[];
  foreshadowings: MockForeshadowing[];
  plotThreads: MockPlotThread[];
  loading: boolean;
  error: string | null;
  creativeSetting: { tone: string; worldview: string; writingTaboos: string; customDimensions: Record<string, unknown> } | null;

  seed: () => void;
  loadFromApi: (bookId: number) => Promise<void>;
  reset: () => void;
  clearError: () => void;

  updateSceneEvent: (id: number, patch: Partial<MockSceneEvent>) => void;
  updateLocation: (id: number, patch: Partial<MockLocation>) => void;
  updateCharacter: (id: number, patch: Partial<MockCharacter>) => void;

  addLocation: (loc: MockLocation) => void;
  addCharacter: (ch: MockCharacter) => void;
  addSceneEvent: (ev: MockSceneEvent) => void;
  addPlotThread: (pt: MockPlotThread) => void;
  addForeshadowing: (fw: MockForeshadowing) => void;
  addChapter: (ch: MockChapter) => void;
  addVolume: (vol: MockVolume) => void;

  removeLocation: (id: number) => Promise<void>;
  removeCharacter: (id: number) => Promise<void>;
  removeSceneEvent: (id: number) => Promise<void>;
  removeForeshadowing: (id: number) => Promise<void>;
  removePlotThread: (id: number) => Promise<void>;
  removeVolume: (id: number) => Promise<void>;
  removeChapter: (id: number) => Promise<void>;

  updateForeshadowing: (id: number, patch: Partial<MockForeshadowing>) => void;
  updatePlotThread: (id: number, patch: Partial<MockPlotThread>) => void;
  updateVolume: (id: number, patch: Partial<MockVolume>) => void;
  updateChapter: (id: number, patch: Partial<MockChapter>) => void;

  updateCreativeSetting: (data: { tone: string; worldview: string; writingTaboos: string; customDimensions: Record<string, unknown> }) => void;
}

const EMPTY_STATE: Omit<EntityState, 'seed' | 'reset' | 'updateSceneEvent' | 'updateLocation' | 'updateCharacter' | 'addLocation' | 'addCharacter' | 'addSceneEvent' | 'addPlotThread' | 'addForeshadowing' | 'addChapter' | 'addVolume' | 'removeLocation' | 'removeCharacter' | 'removeSceneEvent' | 'removeForeshadowing' | 'removePlotThread' | 'removeVolume' | 'removeChapter' | 'loadFromApi' | 'clearError' | 'updateCreativeSetting' | 'updateForeshadowing' | 'updatePlotThread' | 'updateVolume' | 'updateChapter'> = {
  book: null as unknown as MockBook,
  volumes: [],
  chapters: [],
  sceneEvents: [],
  locations: [],
  characters: [],
  foreshadowings: [],
  plotThreads: [],
  loading: false,
  error: null,
  creativeSetting: { tone: '史诗奇墨', worldview: '一个由星辰之力驱动的奇墨世界', writingTaboos: '', customDimensions: {} },
};

export const useEntityStore = create<EntityState>((set, get) => ({
  ...EMPTY_STATE,

  loadFromApi: async (bookId) => {
    set({ loading: true, error: null });
    try {
      const { fetchBook, fetchChaptersTree } = await import('@/shared/api/books');
      const { fetchSceneEvents, fetchLocations, fetchForeshadowings, fetchPlotThreads } = await import('@/shared/api/world');
      const { fetchCharacters } = await import('@/shared/api/characters');
      const [book, characters, locations, sceneEvents, foreshadowings, plotThreads, volsAndChapters] = await Promise.all([
        fetchBook(bookId),
        fetchCharacters(bookId),
        fetchLocations(bookId),
        fetchSceneEvents(bookId),
        fetchForeshadowings(bookId),
        fetchPlotThreads(bookId),
        fetchChaptersTree(bookId),
      ]);
      set({
        book: {
          id: book.id,
          userId: 1,
          title: book.title,
          description: book.description || '',
          genre: book.genre || '',
          pinned: book.pinned || false,
          workflowId: book.workflowId || null,
          totalWordGoal: book.totalWordGoal || 0,
          currentWordCount: book.currentWordCount || 0,
          timeUnit: (book.timeUnit as 'day' | 'year' | 'hour') || 'day',
          epochLabel: (book.epochLabel as any) || "",
        },
        volumes: volsAndChapters.map((v: any) => ({ id: v.id, bookId: 1, title: v.title, summary: v.summary || '', sortOrder: v.sortOrder })) as any,
        chapters: (volsAndChapters as any[]).flatMap((v: any) => (v.chapters || []).map((ch: any) => ({ id: ch.id, volumeId: ch.volumeId, title: ch.title, summary: ch.summary || '', sortOrder: ch.sortOrder, characterIds: [], locked: ch.locked || false }))) as any,
        sceneEvents: sceneEvents as any,
        locations: locations as any,
        characters: characters as any,
        foreshadowings: foreshadowings as any,
        plotThreads: plotThreads as any,
        loading: false,
        error: null,
      });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : '加载失败，请检查网络连接',
      });
    }
  },

  seed: () => {
    set({
      book: { ...MOCK_BOOK },
      volumes: [...MOCK_VOLUMES],
      chapters: [...MOCK_CHAPTERS],
      sceneEvents: [...MOCK_SCENE_EVENTS],
      locations: [...MOCK_LOCATIONS],
      characters: [...MOCK_CHARACTERS],
      foreshadowings: [...MOCK_FORESHADOWINGS],
      plotThreads: [...MOCK_PLOT_THREADS],
      loading: false,
      error: null,
    });
  },

  reset: () => {
    set(EMPTY_STATE);
  },

  clearError: () => set({ error: null }),

  updateSceneEvent: (id, patch) => {
    set((state) => ({
      sceneEvents: state.sceneEvents.map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      ),
    }));
  },

  updateLocation: (id, patch) => {
    set((state) => ({
      locations: state.locations.map((l) =>
        l.id === id ? { ...l, ...patch } : l,
      ),
    }));
  },

  updateCharacter: (id, patch) => {
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    }));
  },

  updateForeshadowing: (id, patch) => {
    set((state) => ({
      foreshadowings: state.foreshadowings.map((f) =>
        f.id === id ? { ...f, ...patch } : f,
      ),
    }));
  },

  updatePlotThread: (id, patch) => {
    set((state) => ({
      plotThreads: state.plotThreads.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      ),
    }));
  },

  updateVolume: (id, patch) => {
    set((state) => ({
      volumes: state.volumes.map((v) =>
        v.id === id ? { ...v, ...patch } : v,
      ),
    }));
  },

  updateChapter: (id, patch) => {
    set((state) => ({
      chapters: state.chapters.map((ch) =>
        ch.id === id ? { ...ch, ...patch } : ch,
      ),
    }));
  },

  addLocation: (loc) => {
    set((state) => ({ locations: [...state.locations, loc] }));
  },

  addCharacter: (ch) => {
    set((state) => ({ characters: [...state.characters, ch] }));
  },

  addSceneEvent: (ev) => {
    set((state) => ({ sceneEvents: [...state.sceneEvents, ev] }));
  },

  addPlotThread: (pt) => {
    set((state) => ({ plotThreads: [...state.plotThreads, pt] }));
  },

  addForeshadowing: (fw) => {
    set((state) => ({ foreshadowings: [...state.foreshadowings, fw] }));
  },

  addChapter: (ch) => {
    set((state) => ({ chapters: [...state.chapters, ch] }));
  },

  addVolume: (vol) => {
    set((state) => ({ volumes: [...state.volumes, vol] }));
  },

  removeLocation: async (id) => {
    try {
      const { deleteLocation } = await import('@/shared/api/world');
      await deleteLocation(id, get().book?.id ?? 1);
    } catch { /* API may not exist, fallback to local only */ }
    set((state) => ({
      locations: state.locations.filter((l) => l.id !== id),
      characters: state.characters.map((c) => ({
        ...c,
        baseLocationId: c.baseLocationId === id ? null : c.baseLocationId,
        spawnLocationId: c.spawnLocationId === id ? null : c.spawnLocationId,
      })),
      sceneEvents: state.sceneEvents.map((e) => ({
        ...e,
        locationId: e.locationId === id ? null : e.locationId,
      })),
    }));
  },

  removeCharacter: async (id) => {
    try {
      const { deleteCharacter } = await import('@/shared/api/characters');
      await deleteCharacter(id);
    } catch { /* fallback */ }
    set((state) => ({
      characters: state.characters.filter((c) => c.id !== id),
      sceneEvents: state.sceneEvents.map((e) => ({
        ...e,
        characterIds: e.characterIds.filter((cid) => cid !== id),
      })),
    }));
    useMapStore.getState().selectCharacter(null);
  },

  removeSceneEvent: async (id) => {
    try {
      const { deleteSceneEvent } = await import('@/shared/api/world');
      await deleteSceneEvent(id, get().book?.id ?? 1);
    } catch { /* fallback */ }
    set((state) => ({
      sceneEvents: state.sceneEvents.filter((e) => e.id !== id),
    }));
  },

  removeForeshadowing: async (id) => {
    try {
      const { deleteForeshadowing } = await import('@/shared/api/world');
      await deleteForeshadowing(id, get().book?.id ?? 1);
    } catch { /* fallback */ }
    set((state) => ({
      foreshadowings: state.foreshadowings.filter((f) => f.id !== id),
    }));
  },

  removePlotThread: async (id) => {
    try {
      const { deletePlotThread } = await import('@/shared/api/world');
      await deletePlotThread(id, get().book?.id ?? 1);
    } catch { /* fallback */ }
    set((state) => ({
      plotThreads: state.plotThreads.filter((p) => p.id !== id),
    }));
  },

  removeVolume: async (id) => {
    try {
      const { deleteVolume } = await import('@/shared/api/books');
      await deleteVolume(id);
    } catch { /* fallback */ }
    set((state) => {
      const removedChapterIds = new Set(
        state.chapters.filter((ch) => ch.volumeId === id).map((ch) => ch.id),
      );
      return {
        volumes: state.volumes.filter((v) => v.id !== id),
        chapters: state.chapters.filter((ch) => ch.volumeId !== id),
        sceneEvents: state.sceneEvents.filter((e) => !removedChapterIds.has(e.chapterId ?? 0)),
      };
    });
  },

  removeChapter: async (id) => {
    try {
      const { deleteChapter } = await import('@/shared/api/books');
      await deleteChapter(id);
    } catch { /* fallback */ }
    set((state) => ({
      chapters: state.chapters.filter((ch) => ch.id !== id),
      sceneEvents: state.sceneEvents.filter((e) => e.chapterId !== id),
    }));
  },

  updateCreativeSetting: (data) => {
    set({ creativeSetting: data });
  },
}));
