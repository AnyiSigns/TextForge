// 剧情流 REST/SSE 封装，统一对接后端 /api/story-flows 接口。
// SSE 事件命名与 agent 流隔离：scene_stream / scene_done / done / error。
import { apiClient } from './client';
import { authedFetch } from './authFetch';
import { readSSE } from './sse';

export interface StoryFlowOption {
  text: string;
}

export interface StoryFlowNode {
  id: number;
  seq: number;
  anchoredEventId: number | null;
  title: string;
  narration: string;
  options: StoryFlowOption[];
  chosenOption: string | null;
  locationName: string | null;
  characterNames: string[];
  createdAt?: string;
}

export interface StoryFlow {
  id: number;
  bookId: number;
  chapterId: number;
  status: 'active' | 'completed';
  anchorEventIds: number[];
  currentEventIndex: number;
  viewCharacterId: number | null;
  roundCount: number;
  summary?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface StoryFlowFetchResult {
  flow: StoryFlow;
  nodes: StoryFlowNode[];
}

export interface StoryFlowStreamCallbacks {
  onStream?: (token: string) => void;
  onSceneDone?: (data: {
    node: StoryFlowNode | null;
    completed: boolean;
    flowId: number;
    anchorEventIds?: number[];
    currentEventIndex?: number;
  }) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

export interface StoryFlowModelConfig {
  main_config?: { adapter?: string; base_url?: string; api_key?: string; model_id?: string };
  search_config?: { provider?: string; api_key?: string };
}

export class StoryFlowConfigError extends Error {}

/** 校验模型配置已设置（未配置时抛出明确错误，UI 据此 toast）。 */
export function assertStoryFlowModelConfig(modelConfigData: StoryFlowModelConfig | null): StoryFlowModelConfig {
  if (!modelConfigData || !modelConfigData.main_config) {
    throw new StoryFlowConfigError('请先在设置页配置模型');
  }
  return modelConfigData;
}

/** 读取 SSE 流并按事件回调分发（复用 agent.ts streamAgent 的 reader/decoder 模式）。 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

async function streamStoryFlow(
  url: string,
  body: Record<string, unknown>,
  callbacks: StoryFlowStreamCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const res = await authedFetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  if (!res.ok) {
    let detail = '剧情流请求失败';
    try {
      const d = await res.json();
      if (d?.detail) detail = typeof d.detail === 'string' ? d.detail : detail;
    } catch { /* ignore */ }
    callbacks.onError?.(detail);
    return;
  }

  await readSSE(res, (event) => {
    switch (event.type) {
      case 'scene_stream':
        if (typeof event.token === 'string') callbacks.onStream?.(event.token);
        break;
      case 'scene_done':
        callbacks.onSceneDone?.({
          node: (event.node as StoryFlowNode | null) ?? null,
          completed: Boolean(event.completed),
          flowId: Number(event.flow_id ?? 0),
          anchorEventIds: Array.isArray(event.anchor_event_ids) ? (event.anchor_event_ids as number[]) : undefined,
          currentEventIndex: typeof event.current_event_index === 'number' ? event.current_event_index : undefined,
        });
        break;
      case 'done':
        callbacks.onDone?.();
        break;
      case 'error':
        callbacks.onError?.(typeof event.message === 'string' ? event.message : '生成失败，请重试');
        break;
    }
  });
}

/** 创建剧情流会话并流式生成首场景（幂等：已有 active 流则复用）。 */
export async function createStoryFlow(
  bookId: number,
  chapterId: number,
  viewCharacterId: number | null,
  modelConfigData: StoryFlowModelConfig | null,
  callbacks: StoryFlowStreamCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  assertStoryFlowModelConfig(modelConfigData);
  await streamStoryFlow(
    '/story-flows/',
    {
      bookId,
      chapterId,
      viewCharacterId: viewCharacterId ?? null,
      modelConfig: modelConfigData,
    },
    callbacks,
    abortSignal,
  );
}

/** 推进剧情流（幂等：已生成的后续节点直接回放，不重复生成）。 */
export async function advanceStoryFlow(
  flowId: number,
  chosenOption: string,
  modelConfigData: StoryFlowModelConfig | null,
  callbacks: StoryFlowStreamCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  assertStoryFlowModelConfig(modelConfigData);
  await streamStoryFlow(
    `/story-flows/${flowId}/advance`,
    { chosenOption, modelConfig: modelConfigData },
    callbacks,
    abortSignal,
  );
}

/** 结束剧情流并生成推演摘要（幂等）。 */
export async function completeStoryFlow(
  flowId: number,
  modelConfigData: StoryFlowModelConfig | null,
): Promise<{ summary: string; status: string; flowId: number }> {
  assertStoryFlowModelConfig(modelConfigData);
  const { data } = await apiClient.post<{ summary: string; status: string; flowId: number }>(
    `/story-flows/${flowId}/complete`,
    { modelConfig: modelConfigData },
  );
  return data;
}

/** 获取剧情流会话与全部节点（按 seq 有序，恢复用）。 */
export async function fetchStoryFlow(flowId: number): Promise<StoryFlowFetchResult> {
  const { data } = await apiClient.get<StoryFlowFetchResult>(`/story-flows/${flowId}`);
  return data;
}

/** 查询章节下未完成的剧情流（自动恢复用；返回 updated_at 最新一条或 null）。 */
export async function findActiveStoryFlow(bookId: number, chapterId: number): Promise<StoryFlow | null> {
  const { data } = await apiClient.get<{ items: StoryFlow[] }>('/story-flows/', {
    params: { bookId, chapterId, status: 'active' },
  });
  return (data.items ?? [])[0] ?? null;
}

/** 更新剧情流视角角色。 */
export async function updateStoryFlowViewCharacter(
  flowId: number,
  viewCharacterId: number | null,
): Promise<StoryFlow> {
  const { data } = await apiClient.patch<StoryFlow>(`/story-flows/${flowId}`, {
    viewCharacterId,
  });
  return data;
}

/** 查询剧情流会话列表（历史入口备用）。 */
export async function listStoryFlows(bookId: number): Promise<StoryFlow[]> {
  const { data } = await apiClient.get<{ items: StoryFlow[] }>('/story-flows/', {
    params: { bookId },
  });
  return data.items ?? [];
}

/** 删除剧情流会话（节点级联删除）。 */
export async function deleteStoryFlow(flowId: number): Promise<void> {
  await apiClient.delete(`/story-flows/${flowId}`);
}
