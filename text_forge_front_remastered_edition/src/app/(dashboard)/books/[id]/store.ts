'use client';

import { create } from 'zustand';

interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  type?: string;
  token?: string;
  label?: string;
  note?: string;
}

interface AgentStatus {
  kind: 'idle' | 'thinking' | 'working' | 'error';
  message?: string;
  label?: string;
}

interface AgentToolLogEntry {
  id: string;
  seq: number;
  status: 'start' | 'end';
  ts: number;
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
  agentToolLog: AgentToolLogEntry[];
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
  pushToolLog: (entry: { status: 'start' | 'end' }) => void;
  clearToolLog: () => void;
  commitStreamingMessage: () => void;
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
  agentToolLog: [],
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
  pushToolLog: (entry) =>
    set((state) => ({
      agentToolLog: [
        ...state.agentToolLog,
        {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          seq: state.agentToolLog.length + 1,
          ts: Date.now(),
        },
      ],
    })),
  clearToolLog: () => set({ agentToolLog: [] }),
  commitStreamingMessage: () =>
    set((state) => {
      const messages = [...state.agentMessages];
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.type === 'streaming') {
          if (m.content && m.content.trim()) {
            messages[i] = { ...m, type: 'assistant' };
          } else {
            messages.splice(i, 1);
          }
          break;
        }
        break;
      }
      return { agentMessages: messages };
    }),
  setPendingReview: (review) => set({ pendingReview: review }),
  setAgentContext: (context: string) => {
    set((state) => ({
      agentMessages: [...state.agentMessages, { role: 'user', content: context }],
    }));
  },

  addAgentMessage: (msg) =>
    set((state) => ({
      agentMessages: [...state.agentMessages, msg],
    })),

  updateAgentStreamToken: (token) =>
    set((state) => {
      const messages = [...state.agentMessages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].type === 'streaming') {
          messages[i] = { ...messages[i], content: token };
          return { agentMessages: messages };
        }
      }
      return {
        agentMessages: [
          ...messages,
          { role: 'assistant', content: token, type: 'streaming' },
        ],
      };
    }),

  closeCardDraw: () => set({ cardDrawOpen: false }),
  autoDetectPhase: () => {},
}));
