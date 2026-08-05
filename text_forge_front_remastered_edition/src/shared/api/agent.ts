import { apiClient } from './client';
import { getAccessToken } from '@/shared/stores/authStore';
import { fetchModelConfig } from '@/shared/api/models';
import type { SSEEvent, AgentConversation, AgentMessage } from './types';

interface AgentStartResult {
  thread_id: string;
  book_id: number | null;
  type: string;
}

async function getModelConfigData() {
  try {
    const cfg = await fetchModelConfig();
    const main = cfg.textRoleModels?.main;
    if (!main) return null;
    return {
      main_config: {
        adapter: main.adapter,
        base_url: main.base_url,
        api_key: main.api_key,
        model_id: main.model_id,
      },
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
): Promise<void> {
  const token = getAccessToken();
  const modelConfigData = await getModelConfigData();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api/agent/stream/${threadId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ thread_id: threadId, message, model_config_data: modelConfigData }),
    signal: abortSignal,
  });

  if (!res.ok) throw new Error('Agent 请求失败');

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event: SSEEvent = JSON.parse(line.slice(6));
            onEvent(event);

            if (event.type === 'end') {
              onDone(event.reply || '');
              return;
            }
            if (event.type === 'error') {
              onError(event.message || '未知错误');
              return;
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function resumeAgent(
  threadId: string,
  onEvent: (event: SSEEvent) => void,
  onDone: (finalReply: string) => void,
  onError: (err: string) => void,
  abortSignal?: AbortSignal,
): Promise<void> {
  await streamAgent(threadId, '', onEvent, onDone, onError, abortSignal);
}

export async function submitReviewAction(
  threadId: string,
  action: 'accept' | 'retry' | 'edit' | 'terminate',
  editedContent?: string,
  chapterId?: number,
): Promise<void> {
  await apiClient.post('/agent/review-action', { threadId, action, editedContent: editedContent || null, chapterId: chapterId ?? null });
}


export async function patchAgentState(threadId: string, values: Record<string, unknown>): Promise<void> {
  await apiClient.patch(`/agent/state/${threadId}`, values);
}

export async function agentRespond(threadId: string, message: string): Promise<SSEEvent> {
  const res = await apiClient.post<SSEEvent>('/agent/respond', { threadId, message });
  return res.data;
}

export async function fetchAgentConversations(): Promise<AgentConversation[]> {
  const { data } = await apiClient.get<any[]>('/agent/conversations');
  return (data as any[]).map((c: any) => ({
    id: c.id,
    userId: c.user_id,
    title: c.title,
    threadId: c.thread_id,
    updatedAt: c.update_at,
  }));
}

export async function fetchAgentMessages(conversationId: number): Promise<AgentMessage[]> {
  const { data } = await apiClient.get<any[]>('/agent/conversations/' + conversationId + '/messages');
  return (data as any[]).map((m: any) => ({
    conversationId: m.conversation_id,
    role: m.role,
    content: m.content,
    think: m.think,
    createdAt: m.create_at,
  }));
}

export async function deleteConversation(id: number): Promise<void> {
  try {
    await apiClient.delete(`/agent/conversations/${id}`);
  } catch { /* endpoint may not exist yet */ }
}

export async function searchAgentMemories(bookId: number, query: string): Promise<any[]> {
  try {
    const { data } = await apiClient.post<any[]>('/agent-memories/search', { q: query, book_id: bookId });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function compressAgentContext(threadId: string): Promise<{ summary: string; removed_count: number; remaining_count: number }> {
  const { data } = await apiClient.post<{ summary: string; removed_count: number; remaining_count: number }>('/agent/compress', { thread_id: threadId });
  return data;
}

