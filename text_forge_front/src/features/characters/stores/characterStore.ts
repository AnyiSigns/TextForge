import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  fetchCharacters,
  createCharacter as apiCreateCharacter,
  deleteCharacter as apiDeleteCharacter,
  updateCharacter as apiUpdateCharacter,
  fetchCharacterMessages,
} from '../api/characters';
import { uid } from '@/lib/utils/id';
import { createIdbStorage } from '@/lib/storage/zustandIdb';
import type { Character, Message } from '@/types';
import { syncManager } from '@/lib/storage/syncManager';

interface CharacterStore {
  characters: Character[];
  currentCharacter: Character | null;
  messages: Message[];
  isLoading: boolean;
  hasHydrated: boolean;
  threadMap: Record<string, string>;
  setHasHydrated: (v: boolean) => void;

  setCharacters: (chars: Character[]) => void;
  setCurrentCharacter: (char: Character | null) => void;
  addMessage: (msg: Message) => void;
  setMessages: (msgs: Message[]) => void;
  clearMessages: () => void;
  setIsLoading: (loading: boolean) => void;
  updateLastMessage: (content: string) => void;

  syncFromBackend: () => Promise<void>;
  load: () => Promise<void>;
  addCharacter: (input: {
    name: string;
    description: string;
    bookId?: number | null;
    avatarUrl?: string;
  }) => Promise<Character>;
   updateCharacter: (
     id: number,
     patch: Partial<
       Pick<
         Character,
         'name' | 'description' | 'avatarUrl' | 'aliases' | 'roleType' | 'status' | 'relationshipChain' | 'referenceImages' | 'referenceImage' | 'images' | 'currentProfile'
       >
     >,
   ) => Promise<Character>;
  removeCharacter: (id: number) => Promise<void>;

  getVersionMeta: () => { lastSyncAt: string; version?: number };
  setVersionMeta: (meta: { lastSyncAt: string; version?: number }) => void;

  getThreadId: (characterId: number, bookId?: number | null) => string | undefined;
  setThreadId: (characterId: number, bookId: number | null, threadId: string) => void;
  clearThreadId: (characterId: number, bookId?: number | null) => void;
  fetchMessagesWithThread: (characterId: number, bookId?: number | null) => Promise<Message[]>;
}

let versionMeta: { lastSyncAt: string; version?: number } = {
  lastSyncAt: new Date(0).toISOString(),
  version: 0,
};

export const useCharacterStore = create<CharacterStore>()(
  persist(
    (set, get) => ({
      characters: [],
      currentCharacter: null,
      messages: [],
      isLoading: false,
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),

      threadMap: {} as Record<string, string>,

      setCharacters: (chars) => set({ characters: chars }),
      setCurrentCharacter: (char) => set({ currentCharacter: char, messages: [] }),
      addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
      setMessages: (msgs) => set({ messages: msgs }),
      clearMessages: () => set({ messages: [] }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      updateLastMessage: (content) =>
        set((state) => {
          const msgs = [...state.messages];
          const last = msgs[msgs.length - 1];
          if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content };
          return { messages: msgs };
        }),

      getVersionMeta: () => versionMeta,
      setVersionMeta: (meta) => {
        versionMeta = meta;
      },

      getThreadId: (characterId, bookId) => {
        const key = `${characterId}:${bookId ?? ''}`;
        return get().threadMap[key];
      },
      setThreadId: (characterId, bookId, threadId) => {
        const key = `${characterId}:${bookId ?? ''}`;
        set((s) => ({ threadMap: { ...s.threadMap, [key]: threadId } }));
      },
      clearThreadId: (characterId, bookId) => {
        const key = `${characterId}:${bookId ?? ''}`;
        const next = { ...get().threadMap };
        delete next[key];
        set({ threadMap: next });
      },
      fetchMessagesWithThread: async (characterId, bookId) => {
        const threadId = get().getThreadId(characterId, bookId);
        const msgs = await fetchCharacterMessages(characterId, threadId);
        set({ messages: msgs });
        return msgs;
      },

      syncFromBackend: async () => {
        try {
          const chars = await fetchCharacters();
          set({ characters: chars });
        } catch {
          /* 后端未就绪，保留本地 */
        }
      },

      load: async () => {
        await get().syncFromBackend();
      },

      addCharacter: async (input) => {
        const optimistic: Character = {
          id: Number(uid()),
          bookId: input.bookId ?? 0,
          name: input.name,
          description: input.description,
          avatarUrl: input.avatarUrl || undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((s) => ({ characters: [optimistic, ...s.characters] }));
        try {
          const created = await apiCreateCharacter(input);
          set((s) => ({
            characters: s.characters.map((c) =>
              c.id === optimistic.id ? { ...optimistic, id: created.id || optimistic.id } : c,
            ),
          }));
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
        set((s) => ({
          characters: s.characters.map((c) =>
            c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c,
          ),
        }));
        try {
          const updated = await apiUpdateCharacter(id, patch);
          if (updated)
            set((s) => ({
              characters: s.characters.map((c) => (c.id === id ? { ...c, ...updated } : c)),
            }));
          return updated;
        } catch (e) {
          set({ characters: prev });
          throw e;
        }
      },
    }),
    {
      name: 'novel-characters',
      storage: createIdbStorage(),
      partialize: (s) => ({ characters: s.characters, threadMap: s.threadMap }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

syncManager.register({
  name: 'characters',
  applyUpdates: (updates, version) => {
    useCharacterStore.setState((s) => {
      const map = new Map((updates as Character[]).map((u) => [u.id, u]));
      const characters = s.characters.map((c) => map.get(c.id) || c);
      return { characters };
    });
    if (version !== undefined) {
      versionMeta = { ...versionMeta, lastSyncAt: new Date().toISOString(), version };
    }
  },
  getMeta: () => useCharacterStore.getState().getVersionMeta(),
  setMeta: (meta) => useCharacterStore.getState().setVersionMeta(meta),
});
