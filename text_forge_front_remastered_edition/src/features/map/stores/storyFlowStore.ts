import { create } from 'zustand';
import { toast } from 'sonner';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { getModelConfigData } from '@/shared/api/agent';
import {
  StoryFlowConfigError,
  advanceStoryFlow as apiAdvance,
  completeStoryFlow as apiComplete,
  createStoryFlow as apiCreate,
  fetchStoryFlow as apiFetch,
  findActiveStoryFlow as apiFindActive,
  updateStoryFlowViewCharacter as apiUpdateViewCharacter,
} from '@/shared/api/storyFlow';
import type {
  StoryFlowNode as ApiStoryFlowNode,
} from '@/shared/api/storyFlow';
import type { Character } from '@/shared/api/types';

interface Decision {
  id: number;
  sceneTitle: string;
  chosenOption: string;
  timestamp: number;
}

interface SceneNode {
  id: number;
  seq: number;
  title: string;
  narration: string;
  options: SceneOption[];
  locationName?: string;
  characters?: string[];
  chosenOption?: string | null;
  createdAt?: string;
  anchoredEventId?: number | null;
}

interface SceneOption {
  id: string;
  text: string;
}

type Perspective = 'first' | 'third';

interface StoryFlowState {
  isOpen: boolean;
  /** 当前节点 index（= nodes.length-1；点击决策链回看时指向历史节点） */
  currentSceneId: number;
  perspective: Perspective;
  decisionChain: Decision[];
  triggerChapterId: number | null;

  flowId: number | null;
  status: 'active' | 'completed';
  nodes: SceneNode[];
  viewCharacterId: number | null;
  availableCharacters: Character[];
  loading: boolean;
  streaming: boolean;
  perspectiveLocked: boolean;
  pickCharacterOpen: boolean;
  pendingChosenOption: string | null;
  streamText: string;
  abortController: AbortController | null;
  anchorEventIds: number[];
  currentEventIndex: number;
  restored: boolean;

  open: (chapterId: number) => Promise<void>;
  close: () => void;
  setPerspective: (p: Perspective) => void;
  openCharacterPicker: () => void;
  chooseViewCharacter: (charId: number) => Promise<void>;
  skipViewCharacter: () => Promise<void>;
  startFlow: () => Promise<void>;
  advance: (optionText: string) => Promise<void>;
  retry: () => Promise<void>;
  finishFlow: () => Promise<string>;
  restore: (flowId: number) => Promise<void>;
  goToNode: (index: number) => void;
}

function mapNode(n: ApiStoryFlowNode): SceneNode {
  return {
    id: n.id,
    seq: n.seq,
    title: n.title,
    narration: n.narration,
    options: (n.options ?? []).map((o, i) => ({ id: `opt-${n.seq}-${i}`, text: o.text })),
    locationName: n.locationName ?? undefined,
    characters: n.characterNames ?? [],
    chosenOption: n.chosenOption,
    createdAt: n.createdAt,
    anchoredEventId: n.anchoredEventId,
  };
}

/** 由 nodes 派生决策链（只含已做出选择的节点，按 seq 顺序）。 */
function buildDecisionChain(nodes: SceneNode[]): Decision[] {
  const chain: Decision[] = [];
  for (const n of nodes) {
    if (!n.chosenOption) continue;
    chain.push({
      id: chain.length + 1,
      sceneTitle: n.title,
      chosenOption: n.chosenOption,
      timestamp: n.createdAt ? new Date(n.createdAt).getTime() : Date.now(),
    });
  }
  return chain;
}

type SceneDonePayload = {
  node: ApiStoryFlowNode | null;
  completed: boolean;
  flowId: number;
  anchorEventIds?: number[];
  currentEventIndex?: number;
};

/** 共享的 scene_done 状态合并（startFlow 与 advance 复用，避免状态字段漂移）。 */
function buildSceneDoneState(s: StoryFlowState, d: SceneDonePayload) {
  const nodes = d.node ? [...s.nodes, mapNode(d.node)] : s.nodes;
  return {
    nodes,
    flowId: d.flowId || s.flowId,
    status: d.completed ? 'completed' : s.status,
    currentSceneId: nodes.length - 1,
    decisionChain: buildDecisionChain(nodes),
    loading: false,
    streaming: false,
    streamText: '',
    pendingChosenOption: null,
    anchorEventIds: d.anchorEventIds ?? s.anchorEventIds,
    currentEventIndex: d.currentEventIndex ?? s.currentEventIndex,
  };
}

// 流式 token 缓冲：用 rAF 合并刷新，避免每个 SSE token 触发 O(n^2) 字符串拼接与整组件重渲染
let streamBuffer = '';
let streamRaf: number | null = null;

function pushStreamToken(token: string) {
  streamBuffer += token;
  if (streamRaf === null) {
    // SSR/非浏览器环境无 requestAnimationFrame，直接落状态（服务端仅预渲染，实际不触发流式）
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number;
    streamRaf = raf(() => {
      streamRaf = null;
      const text = streamBuffer;
      streamBuffer = '';
      useStoryFlowStore.setState({ streamText: text });
    });
  }
}

function clearStreamBuffer() {
  if (streamRaf !== null) {
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(streamRaf);
    } else {
      clearTimeout(streamRaf);
    }
    streamRaf = null;
  }
  streamBuffer = '';
}

export const useStoryFlowStore = create<StoryFlowState>((set, get) => ({
  isOpen: false,
  currentSceneId: -1,
  perspective: 'third',
  decisionChain: [],
  triggerChapterId: null,

  flowId: null,
  status: 'active',
  nodes: [],
  viewCharacterId: null,
  availableCharacters: [],
  loading: false,
  streaming: false,
  perspectiveLocked: false,
  pickCharacterOpen: false,
  pendingChosenOption: null,
  streamText: '',
  abortController: null,
  anchorEventIds: [],
  currentEventIndex: -1,
  restored: false,

  open: async (chapterId) => {
    if (get().isOpen) return; // 入口双击防抖：已打开时忽略重复 open
    const entity = useEntityStore.getState();
    const bookId = entity.book?.id;
    if (!bookId) {
      toast.error('书籍信息未加载，请刷新页面后重试');
      return;
    }
    if (!entity.characters.length || !entity.sceneEvents.length) {
      // entityStore 无数据时先触发加载
      await entity.loadFromApi(bookId);
    }

    // 可用视角角色 = 本章事件 SceneEvent.characterIds 并集（去重，过滤已不存在的角色）
    const chapterEventIds = new Set(
      useEntityStore
        .getState()
        .sceneEvents.filter((e) => e.chapterId === chapterId)
        .flatMap((e) => e.characterIds ?? []),
    );
    const availableCharacters = useEntityStore
      .getState()
      .characters.filter((c) => chapterEventIds.has(c.id));

    set({
      isOpen: true,
      triggerChapterId: chapterId,
      loading: true,
      nodes: [],
      decisionChain: [],
      currentSceneId: -1,
      flowId: null,
      status: 'active',
      viewCharacterId: null,
      pendingChosenOption: null,
      streamText: '',
      availableCharacters,
      perspectiveLocked: availableCharacters.length === 0,
      perspective: 'third',
      anchorEventIds: [],
      currentEventIndex: -1,
      restored: false,
    });

    try {
      const activeFlow = await apiFindActive(bookId, chapterId);
      if (activeFlow) {
        await get().restore(activeFlow.id);
        if (get().nodes.length === 0) {
          // 恢复后 nodes 为空（上次首场景生成失败）→ 重新生成首场景
          await get().startFlow();
        }
      } else if (availableCharacters.length > 0) {
        set({ pickCharacterOpen: true });
      } else {
        // 无角色章节：直接第三人称进入
        await get().startFlow();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '剧情流打开失败';
      toast.error(msg);
      set({ loading: false, streaming: false });
    }
  },

  close: () => {
    get().abortController?.abort();
    set({
      isOpen: false,
      triggerChapterId: null,
      currentSceneId: -1,
      decisionChain: [],
      flowId: null,
      status: 'active',
      nodes: [],
      viewCharacterId: null,
      availableCharacters: [],
      loading: false,
      streaming: false,
      perspectiveLocked: false,
      pickCharacterOpen: false,
      pendingChosenOption: null,
      streamText: '',
      abortController: null,
      anchorEventIds: [],
      currentEventIndex: -1,
      restored: false,
    });
  },

  setPerspective: (p) => {
    if (p === 'first') {
      if (get().perspectiveLocked) return; // 无角色章节禁用
      if (!get().viewCharacterId) {
        if (get().availableCharacters.length > 0) {
          get().openCharacterPicker(); // 后补视角角色
        }
        return;
      }
    }
    set({ perspective: p });
  },

  openCharacterPicker: () => set({ pickCharacterOpen: true }),

  chooseViewCharacter: async (charId) => {
    const { flowId } = get();
    if (flowId) {
      // 已存在流：更新视角角色并立即生效（后续生成以其为中心）
      try {
        await apiUpdateViewCharacter(flowId, charId);
      } catch {
        toast.error('视角角色更新失败');
        return;
      }
    }
    set({ viewCharacterId: charId, perspectiveLocked: false, pickCharacterOpen: false, perspective: 'first' });
    if (!flowId) {
      await get().startFlow();
    }
  },

  skipViewCharacter: async () => {
    const { flowId } = get();
    set({ pickCharacterOpen: false, perspective: 'third' });
    if (flowId) {
      try {
        await apiUpdateViewCharacter(flowId, null);
      } catch {
        toast.error('视角设置更新失败');
      }
      return;
    }
    await get().startFlow();
  },

  startFlow: async () => {
    const { triggerChapterId, viewCharacterId } = get();
    const bookId = useEntityStore.getState().book?.id;
    if (!bookId || !triggerChapterId) return;
    set({ streaming: true, loading: true, pickCharacterOpen: false, streamText: '' });
    const controller = new AbortController();
    set({ abortController: controller });

    let config: Awaited<ReturnType<typeof getModelConfigData>>;
    try {
      config = await getModelConfigData();
    } catch {
      toast.error('请先在设置页配置模型');
      set({ streaming: false, loading: false, abortController: null });
      return;
    }

    try {
      await apiCreate(bookId, triggerChapterId, viewCharacterId ?? null, config, {
        onStream: (token) => pushStreamToken(token),
        onSceneDone: (d) => {
          clearStreamBuffer();
          set((s) => buildSceneDoneState(s, d));
        },
        onDone: () => {
          clearStreamBuffer();
          set({ streaming: false, loading: false });
        },
        onError: (msg) => {
          clearStreamBuffer();
          toast.error(msg);
          set({ streaming: false, loading: false, abortController: null });
        },
      }, controller.signal);
    } catch (e) {
      clearStreamBuffer();
      if (e instanceof StoryFlowConfigError) {
        toast.error(e.message);
      } else if ((e as Error)?.name !== 'AbortError') {
        toast.error('首场景生成失败，请重试');
      }
      set({ streaming: false, loading: false, abortController: null });
    }
  },

  advance: async (optionText) => {
    const { flowId, streaming } = get();
    if (!flowId || streaming) return;
    // 防御：回看历史节点时禁止推进（UI 已禁用，store 层双保险）
    const { nodes, currentSceneId } = get();
    if (currentSceneId < nodes.length - 1) {
      toast.error('正在回看历史节点，请先返回最新场景');
      return;
    }
    const current = nodes[currentSceneId];
    const alreadyDecided = Boolean(current?.chosenOption);
    // 决策链乐观追加 + 把选择写回当前节点：scene_done 后 buildDecisionChain 重建时
    // 依赖节点上的 chosenOption，不写回的话旧节点永远是 null，决策链每轮都被清空。
    // alreadyDecided / pendingChosenOption 用于重试与恢复续推时防重复追加。
    if (!alreadyDecided && !get().pendingChosenOption && current) {
      const sceneId = get().currentSceneId;
      set((s) => ({
        nodes: s.nodes.map((n, i) => (i === sceneId ? { ...n, chosenOption: optionText } : n)),
        decisionChain: [
          ...s.decisionChain,
          { id: s.decisionChain.length + 1, sceneTitle: current.title, chosenOption: optionText, timestamp: Date.now() },
        ],
      }));
    }
    set({ streaming: true, pendingChosenOption: optionText, streamText: '' });
    const controller = new AbortController();
    set({ abortController: controller });

    let config: Awaited<ReturnType<typeof getModelConfigData>>;
    try {
      config = await getModelConfigData();
    } catch {
      toast.error('请先在设置页配置模型');
      set({ streaming: false, pendingChosenOption: null, abortController: null });
      return;
    }

    try {
      await apiAdvance(flowId, optionText, config, {
        onStream: (token) => pushStreamToken(token),
        onSceneDone: (d) => {
          clearStreamBuffer();
          set((s) => buildSceneDoneState(s, d));
        },
        onDone: () => {
          clearStreamBuffer();
          set({ streaming: false });
        },
        onError: (msg) => {
          clearStreamBuffer();
          toast.error(msg);
          set({ streaming: false, abortController: null });
        },
      }, controller.signal, current?.seq ?? 0);
    } catch (e) {
      clearStreamBuffer();
      if (e instanceof StoryFlowConfigError) {
        toast.error(e.message);
      } else if ((e as Error)?.name !== 'AbortError') {
        toast.error('推进失败，请重试');
      }
      set({ streaming: false, abortController: null });
    }
  },

  retry: async () => {
    const { pendingChosenOption } = get();
    if (!pendingChosenOption) return;
    await get().advance(pendingChosenOption);
  },

  finishFlow: async () => {
    const { flowId } = get();
    if (!flowId) return '';
    let config: Awaited<ReturnType<typeof getModelConfigData>>;
    try {
      config = await getModelConfigData();
    } catch {
      toast.error('请先在设置页配置模型');
      return '';
    }
    try {
      const data = await apiComplete(flowId, config);
      set({ status: 'completed', flowId: data.flowId || flowId });
      return data.summary || '';
    } catch (e) {
      if (e instanceof StoryFlowConfigError) {
        toast.error(e.message);
      } else {
        toast.error('结束推演失败，请重试');
      }
      return '';
    }
  },

  restore: async (flowId) => {
    const data = await apiFetch(flowId);
    const nodes = data.nodes.map(mapNode);
    let viewCharacterId = data.flow.viewCharacterId;
    let perspectiveLocked = false;
    if (viewCharacterId != null) {
      const exists = useEntityStore
        .getState()
        .characters.some((c) => c.id === viewCharacterId);
      if (!exists) {
        viewCharacterId = null;
        perspectiveLocked = true;
      }
    }
    const last = nodes[nodes.length - 1];
    set({
      flowId: data.flow.id,
      status: data.flow.status,
      nodes,
      viewCharacterId,
      perspectiveLocked,
      currentSceneId: nodes.length - 1,
      decisionChain: buildDecisionChain(nodes),
      loading: false,
      streaming: false,
      anchorEventIds: data.flow.anchorEventIds ?? [],
      currentEventIndex: data.flow.currentEventIndex ?? -1,
      restored: true,
    });
    // 中断窗口续推：最后节点已选选项但无下一场景 → 自动以该选项继续生成（用户无感）
    if (data.flow.status === 'active' && last?.chosenOption) {
      await get().advance(last.chosenOption);
    }
  },

  goToNode: (index) => set({ currentSceneId: index }),
}));

export type { SceneNode, SceneOption, Decision, Perspective };
