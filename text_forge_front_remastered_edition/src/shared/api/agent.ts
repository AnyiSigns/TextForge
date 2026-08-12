import { apiClient, extractApiDetail } from './client';
import { authedFetch } from './authFetch';
import { fetchModelConfig } from '@/shared/api/models';
import { readSSE } from './sse';
import type { SSEEvent, AgentConversation, AgentMessage, AgentMemory } from './types';

interface AgentStartResult {
  thread_id: string;
  book_id: number | null;
  type: string;
}

export async function getModelConfigData() {
  try {
    const cfg = await fetchModelConfig();
    const main = cfg.textRoleModels?.main;
    if (!main) return null;
    const search = cfg.searchConfig;
    // embedding 配置齐全（adapter+model_id+api_key，base_url 可为空）才下发：
    // 后端 Agent 的公共库语义检索（search mode=docs）依赖 ModelFactory(model_config).embedding，
    // 缺省会落到 _EmbeddingStub 返回空向量导致检索恒空，与 searchAgentMemories 同规则。
    const emb = cfg.embeddingModel;
    const embeddingConfig = emb && emb.adapter && emb.model_id && emb.api_key
      ? {
          adapter: emb.adapter,
          base_url: emb.base_url,
          api_key: emb.api_key,
          model_id: emb.model_id,
        }
      : undefined;
    return {
      main_config: {
        adapter: main.adapter,
        base_url: main.base_url,
        api_key: main.api_key,
        model_id: main.model_id,
      },
      search_config: search && search.api_key
        ? { provider: search.provider || 'bocha', api_key: search.api_key }
        : undefined,
      embedding_config: embeddingConfig,
    };
  } catch {
    return null;
  }
}

export async function startAgentSession(bookId?: number): Promise<AgentStartResult> {
  // 后端 /agent/start 不使用请求体（thread 由服务端生成，book_id 走查询参数），
  // 去掉多余的 modelConfigData body（P3）
  const params: Record<string, unknown> = {};
  if (bookId) {
    params.book_id = bookId;
  }
  const res = await apiClient.post<AgentStartResult>('/agent/start', undefined, { params });
  return res.data;
}

export async function streamAgent(
  threadId: string,
  message: string,
  onEvent: (event: SSEEvent) => void,
  onDone: (finalReply: string) => void,
  onError: (err: string) => void,
  abortSignal?: AbortSignal,
  bookId?: number,
  personalRagResults?: Array<Record<string, unknown>>,
): Promise<void> {
  const modelConfigData = await getModelConfigData();

  const res = await authedFetch(`/api/agent/stream/${threadId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      thread_id: threadId,
      message,
      model_config_data: modelConfigData,
      book_id: bookId,
      personal_rag_results: personalRagResults || null,
    }),
    signal: abortSignal,
  });

  if (!res.ok) {
    // 2.5：统一错误具体化——解析后端 detail（如 503「该书籍正在进行 Agent 任务」），
    // 避免上层只能看到笼统的「Agent 请求失败」
    const message = (await extractApiDetail(res)) || 'Agent 请求失败';
    const err: Error & { status?: number } = new Error(message);
    err.status = res.status;
    throw err;
  }

  await readSSE(res, (rawEvent) => {
    const event = rawEvent as unknown as SSEEvent;
    onEvent(event);

    if (event.type === 'end') {
      // 双通道收敛：会话标题只走 title_update 事件（end 事件不携带 title），
      // onDone 仅回传最终回复正文。
      onDone(event.reply || '');
      // 不立即返回，继续读取后续事件，流结束自然退出。
    }
    if (event.type === 'error') {
      onError(event.message || '未知错误');
    }
  });
}

export async function resumeAgent(
  threadId: string,
  onEvent: (event: SSEEvent) => void,
  onDone: (finalReply: string) => void,
  onError: (err: string) => void,
  abortSignal?: AbortSignal,
  bookId?: number,
): Promise<void> {
  await streamAgent(threadId, '', onEvent, onDone, onError, abortSignal, bookId);
}

export async function cancelStream(threadId: string): Promise<void> {
  try {
    await apiClient.post(`/agent/stream/${threadId}/cancel`);
  } catch (e) {
    // 取消失败不影响本地中止（浏览器断开连接同样会触发服务端清理）
    console.warn('[agent] cancelStream 失败', e);
  }
}

export async function releaseBookLock(bookId: number): Promise<boolean> {
  try {
    const { data } = await apiClient.delete<{ ok?: boolean; released?: boolean }>('/agent/book-lock', { params: { book_id: bookId } });
    // 后端 redis 删除失败时返回 HTTP 200 + {ok:false}，必须读取响应体判定，
    // 否则误报"已解除"后重试仍会 503。
    return data?.released === true || data?.ok === true;
  } catch {
    return false;
  }
}

/** 2.4：查询书籍当前是否被 Agent 任务占用（锁状态）。 */
export async function fetchBookLockStatus(bookId: number): Promise<{ locked: boolean; holder?: string | null; ttl?: number | null } | null> {
  try {
    const { data } = await apiClient.get<{ locked: boolean; holder?: string | null; ttl?: number | null }>('/agent/book-lock', { params: { book_id: bookId } });
    return data;
  } catch {
    return null;
  }
}

/** 2.4：写操作审计记录（可选项按书籍过滤）。 */
export async function fetchWriteAudits(bookId?: number, limit = 50): Promise<Array<Record<string, unknown>>> {
  const { data } = await apiClient.get<Array<Record<string, unknown>>>('/agent/audits', { params: { book_id: bookId || undefined, limit } });
  return data ?? [];
}

/** 2.4：回合指标记录（可选项按书籍过滤）。 */
export async function fetchTurnMetrics(bookId?: number, limit = 50): Promise<Array<Record<string, unknown>>> {
  const { data } = await apiClient.get<Array<Record<string, unknown>>>('/agent/turn-metrics', { params: { book_id: bookId || undefined, limit } });
  return data ?? [];
}

export async function submitReviewAction(
  threadId: string,
  action: 'accept' | 'retry' | 'edit' | 'terminate',
  editedContent?: string,
  chapterId?: number,
): Promise<void> {
  await apiClient.post('/agent/review-action', { threadId, action, editedContent: editedContent || null, chapterId: chapterId ?? null });
}


interface ConversationRaw {
  id: number;
  user_id: number;
  title: string;
  thread_id: string;
  update_at: string;
}

interface MessageRaw {
  conversation_id: number;
  role: string;
  content: string;
  think?: string | null;
  type?: string;
  token?: string | null;
  create_at: string;
}

export async function fetchAgentConversations(bookId?: number): Promise<AgentConversation[]> {
  // 2.11：侧栏按当前书过滤（后端支持 book_id 查询参数）
  const { data } = await apiClient.get<ConversationRaw[]>('/agent/conversations', {
    params: bookId ? { book_id: bookId } : undefined,
  });
  return (data ?? []).map((c) => ({
    id: c.id,
    userId: c.user_id,
    title: c.title,
    threadId: c.thread_id,
    updatedAt: c.update_at,
  }));
}

export async function fetchAgentMessages(conversationId: number, params?: { limit?: number; offset?: number }): Promise<AgentMessage[]> {
  const { data } = await apiClient.get<MessageRaw[]>('/agent/conversations/' + conversationId + '/messages', { params });
  return (data ?? []).map((m) => ({
    conversationId: m.conversation_id,
    role: m.role,
    content: m.content,
    think: m.think || undefined,
    type: m.type || undefined,
    token: m.token || undefined,
    createdAt: m.create_at,
  }));
}

export async function deleteConversation(id: number): Promise<void> {
  try {
    await apiClient.delete(`/agent/conversations/${id}`);
  } catch {
    // 删除失败静默（会话仍在，用户可重试）
  }
}

export async function renameConversation(id: number, title: string): Promise<void> {
  await apiClient.patch(`/agent/conversations/${id}`, { title });
}

export async function searchAgentMemories(bookId: number, query: string): Promise<AgentMemory[]> {
  try {
    // 语义检索依赖 embedding 模型配置：已配置时走 mode=semantic（pgvector 向量检索），
    // 未配置/为空时降级 mode=fulltext（后端缺省），保证搜索始终可用。
    const body: Record<string, unknown> = { q: query, book_id: bookId };
    // 与 streamAgent 统一走 getModelConfigData 全量下发（含 main_config/embedding_config），
    // 避免只下发 embedding_config 触发后端 ModelFactory 强依赖 main_config 的历史缺陷；
    // main 未配置（返回 null）时回退仅发 embedding_config（后端已容错 embedding-only）。
    const cfg = await fetchModelConfig();
    const emb = cfg.embeddingModel;
    if (emb && emb.adapter && emb.model_id && emb.api_key) {
      body.mode = 'semantic';
      const full = await getModelConfigData();
      body.model_config_data = full ?? {
        embedding_config: {
          adapter: emb.adapter,
          base_url: emb.base_url,
          api_key: emb.api_key,
          model_id: emb.model_id,
        },
      };
    }
    const { data } = await apiClient.post<AgentMemory[]>('/agent-memories/search', body);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function streamCompress(
  threadId: string,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  const modelConfigData = await getModelConfigData();

  const res = await authedFetch(`/api/agent/compress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId, model_config_data: modelConfigData }),
  });
  if (!res.ok) {
    // 2.5：与 streamAgent 复用同一错误具体化（后端 detail 归一化）
    throw new Error((await extractApiDetail(res)) || 'Agent 请求失败');
  }

  await readSSE(res, (event) => {
    onEvent(event as unknown as SSEEvent);
  });
}