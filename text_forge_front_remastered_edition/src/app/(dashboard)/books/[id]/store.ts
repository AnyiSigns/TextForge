import { create } from 'zustand';
import type { Book, Volume, Chapter, Character, OutlineNode, Location, TimelineEvent, Foreshadowing, PlotThread, CreativeSetting, WritingStats } from '@/shared/api/types';
import * as booksApi from '@/shared/api/books';
import * as charactersApi from '@/shared/api/characters';
import * as worldApi from '@/shared/api/world';

type PanelId = 'outline' | 'characters' | 'world';
type TabId = 'overview' | 'outline' | 'settings';
type WorldSubTab = 'locations' | 'events' | 'foreshadowings' | 'plot-threads';

interface BookDetailState {
  bookId: number;
  book: Book | null;
  volumes: Volume[];
  chapters: (Volume & { chapters: Chapter[] })[];
  characters: Character[];
  outlineNodes: OutlineNode[];
  locations: Location[];
  timelineEvents: TimelineEvent[];
  foreshadowings: Foreshadowing[];
  plotThreads: PlotThread[];
  creativeSetting: CreativeSetting | null;
  writingStats: WritingStats | null;
  writingTrend: { date: string; words: number }[];

  activePanel: PanelId;
  activeTab: TabId;
  worldSubTab: WorldSubTab;
  sidebarCollapsed: boolean;

  agentMessages: { role: string; content: string; type?: string; token?: string }[];
  agentStreaming: boolean;
  agentThreadId: string | null;
  agentOpen: boolean;
  cardDrawOpen: boolean;
  pendingReview: Record<string, unknown> | null;
  pendingCards: unknown[] | null;

  loading: boolean;
  error: string | null;

  setActivePanel: (panel: PanelId) => void;
  setActiveTab: (tab: TabId) => void;
  setWorldSubTab: (subTab: WorldSubTab) => void;
  toggleSidebar: () => void;

  loadBook: (id: number) => Promise<void>;
  loadChapters: () => Promise<void>;
  loadCharacters: () => Promise<void>;
  loadWorld: () => Promise<void>;
  loadCreativeSetting: () => Promise<void>;
  loadWritingStats: () => Promise<void>;

  setAgentThreadId: (threadId: string) => void;
  toggleAgent: () => void;
  setAgentOpen: (v: boolean) => void;
  openCardDraw: () => void;
  closeCardDraw: () => void;
  addAgentMessage: (msg: { role: string; content: string; type?: string; token?: string }) => void;
  updateAgentStreamToken: (token: string) => void;
  setAgentStreaming: (v: boolean) => void;
  setPendingReview: (review: Record<string, unknown> | null) => void;
  setPendingCards: (cards: unknown[] | null) => void;
}

export const useBookDetailStore = create<BookDetailState>((set, get) => ({
  bookId: 0,
  book: null,
  volumes: [],
  chapters: [],
  characters: [],
  outlineNodes: [],
  locations: [],
  timelineEvents: [],
  foreshadowings: [],
  plotThreads: [],
  creativeSetting: null,
  writingStats: null,
  writingTrend: [],

  activePanel: 'outline',
  activeTab: 'overview',
  worldSubTab: 'locations',
  sidebarCollapsed: false,

  agentMessages: [],
  agentStreaming: false,
  agentThreadId: null,
  agentOpen: false,
  cardDrawOpen: false,
  pendingReview: null,
  pendingCards: null,

  loading: false,
  error: null,

  setActivePanel: (panel) => set({ activePanel: panel }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setWorldSubTab: (subTab) => set({ worldSubTab: subTab }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  loadBook: async (id) => {
    set({ loading: true, error: null, bookId: id });
    try {
      const book = await booksApi.fetchBook(id);
      set({ book, loading: false });
    } catch (e) {
      set({ error: '加载书籍失败', loading: false });
    }
  },

  loadChapters: async () => {
    const { bookId } = get();
    try {
      const chapters = await booksApi.fetchChaptersTree(bookId);
      const volumes = await booksApi.fetchVolumes(bookId);
      set({ chapters, volumes });
    } catch { /* silent */ }
  },

  loadCharacters: async () => {
    const { bookId } = get();
    try {
      const characters = await charactersApi.fetchCharacters(bookId);
      set({ characters });
    } catch { /* silent */ }
  },

  loadWorld: async () => {
    const { bookId } = get();
    try {
      const [locations, timelineEvents, foreshadowings, plotThreads] = await Promise.all([
        worldApi.fetchLocations(bookId),
        worldApi.fetchTimelineEvents(bookId),
        worldApi.fetchForeshadowings(bookId),
        worldApi.fetchPlotThreads(bookId),
      ]);
      set({ locations, timelineEvents, foreshadowings, plotThreads });
    } catch { /* silent */ }
  },

  loadCreativeSetting: async () => {
    const { bookId } = get();
    try {
      const creativeSetting = await booksApi.fetchCreativeSetting(bookId);
      set({ creativeSetting });
    } catch { /* silent */ }
  },

  loadWritingStats: async () => {
    const { bookId } = get();
    try {
      const [writingStats, writingTrend] = await Promise.all([
        booksApi.fetchWritingStats(bookId),
        booksApi.fetchWritingTrend(bookId),
      ]);
      set({ writingStats, writingTrend });
    } catch { /* silent */ }
  },

  setAgentThreadId: (threadId) => set({ agentThreadId: threadId }),
  toggleAgent: () => set((s) => ({ agentOpen: !s.agentOpen })),
  setAgentOpen: (v: boolean) => set({ agentOpen: v }),
  openCardDraw: () => set({ cardDrawOpen: true, agentOpen: true }),
  closeCardDraw: () => set({ cardDrawOpen: false }),
  addAgentMessage: (msg) => set((s) => ({ agentMessages: [...s.agentMessages, msg] })),
  updateAgentStreamToken: (token) => {
    const msgs = get().agentMessages;
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'assistant' && last.content === '') {
      set({ agentMessages: [...msgs.slice(0, -1), { ...last, content: token }] });
    } else {
      set({ agentMessages: [...msgs, { role: 'assistant', content: token }] });
    }
  },
  setAgentStreaming: (v) => set({ agentStreaming: v }),
  setPendingReview: (review) => set({ pendingReview: review }),
  setPendingCards: (cards) => set({ pendingCards: cards }),
}));
