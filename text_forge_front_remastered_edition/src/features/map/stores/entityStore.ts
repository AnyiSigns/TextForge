import { create } from 'zustand';
import { toast } from 'sonner';
import { useMapStore } from './mapStore';
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

export const useEntityStore = create<EntityState>((set, get) => ({
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

    const rb = results as PromiseSettledResult<any>[];
    const book = rb[0].status === 'fulfilled' ? (rb[0].value as Book | null) : null;
    const characters = rb[1].status === 'fulfilled' ? (rb[1].value as Character[] | null) : null;
    const locations = rb[2].status === 'fulfilled' ? (rb[2].value as Location[] | null) : null;
    const sceneEvents = rb[3].status === 'fulfilled' ? (rb[3].value as SceneEvent[] | null) : null;
    const foreshadowings = rb[4].status === 'fulfilled' ? (rb[4].value as Foreshadowing[] | null) : null;
    const plotThreads = rb[5].status === 'fulfilled' ? (rb[5].value as PlotThread[] | null) : null;
    const volsAndChapters = rb[6].status === 'fulfilled' ? (rb[6].value as Volume[] | null) : null;
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
            epochLabel: (book.epochLabel as any) || '',
          }
        : get().book,
      volumes: volsAndChapters ? (volsAndChapters.map((v: any) => ({ id: v.id, bookId: 1, title: v.title, summary: v.summary || '', sortOrder: v.sortOrder })) as any) : get().volumes,
      chapters: volsAndChapters ? ((volsAndChapters as any[]).flatMap((v: any) => (v.chapters || []).map((ch: any) => ({ id: ch.id, volumeId: ch.volumeId, title: ch.title, summary: ch.summary || '', sortOrder: ch.sortOrder, characterIds: ch.characterIds || [], locked: ch.locked || false }))) as any) : get().chapters,
      sceneEvents: (sceneEvents as any) ?? get().sceneEvents,
      locations: (locations as any) ?? get().locations,
      characters: (characters as any) ?? get().characters,
      foreshadowings: (foreshadowings as any) ?? get().foreshadowings,
      plotThreads: (plotThreads as any) ?? get().plotThreads,
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

  updateSceneEvent: (id, patch) => {
    set((state) => ({
      sceneEvents: state.sceneEvents.map((e) =>
        e.id === id ? { ...e, ...patch } : e,
      ),
    }));
    import('@/shared/api/world').then(({ updateSceneEvent: apiUpdate }) =>
      apiUpdate(id, patch as any, get().book?.id).catch(() => toast.error('事件更新失败'))
    );
  },

  moveSceneEvent: (id, storyTs) => {
    set((state) => ({
      sceneEvents: state.sceneEvents.map((e) =>
        e.id === id ? { ...e, storyTs } : e,
      ),
    }));
  },

  updateLocation: (id, patch) => {
    set((state) => ({
      locations: state.locations.map((l) =>
        l.id === id ? { ...l, ...patch } : l,
      ),
    }));
    import('@/shared/api/world').then(({ updateLocation: apiUpdate }) =>
      apiUpdate(id, patch as any, get().book?.id).catch(() => toast.error('地点更新失败'))
    );
  },

  updateCharacter: (id, patch) => {
    set((state) => ({
      characters: state.characters.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    }));
    import('@/shared/api/characters').then(({ updateCharacter: apiUpdate }) =>
      apiUpdate(id, patch as any).catch(() => toast.error('保存失败'))
    );
  },

  updateForeshadowing: (id, patch) => {
    set((state) => ({
      foreshadowings: state.foreshadowings.map((f) =>
        f.id === id ? { ...f, ...patch } : f,
      ),
    }));
    import('@/shared/api/world').then(({ updateForeshadowing: apiUpdate }) =>
      apiUpdate(id, patch as any, get().book?.id).catch(() => toast.error('伏笔更新失败'))
    );
  },

  updatePlotThread: (id, patch) => {
    set((state) => ({
      plotThreads: state.plotThreads.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      ),
    }));
    import('@/shared/api/world').then(({ updatePlotThread: apiUpdate }) =>
      apiUpdate(id, patch as any, get().book?.id).catch(() => toast.error('情节脉络更新失败'))
    );
  },

  updateVolume: (id, patch) => {
    set((state) => ({
      volumes: state.volumes.map((v) =>
        v.id === id ? { ...v, ...patch } : v,
      ),
    }));
    import('@/shared/api/books').then(({ updateVolume: apiUpdate }) =>
      apiUpdate(id, patch as any).catch(() => toast.error('保存失败'))
    );
  },

  updateChapter: (id, patch) => {
    set((state) => ({
      chapters: state.chapters.map((ch) =>
        ch.id === id ? { ...ch, ...patch } : ch,
      ),
    }));
    import('@/shared/api/books').then(({ updateChapter: apiUpdate }) =>
      apiUpdate(id, patch as any).catch(() => toast.error('保存失败'))
    );
  },

  addLocation: (loc) => {
    const tempId = loc.id;
    set((state) => ({ locations: [...state.locations, loc] }));
    const bookId = get().book?.id;
    import('@/shared/api/world').then(({ createLocation }) =>
      createLocation({ ...loc, bookId: bookId ?? loc.bookId } as any).then((real) => {
        set((state) => ({
          locations: state.locations.map((l) =>
            l.id === tempId ? { ...(real as any), id: real.id ?? tempId } : l,
          ),
        }));
      }).catch(() => toast.error('保存失败'))
    );
  },

  addCharacter: (ch) => {
    const tempId = ch.id;
    set((state) => ({ characters: [...state.characters, ch] }));
    import('@/shared/api/characters').then(({ createCharacter }) =>
      createCharacter(ch as any).then((real) => {
        set((state) => ({
          characters: state.characters.map((c) =>
            c.id === tempId ? { ...(real as any), id: real.id ?? tempId } : c,
          ),
        }));
      }).catch(() => toast.error('保存失败'))
    );
  },

  addSceneEvent: (ev) => {
    const tempId = ev.id;
    set((state) => ({ sceneEvents: [...state.sceneEvents, ev] }));
    import('@/shared/api/world').then(({ createSceneEvent }) =>
      createSceneEvent(ev as any).then((real) => {
        set((state) => ({
          sceneEvents: state.sceneEvents.map((e) =>
            e.id === tempId ? { ...(real as any), id: real.id ?? tempId } : e,
          ),
        }));
      }).catch(() => toast.error('保存失败'))
    );
  },

  addPlotThread: (pt) => {
    const tempId = pt.id;
    set((state) => ({ plotThreads: [...state.plotThreads, pt] }));
    import('@/shared/api/world').then(({ createPlotThread }) =>
      createPlotThread(pt as any).then((real) => {
        set((state) => ({
          plotThreads: state.plotThreads.map((p) =>
            p.id === tempId ? { ...(real as any), id: real.id ?? tempId } : p,
          ),
        }));
      }).catch(() => toast.error('保存失败'))
    );
  },

  addForeshadowing: (fw) => {
    const tempId = fw.id;
    set((state) => ({ foreshadowings: [...state.foreshadowings, fw] }));
    import('@/shared/api/world').then(({ createForeshadowing }) =>
      createForeshadowing(fw as any).then((real) => {
        set((state) => ({
          foreshadowings: state.foreshadowings.map((f) =>
            f.id === tempId ? { ...(real as any), id: real.id ?? tempId } : f,
          ),
        }));
      }).catch(() => toast.error('保存失败'))
    );
  },

  addChapter: (ch) => {
    const tempId = ch.id;
    set((state) => ({ chapters: [...state.chapters, ch] }));
    import('@/shared/api/books').then(({ createChapter }) =>
      createChapter(ch.volumeId, { title: ch.title, summary: ch.summary ?? undefined, locked: ch.locked || false }).then((real) => {
        set((state) => ({
          chapters: state.chapters.map((c) =>
            c.id === tempId ? { ...(real as any), id: real.id ?? tempId } : c,
          ),
        }));
      }).catch(() => toast.error('保存失败'))
    );
  },

  addVolume: (vol) => {
    const tempId = vol.id;
    set((state) => ({ volumes: [...state.volumes, vol] }));
    const bookId = get().book?.id ?? vol.bookId;
    import('@/shared/api/books').then(({ createVolume }) =>
      createVolume(bookId, vol.title, vol.summary).then((real) => {
        set((state) => ({
          volumes: state.volumes.map((v) =>
            v.id === tempId ? { ...(real as any), id: real.id ?? tempId } : v,
          ),
        }));
      }).catch(() => toast.error('保存失败'))
    );
  },

  removeLocation: async (id) => {
    try {
      const { deleteLocation } = await import('@/shared/api/world');
      await deleteLocation(id, get().book?.id ?? 1);
    } catch { toast.error('地点删除失败'); }
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
    } catch { toast.error('删除失败'); }
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
    } catch { toast.error('删除失败'); }
    set((state) => ({
      sceneEvents: state.sceneEvents.filter((e) => e.id !== id),
    }));
  },

  removeForeshadowing: async (id) => {
    try {
      const { deleteForeshadowing } = await import('@/shared/api/world');
      await deleteForeshadowing(id, get().book?.id ?? 1);
    } catch { toast.error('删除失败'); }
    set((state) => ({
      foreshadowings: state.foreshadowings.filter((f) => f.id !== id),
    }));
  },

  removePlotThread: async (id) => {
    try {
      const { deletePlotThread } = await import('@/shared/api/world');
      await deletePlotThread(id, get().book?.id ?? 1);
    } catch { toast.error('删除失败'); }
    set((state) => ({
      plotThreads: state.plotThreads.filter((p) => p.id !== id),
    }));
  },

  removeVolume: async (id) => {
    try {
      const { deleteVolume } = await import('@/shared/api/books');
      await deleteVolume(id);
    } catch { toast.error('删除失败'); }
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
    } catch { toast.error('删除失败'); }
    set((state) => ({
      chapters: state.chapters.filter((ch) => ch.id !== id),
      sceneEvents: state.sceneEvents.filter((e) => e.chapterId !== id),
    }));
  },

  updateCreativeSetting: async (data) => {
    const bookId = get().book?.id;
    set({ creativeSetting: data });
    if (!bookId) return;
    try {
      const { updateCreativeSetting } = await import('@/shared/api/books');
      await updateCreativeSetting(bookId, data);
    } catch { toast.error('创意设定保存失败'); }
  },
}));
