'use client';

import { create } from 'zustand';

interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  type?: string;
  token?: string;
  label?: string;
  note?: string;
  /** 工具卡片消息：工具名与执行状态（作为独立消息插入消息流，顺序天然正确） */
  tool?: string;
  toolStatus?: 'running' | 'done' | 'error';
  /** 工作流节点卡片消息：nodeId / 状态 / tokens */
  nodeId?: string;
  nodeStatus?: 'running' | 'completed' | 'failed';
  tokens?: number;
  reason?: string;
  /** 书籍锁冲突（503）错误消息携带的原始用户指令，供「解除占用并重试」使用 */
  retryMessage?: string;
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

/** 工作流节点（角色）执行状态卡片数据。 */
export interface AgentNodeStatus {
  nodeId: string;
  label: string;
  status: 'running' | 'completed' | 'failed';
  tokens?: number;
  reason?: string;
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
  agentNodeStatuses: AgentNodeStatus[];
  /** 工作流节点正文：nodeId → 累积的流式输出，由状态卡片展开时在卡片内部展示。 */
  nodeOutputs: Record<string, string>;
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
  upsertNodeStatus: (status: AgentNodeStatus) => void;
  clearNodeStatuses: () => void;
  setNodeOutput: (nodeId: string, token: string) => void;
  clearNodeOutputs: () => void;
  commitStreamingMessage: () => void;
  setPendingReview: (review: Record<string, unknown> | null) => void;
  setAgentContext: (context: string) => void;
  addAgentMessage: (msg: AgentMessage) => void;
  updateAgentStreamToken: (token: string) => void;
  /** 按工具名更新最近一条 tool 卡片消息的状态（end/error 时复位「请求外援中」） */
  updateToolMessage: (tool: string, status: 'done' | 'error') => void;
  /** 按 nodeId 更新节点卡片消息（node_stream 累积正文 / node_end 状态） */
  updateNodeMessage: (nodeId: string, patch: Partial<AgentMessage>) => void;
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
  agentNodeStatuses: [],
  nodeOutputs: {},
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
  upsertNodeStatus: (status) =>
    set((state) => {
      const existing = state.agentNodeStatuses.find((n) => n.nodeId === status.nodeId);
      if (!existing) {
        return { agentNodeStatuses: [...state.agentNodeStatuses, status] };
      }
      return {
        agentNodeStatuses: state.agentNodeStatuses.map((n) =>
          n.nodeId === status.nodeId ? { ...n, ...status } : n,
        ),
      };
    }),
  clearNodeStatuses: () => set({ agentNodeStatuses: [] }),
  setNodeOutput: (nodeId, token) =>
    set((state) => ({
      nodeOutputs: {
        ...state.nodeOutputs,
        [nodeId]: (state.nodeOutputs[nodeId] || '') + token,
      },
    })),
  clearNodeOutputs: () => set({ nodeOutputs: {} }),
  commitStreamingMessage: () =>
    set((state) => {
      // 处理所有残留 streaming 消息：有内容定型为 assistant，空消息移除。
      // 只处理最后一条会导致多条 streaming（多轮工具调用/手动压缩叠加）时
      // 其余残留，进而在新一轮流式期间连带显示三点脉冲。
      const messages = state.agentMessages.map((m) => {
        if (m.type !== 'streaming') return m;
        return m.content && m.content.trim() ? { ...m, type: 'assistant' as const } : m;
      });
      return {
        agentMessages: messages.filter((m) => !(m.type === 'streaming' && !(m.content && m.content.trim()))),
      };
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

  updateToolMessage: (tool, status) =>
    set((state) => {
      // 从后往前找最近一条同工具名的 tool 卡片消息并更新状态
      const messages = [...state.agentMessages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].type === 'tool' && messages[i].tool === tool) {
          messages[i] = { ...messages[i], toolStatus: status };
          break;
        }
      }
      return { agentMessages: messages };
    }),

  updateNodeMessage: (nodeId, patch) =>
    set((state) => ({
      agentMessages: state.agentMessages.map((m) =>
        m.type === 'node' && m.nodeId === nodeId ? { ...m, ...patch } : m,
      ),
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
