import { apiClient } from './client';
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
    };
  } catch {
    return null;
  }
}

export async function startAgentSession(bookId?: number): Promise<AgentStartResult> {
  const modelConfigData = await getModelConfigData();
  const params: Record<string, unknown> = {};
  if (bookId) {
    params.book_id = bookId;
  }
  const res = await apiClient.post<AgentStartResult>('/agent/start', modelConfigData, { params });
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
    // 解析后端 detail（如 503「该书籍正在进行 Agent 任务」），避免上层只能看到笼统的「Agent 请求失败」
    let message = 'Agent 请求失败';
    try {
      const data = (await res.json()) as { detail?: string };
      if (data?.detail) message = data.detail;
    } catch {
      // 非 JSON 响应体时保留默认消息
    }
    const err: Error & { status?: number } = new Error(message);
    err.status = res.status;
    throw err;
  }

  await readSSE(res, (rawEvent) => {
    const event = rawEvent as unknown as SSEEvent;
    onEvent(event);

    if (event.type === 'end') {
      // 任务 25 双通道收敛：会话标题只走 title_update 事件（end 事件不携带 title），
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
  } catch {
    // 取消失败不影响本地中止（浏览器断开连接同样会触发服务端清理）
  }
}

export async function releaseBookLock(bookId: number): Promise<boolean> {
  try {
    await apiClient.delete('/agent/book-lock', { params: { book_id: bookId } });
    return true;
  } catch {
    return false;
  }
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

export async function fetchAgentConversations(): Promise<AgentConversation[]> {
  const { data } = await apiClient.get<ConversationRaw[]>('/agent/conversations');
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
    const { data } = await apiClient.post<AgentMemory[]>('/agent-memories/search', { q: query, book_id: bookId });
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
  if (!res.ok) throw new Error('Agent 请求失败');

  await readSSE(res, (event) => {
    onEvent(event as unknown as SSEEvent);
  });
}