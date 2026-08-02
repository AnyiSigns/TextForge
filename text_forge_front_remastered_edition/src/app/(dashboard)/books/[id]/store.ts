import { create } from 'zustand';
import type { Book, Volume, Chapter, Character, OutlineNode, Location, TimelineEvent, Foreshadowing, PlotThread, CreativeSetting, WritingStats, CharacterFrequency, PlotProgress } from '@/shared/api/types';
import * as booksApi from '@/shared/api/books';
import * as charactersApi from '@/shared/api/characters';
import * as worldApi from '@/shared/api/world';
import * as writingSessionsApi from '@/shared/api/writingSessions';

export type CreativePhase = 'overview' | 'worldbuilding' | 'outlining' | 'drafting' | 'revising';

export type PanelId = 'outline' | 'characters' | 'world';
export type WorldSubTab = 'locations' | 'events' | 'foreshadowings' | 'plot-threads';
export type TabId = 'overview' | 'outline' | 'settings' | 'characters' | 'world';

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
  characterFrequency: CharacterFrequency[];
  plotProgress: PlotProgress[];

  activePanel: PanelId;
  activeTab: TabId;
  worldSubTab: WorldSubTab;
  sidebarCollapsed: boolean;

  creativePhase: CreativePhase;

  agentMessages: { role: string; content: string; type?: string; token?: string }[];
  agentStreaming: boolean;
  agentThreadId: string | null;
  agentOpen: boolean;
  cardDrawOpen: boolean;
  cardDrawPreset: { characters?: string[]; locations?: string[]; storyDirection?: string } | null;
  selectedChapterId: number | null;
  pendingReview: Record<string, unknown> | null;
  pendingCards: unknown[] | null;

  loading: boolean;
  error: string | null;

  setActivePanel: (panel: PanelId) => void;
  setActiveTab: (tab: TabId) => void;
  setWorldSubTab: (subTab: WorldSubTab) => void;
  toggleSidebar: () => void;
  setCreativePhase: (phase: CreativePhase) => void;
  autoDetectPhase: () => void;
  selectChapter: (chapterId: number | null) => void;

  loadBook: (id: number) => Promise<void>;
  loadChapters: () => Promise<void>;
  loadCharacters: () => Promise<void>;
  loadWorld: () => Promise<void>;
  loadCreativeSetting: () => Promise<void>;
  loadWritingStats: () => Promise<void>;

  setAgentThreadId: (threadId: string | null) => void;
  toggleAgent: () => void;
  setAgentOpen: (v: boolean) => void;
  openCardDraw: (preset?: { characters?: string[]; locations?: string[]; storyDirection?: string }) => void;
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
  characterFrequency: [],
  plotProgress: [],

  activePanel: 'outline',
  activeTab: 'overview',
  worldSubTab: 'locations',
  sidebarCollapsed: false,
  creativePhase: 'overview',

  agentMessages: [],
  agentStreaming: false,
  agentThreadId: null,
  agentOpen: false,
  cardDrawOpen: false,
  cardDrawPreset: null,
  selectedChapterId: null,
  pendingReview: null,
  pendingCards: null,

  loading: false,
  error: null,

  setActivePanel: (panel) => set({ activePanel: panel }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setWorldSubTab: (subTab) => set({ worldSubTab: subTab }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCreativePhase: (phase) => set({ creativePhase: phase }),
  autoDetectPhase: () => {
    const s = get();
    const hasSetting = !!(s.creativeSetting && (s.creativeSetting.worldview || s.creativeSetting.tone));
    const hasCharacters = s.characters.length > 0;
    const hasOutline = s.outlineNodes.length > 0;
    const hasChapters = s.chapters.some((v) => v.chapters.length > 0);

    if (!hasSetting && !hasCharacters) {
      set({ creativePhase: 'worldbuilding' });
    } else if (!hasOutline && !hasChapters) {
      set({ creativePhase: 'outlining' });
    } else if (hasChapters) {
      set({ creativePhase: 'drafting' });
    } else {
      set({ creativePhase: 'overview' });
    }
  },
  // 根据书籍数据自动推断当前创作阶段
  // worldbuilding: 缺少设定或角色
  // outlining: 有设定/角色但缺少大纲和章节
  // drafting: 已有章节
  selectChapter: (chapterId) => set({ selectedChapterId: chapterId }),

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
      const [writingStats, writingTrend, characterFrequency, plotProgress] = await Promise.all([
        booksApi.fetchWritingStats(bookId),
        booksApi.fetchWritingTrend(bookId),
        writingSessionsApi.fetchCharacterFrequency(bookId),
        writingSessionsApi.fetchPlotProgress(bookId),
      ]);
      set({ writingStats, writingTrend, characterFrequency, plotProgress });
    } catch { /* silent */ }
  },

  setAgentThreadId: (threadId) => set({ agentThreadId: threadId }),
  toggleAgent: () => set((s) => ({ agentOpen: !s.agentOpen })),
  setAgentOpen: (v) => set({ agentOpen: v }),
  openCardDraw: (preset) => set({ cardDrawOpen: true, agentOpen: true, cardDrawPreset: preset || null }),
  closeCardDraw: () => set({ cardDrawOpen: false, cardDrawPreset: null }),
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
