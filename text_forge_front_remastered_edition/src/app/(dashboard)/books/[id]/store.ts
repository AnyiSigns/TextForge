'use client';

import { create } from 'zustand';

interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  type?: string;
  token?: string;
}

interface AgentStatus {
  kind: 'idle' | 'thinking' | 'working' | 'error';
  message?: string;
  label?: string;
}

interface BookDetailState {
  bookId: number;
  book: { id: number; title: string } | null;
  loading: boolean;
  error: string | null;
  activeTab: string;
  creativePhase: string;
  cardDrawOpen: boolean;
  cardDrawPreset: Record<string, unknown> | null;
  wizardMode: string | null;
  creativeSetting: Record<string, unknown> | null;
  characters: unknown[];
  chapters: unknown[];
  locations: unknown[];

  agentOpen: boolean;
  agentMessages: AgentMessage[];
  agentStreaming: boolean;
  agentStatus: AgentStatus;
  agentThreadId: string | null;
  pendingReview: Record<string, unknown> | null;

  setBookId: (id: number) => void;
  loadBook: (id: number) => Promise<void>;
  loadChapters: () => Promise<void>;
  loadCharacters: () => Promise<void>;
  loadWorld: () => Promise<void>;
  loadCreativeSetting: () => Promise<void>;
  loadWritingStats: () => Promise<void>;
  setActiveTab: (tab: string) => void;
  setCreativePhase: (phase: string) => void;
  setWizardMode: (mode: string | null) => void;
  setAgentOpen: (open: boolean) => void;
  openCardDraw: (preset?: Record<string, unknown>) => void;
  setAgentThreadId: (id: string | null) => void;
  setAgentStreaming: (v: boolean) => void;
  setAgentStatus: (status: AgentStatus) => void;
  setPendingReview: (review: Record<string, unknown> | null) => void;
  setAgentContext: (context: string) => void;
  addAgentMessage: (msg: AgentMessage) => void;
  updateAgentStreamToken: (token: string) => void;
  closeCardDraw: () => void;
  autoDetectPhase: () => void;
}

export const useBookDetailStore = create<BookDetailState>((set) => ({
  bookId: 0,
  book: null,
  loading: false,
  error: null,
  activeTab: 'overview',
  creativePhase: 'overview',
  cardDrawOpen: false,
  cardDrawPreset: null,
  wizardMode: null,
  creativeSetting: null,
  characters: [],
  chapters: [],
  locations: [],

  agentOpen: false,
  agentMessages: [],
  agentStreaming: false,
  agentStatus: { kind: 'idle' },
  agentThreadId: null,
  pendingReview: null,

  setBookId: (id) => set({ bookId: id }),

  loadBook: async () => {},
  loadChapters: async () => {},
  loadCharacters: async () => {},
  loadWorld: async () => {},
  loadCreativeSetting: async () => {},
  loadWritingStats: async () => {},

  setActiveTab: (tab) => set({ activeTab: tab }),
  setCreativePhase: (phase) => set({ creativePhase: phase }),
  setWizardMode: (mode) => set({ wizardMode: mode }),
  setAgentOpen: (open) => set({ agentOpen: open }),
  openCardDraw: (preset) => set({ cardDrawOpen: true, cardDrawPreset: preset ?? null }),
  setAgentThreadId: (id) => set({ agentThreadId: id }),
  setAgentStreaming: (v) => set({ agentStreaming: v }),
  setAgentStatus: (status) => set({ agentStatus: status }),
  setPendingReview: (review) => set({ pendingReview: review }),
  setAgentContext: (context: string) => {
    set((state) => ({
      agentMessages: [...state.agentMessages, { role: 'user', content: context }],
    }));
  },

  addAgentMessage: (msg) =>
    set((state) => ({
      agentMessages: [
        ...state.agentMessages,
        ...(msg.type === 'streaming' ? [] : [msg]),
      ],
    })),

  updateAgentStreamToken: (token) =>
    set((state) => {
      const messages = [...state.agentMessages];
      const lastIdx = messages.length - 1;
      if (lastIdx >= 0 && messages[lastIdx].type === 'streaming') {
        messages[lastIdx] = { ...messages[lastIdx], content: token };
      }
      return { agentMessages: messages };
    }),

  closeCardDraw: () => set({ cardDrawOpen: false }),
  autoDetectPhase: () => {},
}));
