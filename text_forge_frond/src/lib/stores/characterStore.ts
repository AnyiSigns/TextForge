import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getItem, setItem, removeItem } from '@/lib/storage/indexedDB';
import { fetchCharacters, createCharacter as apiCreateCharacter, deleteCharacter as apiDeleteCharacter, updateCharacter as apiUpdateCharacter } from '@/lib/api/characters';
import type { Character, Message } from '@/types';
import { syncManager } from '@/lib/storage/syncManager';

// 角色单一数据源：本地 persist 为主，写操作乐观更新并 push 后端；
// 项目页/角色页共用同一份，避免跨页面不一致。
interface CharacterStore {
  characters: Character[];
  currentCharacter: Character | null;
  messages: Message[];
  isLoading: boolean;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;

  setCharacters: (chars: Character[]) => void;
  setCurrentCharacter: (char: Character | null) => void;
  addMessage: (msg: Message) => void;
  setMessages: (msgs: Message[]) => void;
  clearMessages: () => void;
  setIsLoading: (loading: boolean) => void;
  updateLastMessage: (content: string) => void;

  syncFromBackend: () => Promise<void>;
  addCharacter: (input: { name: string; description: string; projectId?: string | null; avatar?: string }) => Promise<Character>;
  updateCharacter: (id: string, patch: Partial<Pick<Character, 'name' | 'description' | 'avatar' | 'images' | 'role' | 'status' | 'currentProfile' | 'customRole' | 'relationships'>> & { referenceImage?: string | null; imageSeed?: number | null }) => Promise<Character>;
  addCharacterImage: (id: string, imageUrl: string) => Promise<Character>;
  removeCharacter: (id: string) => Promise<void>;

  getVersionMeta: () => { lastSyncAt: string; version?: number };
  setVersionMeta: (meta: { lastSyncAt: string; version?: number }) => void;
}

const idbStorage = {
  getItem: async (name: string): Promise<string | null> => (await getItem<string>(name)) ?? null,
  setItem: async (name: string, value: string): Promise<void> => { await setItem(name, value); },
  removeItem: async (name: string): Promise<void> => { await removeItem(name); },
};

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let versionMeta: { lastSyncAt: string; version?: number } = { lastSyncAt: new Date(0).toISOString(), version: 0 };

export const useCharacterStore = create<CharacterStore>()(
  persist(
    (set, get) => ({
      characters: [],
      currentCharacter: null,
      messages: [],
      isLoading: false,
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),

      setCharacters: (chars) => set({ characters: chars }),
      setCurrentCharacter: (char) => set({ currentCharacter: char, messages: [] }),
      addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
      setMessages: (msgs) => set({ messages: msgs }),
      clearMessages: () => set({ messages: [] }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      updateLastMessage: (content) => set((state) => {
        const msgs = [...state.messages];
        const last = msgs[msgs.length - 1];
        if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content };
        return { messages: msgs };
      }),

      getVersionMeta: () => versionMeta,
      setVersionMeta: (meta) => { versionMeta = meta; },

      syncFromBackend: async () => {
        try {
          const chars = await fetchCharacters();
          if (Array.isArray(chars) && chars.length) set({ characters: chars });
        } catch { /* 后端未就绪，保留本地 */ }
      },

      addCharacter: async (input) => {
        const optimistic: Character = {
          id: uid(),
          name: input.name,
          description: input.description,
          projectId: input.projectId ?? null,
          avatar: input.avatar || undefined,
          origin: 'init', // 用户从零自建，种子回填不覆盖
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ characters: [optimistic, ...s.characters] }));
        try {
          const created = await apiCreateCharacter(input);
          set((s) => ({ characters: s.characters.map((c) => (c.id === optimistic.id ? { ...created, id: created.id || optimistic.id } : c)) }));
          return created ?? optimistic;
        } catch (e) {
          set((s) => ({ characters: s.characters.filter((c) => c.id !== optimistic.id) }));
          throw e;
        }
      },

      removeCharacter: async (id) => {
        const prev = get().characters;
        set((s) => ({ characters: s.characters.filter((c) => c.id !== id) }));
        try {
          await apiDeleteCharacter(id);
        } catch (e) {
          set({ characters: prev });
          throw e;
        }
      },

      updateCharacter: async (id, patch) => {
        const prev = get().characters;
        const normalize = (c: Character & { referenceImage?: string | null; imageSeed?: number | null }): Character => ({
          ...c,
          referenceImage: c.referenceImage ?? undefined,
          imageSeed: c.imageSeed ?? undefined,
        });
        set((s) => ({
          characters: s.characters.map((c) =>
            c.id === id ? normalize({ ...c, ...patch, origin: 'user' }) : c,
          ),
        }));
        try {
          const updated = await apiUpdateCharacter(id, patch);
          if (updated) set((s) => ({
            characters: s.characters.map((c) => (c.id === id ? normalize({ ...c, ...updated }) : c)),
          }));
          return updated;
        } catch (e) {
          set({ characters: prev });
          throw e;
        }
      },

      addCharacterImage: async (id, imageUrl) => {
        const prev = get().characters;
        set((s) => ({
          characters: s.characters.map((c) =>
            c.id === id ? { ...c, images: [imageUrl, ...(c.images ?? [])] } : c,
          ),
        }));
        try {
          const target = get().characters.find((c) => c.id === id);
          const updated = await apiUpdateCharacter(id, { images: target?.images ?? [imageUrl] });
          if (updated) set((s) => ({
            characters: s.characters.map((c) => (c.id === id ? { ...c, ...updated } : c)),
          }));
          return updated ?? (get().characters.find((c) => c.id === id) as Character);
        } catch (e) {
          set({ characters: prev });
          throw e;
        }
      },
    }),
    {
      name: 'novel-characters',
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ characters: s.characters }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

// 注册统一同步管理器
syncManager.register({
  name: 'characters',
  applyUpdates: (updates, version) => {
    useCharacterStore.setState((s) => {
      const map = new Map((updates as Character[]).map((u) => [u.id, u]));
      const characters = s.characters.map((c) => map.get(c.id) || c);
      return { characters };
    });
    if (version !== undefined) {
      versionMeta.version = version;
    }
  },
  getMeta: () => useCharacterStore.getState().getVersionMeta(),
  setMeta: (meta) => useCharacterStore.getState().setVersionMeta(meta),
});
