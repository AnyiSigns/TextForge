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

  seed: () => void;
  loadFromApi: (bookId: number) => Promise<void>;
  reset: () => void;
  clearError: () => void;

  updateSceneEvent: (id: number, patch: Partial<MockSceneEvent>) => void;
  updateLocation: (id: number, patch: Partial<MockLocation>) => void;
  updateCharacter: (id: number, patch: Partial<MockCharacter>) => void;
  removeCharacter: (id: number) => void;
  addLocation: (loc: MockLocation) => void;
  addCharacter: (ch: MockCharacter) => void;
  addSceneEvent: (ev: MockSceneEvent) => void;
}

const EMPTY_STATE: Omit<EntityState, 'seed' | 'reset' | 'updateSceneEvent' | 'updateLocation' | 'updateCharacter' | 'removeCharacter' | 'loadFromApi' | 'addLocation' | 'addCharacter' | 'addSceneEvent' | 'clearError'> = {
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
};

export const useEntityStore = create<EntityState>((set) => ({
  ...EMPTY_STATE,

  loadFromApi: async (bookId) => {
    set({ loading: true, error: null });
    try {
      const { fetchBook } = await import('@/shared/api/books');
      const { fetchSceneEvents, fetchLocations, fetchForeshadowings, fetchPlotThreads } = await import('@/shared/api/world');
      const { fetchCharacters } = await import('@/shared/api/characters');
      const [book, characters, locations, sceneEvents, foreshadowings, plotThreads] = await Promise.all([
        fetchBook(bookId),
        fetchCharacters(bookId),
        fetchLocations(bookId),
        fetchSceneEvents(bookId),
        fetchForeshadowings(bookId),
        fetchPlotThreads(bookId),
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
        volumes: [] as any,
        chapters: [] as any,
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

  removeCharacter: (id) => {
    set((state) => ({
      characters: state.characters.filter((c) => c.id !== id),
      sceneEvents: state.sceneEvents.map((e) => ({
        ...e,
        characterIds: e.characterIds.filter((cid) => cid !== id),
      })),
    }));
    useMapStore.getState().selectCharacter(null);
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
}));
