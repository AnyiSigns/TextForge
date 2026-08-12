import { create } from 'zustand';
import { toast } from 'sonner';
import { useMapStore } from './mapStore';
import { makeCrudSlice } from './crudSlice';
import type {
  Book,
  Volume,
  Chapter,
  SceneEvent,
  Location,
  Character,
  Foreshadowing,
  PlotThread,
} from '@/shared/api/types';

interface EntityState {
  book: Book;
  volumes: Volume[];
  chapters: Chapter[];
  sceneEvents: SceneEvent[];
  locations: Location[];
  characters: Character[];
  foreshadowings: Foreshadowing[];
  plotThreads: PlotThread[];
  loading: boolean;
  error: string | null;
  creativeSetting: { tone: string; worldview: string; writingTaboos: string; customDimensions: Record<string, unknown> } | null;

  loadFromApi: (bookId: number) => Promise<void>;
  reset: () => void;
  clearError: () => void;

  updateSceneEvent: (id: number, patch: Partial<SceneEvent>) => void;
  moveSceneEvent: (id: number, storyTs: number) => void;
  updateLocation: (id: number, patch: Partial<Location>) => void;
  updateCharacter: (id: number, patch: Partial<Character>) => void;

  addLocation: (loc: Location) => void;
  addCharacter: (ch: Character) => void;
  addSceneEvent: (ev: SceneEvent) => void;
  addPlotThread: (pt: PlotThread) => void;
  addForeshadowing: (fw: Foreshadowing) => void;
  addChapter: (ch: Chapter) => void;
  addVolume: (vol: Volume) => void;

  removeLocation: (id: number) => Promise<void>;
  removeCharacter: (id: number) => Promise<void>;
  removeSceneEvent: (id: number) => Promise<void>;
  removeForeshadowing: (id: number) => Promise<void>;
  removePlotThread: (id: number) => Promise<void>;
  removeVolume: (id: number) => Promise<void>;
  removeChapter: (id: number) => Promise<void>;

  updateForeshadowing: (id: number, patch: Partial<Foreshadowing>) => void;
  updatePlotThread: (id: number, patch: Partial<PlotThread>) => void;
  updateVolume: (id: number, patch: Partial<Volume>) => void;
  updateChapter: (id: number, patch: Partial<Chapter>) => void;

  updateCreativeSetting: (data: { tone: string; worldview: string; writingTaboos: string; customDimensions: Record<string, unknown> }) => void;
}

const EMPTY_STATE: Omit<EntityState, 'loadFromApi' | 'clearError' | 'updateCreativeSetting' | 'updateSceneEvent' | 'moveSceneEvent' | 'updateLocation' | 'updateCharacter' | 'addLocation' | 'addCharacter' | 'addSceneEvent' | 'addPlotThread' | 'addForeshadowing' | 'addChapter' | 'addVolume' | 'removeLocation' | 'removeCharacter' | 'removeSceneEvent' | 'removeForeshadowing' | 'removePlotThread' | 'removeVolume' | 'removeChapter' | 'updateForeshadowing' | 'updatePlotThread' | 'updateVolume' | 'updateChapter' | 'reset'> = {
  book: null as unknown as Book,
  volumes: [],
  chapters: [],
  sceneEvents: [],
  locations: [],
  characters: [],
  foreshadowings: [],
  plotThreads: [],
  loading: false,
  error: null,
  creativeSetting: null,
};

export const useEntityStore = create<EntityState>((set, get) => {
  const locations = makeCrudSlice<Location>(set, get, {
    collection: 'locations',
    loader: () => import('@/shared/api/world'),
    updateFn: 'updateLocation',
    createFn: 'createLocation',
    deleteFn: 'deleteLocation',
    updateError: '地点更新失败',
    addError: '保存失败',
    removeError: '地点删除失败',
    withBookId: true,
    deleteBookId: true,
    payload: (loc) => [{ ...loc, bookId: get().book?.id ?? loc.bookId }],
    cascade: (state, id) => ({
      characters: state.characters.map((c: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        ...c,
        baseLocationId: c.baseLocationId === id ? null : c.baseLocationId,
        spawnLocationId: c.spawnLocationId === id ? null : c.spawnLocationId,
      })),
      sceneEvents: state.sceneEvents.map((e: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        ...e,
        locationId: e.locationId === id ? null : e.locationId,
      })),
      locations: state.locations.map((l: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        ...l,
        alternateOfId: l.alternateOfId === id ? null : l.alternateOfId,
      })),
    }),
  });

  const characters = makeCrudSlice<Character>(set, get, {
    collection: 'characters',
    loader: () => import('@/shared/api/characters'),
    updateFn: 'updateCharacter',
    createFn: 'createCharacter',
    deleteFn: 'deleteCharacter',
    updateError: '保存失败',
    addError: '保存失败',
    removeError: '删除失败',
    withBookId: false,
    deleteBookId: false,
    cascade: (state, id) => ({
      sceneEvents: state.sceneEvents.map((e: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        ...e,
        characterIds: e.characterIds.filter((cid: number) => cid !== id),
      })),
      foreshadowings: state.foreshadowings.map((f: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        ...f,
        relatedCharacterIds: (f.relatedCharacterIds ?? []).filter((cid: number) => cid !== id),
      })),
      plotThreads: state.plotThreads.map((p: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        ...p,
        relatedCharacterIds: (p.relatedCharacterIds ?? []).filter((cid: number) => cid !== id),
      })),
    }),
    onAfter: () => useMapStore.getState().selectCharacter(null),
  });

  const sceneEvents = makeCrudSlice<SceneEvent>(set, get, {
    collection: 'sceneEvents',
    loader: () => import('@/shared/api/world'),
    updateFn: 'updateSceneEvent',
    createFn: 'createSceneEvent',
    deleteFn: 'deleteSceneEvent',
    updateError: '事件更新失败',
    addError: '保存失败',
    removeError: '删除失败',
    withBookId: true,
    deleteBookId: true,
    cascade: (state, id) => ({
      // 伏笔的「埋下场景」指向被删事件 → 置空（后端 FK SET NULL 同步行为）
      foreshadowings: state.foreshadowings.map((f: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        ...f,
        relatedEventId: f.relatedEventId === id ? null : f.relatedEventId,
      })),
    }),
  });

  const foreshadowings = makeCrudSlice<Foreshadowing>(set, get, {
    collection: 'foreshadowings',
    loader: () => import('@/shared/api/world'),
    updateFn: 'updateForeshadowing',
    createFn: 'createForeshadowing',
    deleteFn: 'deleteForeshadowing',
    updateError: '伏笔更新失败',
    addError: '保存失败',
    removeError: '删除失败',
    withBookId: true,
    deleteBookId: true,
    cascade: (state, id) => ({
      sceneEvents: state.sceneEvents.map((e: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        ...e,
        resolvedForeshadowingIds: (e.resolvedForeshadowingIds ?? []).filter((fid: number) => fid !== id),
      })),
    }),
  });

  const plotThreads = makeCrudSlice<PlotThread>(set, get, {
    collection: 'plotThreads',
    loader: () => import('@/shared/api/world'),
    updateFn: 'updatePlotThread',
    createFn: 'createPlotThread',
    deleteFn: 'deletePlotThread',
    updateError: '情节脉络更新失败',
    addError: '保存失败',
    removeError: '删除失败',
    withBookId: true,
    deleteBookId: true,
    cascade: (state, id) => ({
      sceneEvents: state.sceneEvents.map((e: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        ...e,
        plotThreadIds: (e.plotThreadIds ?? []).filter((tid: number) => tid !== id),
        completedPlotThreadIds: (e.completedPlotThreadIds ?? []).filter((tid: number) => tid !== id),
      })),
    }),
  });

  const volumes = makeCrudSlice<Volume>(set, get, {
    collection: 'volumes',
    loader: () => import('@/shared/api/books'),
    updateFn: 'updateVolume',
    createFn: 'createVolume',
    deleteFn: 'deleteVolume',
    updateError: '保存失败',
    addError: '保存失败',
    removeError: '删除失败',
    withBookId: false,
    deleteBookId: false,
    payload: (vol) => [get().book?.id ?? vol.bookId, vol.title, vol.summary],
    cascade: (state, id) => {
      const removedChapterIds = new Set(
        state.chapters.filter((ch: any) => ch.volumeId === id).map((ch: any) => ch.id), // eslint-disable-line @typescript-eslint/no-explicit-any
      );
      const removedEventIds = new Set(
        state.sceneEvents.filter((e: any) => removedChapterIds.has(e.chapterId ?? 0)).map((e: any) => e.id), // eslint-disable-line @typescript-eslint/no-explicit-any
      );
      return {
        chapters: state.chapters.filter((ch: any) => ch.volumeId !== id), // eslint-disable-line @typescript-eslint/no-explicit-any
        sceneEvents: state.sceneEvents.filter((e: any) => !removedChapterIds.has(e.chapterId ?? 0)), // eslint-disable-line @typescript-eslint/no-explicit-any
        foreshadowings: state.foreshadowings.map((f: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
          removedEventIds.has(f.relatedEventId ?? -1)
            ? { ...f, relatedEventId: null }
            : f,
        ),
      };
    },
  });

  const chapters = makeCrudSlice<Chapter>(set, get, {
    collection: 'chapters',
    loader: () => import('@/shared/api/books'),
    updateFn: 'updateChapter',
    createFn: 'createChapter',
    deleteFn: 'deleteChapter',
    updateError: '保存失败',
    addError: '保存失败',
    removeError: '删除失败',
    withBookId: false,
    deleteBookId: false,
    payload: (ch) => [ch.volumeId, { title: ch.title, summary: ch.summary ?? undefined, locked: ch.locked || false }],
    cascade: (state, id) => {
      const removedEventIds = new Set(
        state.sceneEvents.filter((e: any) => e.chapterId === id).map((e: any) => e.id), // eslint-disable-line @typescript-eslint/no-explicit-any
      );
      return {
        sceneEvents: state.sceneEvents.filter((e: any) => e.chapterId !== id), // eslint-disable-line @typescript-eslint/no-explicit-any
        foreshadowings: state.foreshadowings.map((f: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
          removedEventIds.has(f.relatedEventId ?? -1)
            ? { ...f, relatedEventId: null }
            : f,
        ),
      };
    },
  });

  return {
    ...EMPTY_STATE,

    loadFromApi: async (bookId) => {
      set({ loading: true, error: null });
      const { fetchBook, fetchChaptersTree, fetchCreativeSetting } = await import('@/shared/api/books');
      const { fetchSceneEvents, fetchLocations, fetchForeshadowings, fetchPlotThreads } = await import('@/shared/api/world');
      const { fetchCharacters } = await import('@/shared/api/characters');

      const safe = <T>(p: Promise<T>) => p.catch(() => null as T | null);

      const results = await Promise.allSettled([
        safe(fetchBook(bookId)),
        safe(fetchCharacters(bookId)),
        safe(fetchLocations(bookId)),
        safe(fetchSceneEvents(bookId)),
        safe(fetchForeshadowings(bookId)),
        safe(fetchPlotThreads(bookId)),
        safe(fetchChaptersTree(bookId)),
        safe(fetchCreativeSetting(bookId)),
      ]);

      const rb = results as PromiseSettledResult<unknown>[];
      const book = rb[0].status === 'fulfilled' ? (rb[0].value as Book | null) : null;
      const characters = rb[1].status === 'fulfilled' ? (rb[1].value as Character[] | null) : null;
      const locations = rb[2].status === 'fulfilled' ? (rb[2].value as Location[] | null) : null;
      const sceneEvents = rb[3].status === 'fulfilled' ? (rb[3].value as SceneEvent[] | null) : null;
      const foreshadowings = rb[4].status === 'fulfilled' ? (rb[4].value as Foreshadowing[] | null) : null;
      const plotThreads = rb[5].status === 'fulfilled' ? (rb[5].value as PlotThread[] | null) : null;
      const volsAndChapters = rb[6].status === 'fulfilled' ? (rb[6].value as (Volume & { chapters: Chapter[] })[] | null) : null;
      const creativeSetting = rb[7].status === 'fulfilled' ? (rb[7].value as { tone?: string; worldview?: string; writingTaboos?: string; customDimensions?: Record<string, unknown> } | null) : null;

      const errors = results
        .filter((r) => r.status === 'rejected')
        .map((r, i) => `[${['book','characters','locations','events','foreshadowings','plotThreads','chapters','creativeSetting'][i]}] ` + ((r as PromiseRejectedResult).reason instanceof Error ? (r as PromiseRejectedResult).reason.message : String((r as PromiseRejectedResult).reason)))
        .filter(Boolean);

      set({
        book: book
          ? {
              id: book.id,
              title: book.title,
              description: book.description || '',
              genre: book.genre || '',
              pinned: book.pinned || false,
              workflowId: book.workflowId ?? undefined,
              totalWordGoal: book.totalWordGoal || 0,
              currentWordCount: book.currentWordCount || 0,
              timeUnit: (book.timeUnit as 'day' | 'year' | 'hour') || 'day',
              epochLabel: book.epochLabel || '',
            }
          : get().book,
        volumes: volsAndChapters ? volsAndChapters.map((v) => ({ id: v.id, bookId: v.bookId, title: v.title, summary: v.summary || '', sortOrder: v.sortOrder })) : get().volumes,
        chapters: volsAndChapters ? volsAndChapters.flatMap((v) => (v.chapters || []).map((ch) => ({ id: ch.id, volumeId: ch.volumeId, title: ch.title, summary: ch.summary || '', sortOrder: ch.sortOrder, characterIds: ch.characterIds || [], locked: ch.locked || false }))) : get().chapters,
        sceneEvents: sceneEvents ?? get().sceneEvents,
        locations: locations ?? get().locations,
        characters: characters ?? get().characters,
        foreshadowings: foreshadowings ?? get().foreshadowings,
        plotThreads: plotThreads ?? get().plotThreads,
        creativeSetting: creativeSetting
          ? {
              tone: creativeSetting.tone || '',
              worldview: creativeSetting.worldview || '',
              writingTaboos: creativeSetting.writingTaboos || '',
              customDimensions: creativeSetting.customDimensions || {},
            }
          : get().creativeSetting,
        loading: false,
        error: errors.length > 0 ? errors.join('; ') : null,
      });
    },

    reset: () => {
      set(EMPTY_STATE);
    },

    clearError: () => set({ error: null }),

    updateSceneEvent: sceneEvents.update,
    moveSceneEvent: (id, storyTs) => {
      set((state) => ({
        sceneEvents: state.sceneEvents.map((e) =>
          e.id === id ? { ...e, storyTs } : e,
        ),
      }));
    },
    updateLocation: locations.update,
    updateCharacter: characters.update,

    addLocation: locations.add,
    addCharacter: characters.add,
    addSceneEvent: sceneEvents.add,
    addPlotThread: plotThreads.add,
    addForeshadowing: foreshadowings.add,
    addChapter: chapters.add,
    addVolume: volumes.add,

    removeLocation: locations.remove,
    removeCharacter: characters.remove,
    removeSceneEvent: sceneEvents.remove,
    removeForeshadowing: foreshadowings.remove,
    removePlotThread: plotThreads.remove,
    removeVolume: volumes.remove,
    removeChapter: chapters.remove,

    updateForeshadowing: foreshadowings.update,
    updatePlotThread: plotThreads.update,
    updateVolume: volumes.update,
    updateChapter: chapters.update,

    updateCreativeSetting: async (data) => {
      const bookId = get().book?.id;
      set({ creativeSetting: data });
      if (!bookId) return;
      try {
        const { updateCreativeSetting } = await import('@/shared/api/books');
        await updateCreativeSetting(bookId, data);
      } catch { toast.error('创意设定保存失败'); }
    },
  };
});
