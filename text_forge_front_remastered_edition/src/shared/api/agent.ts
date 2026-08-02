import { apiClient } from './client';
import type { SSEEvent, AgentConversation, AgentMessage } from './types';

interface AgentStartResult {
  thread_id: string;
  book_id: number;
  type: string;
}

export async function startAgentSession(bookId: number): Promise<AgentStartResult> {
  const res = await fetch(`/api/agent/start?book_id=${bookId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('启动 Agent 会话失败');
  return res.json();
}

export async function streamAgent(
  threadId: string,
  message: string,
  onEvent: (event: SSEEvent) => void,
  onDone: (finalReply: string) => void,
  onError: (err: string) => void,
  abortSignal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/agent/stream/${threadId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ message, threadId }),
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
  action: 'accept' | 'retry' | 'edit',
  editedContent?: string,
): Promise<void> {
  const res = await fetch('/api/agent/review-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ threadId, action, editedContent: editedContent || null }),
  });
  if (!res.ok) throw new Error('提交审核失败');
}

export async function agentRespond(threadId: string, message: string): Promise<SSEEvent> {
  const res = await fetch('/api/agent/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ threadId, message }),
  });
  if (!res.ok) throw new Error('同步对话失败');
  return res.json();
}

export async function fetchAgentConversations(): Promise<AgentConversation[]> {
  const { data } = await apiClient.get<{ conversations: AgentConversation[] }>('/agent/conversations');
  return data.conversations ?? [];
}

export async function fetchAgentMessages(conversationId: number): Promise<AgentMessage[]> {
  const { data } = await apiClient.get<{ messages: AgentMessage[] }>(`/agent/conversations/${conversationId}/messages`);
  return data.messages ?? [];
}

export async function compressAgentContext(threadId: string): Promise<void> {
  await apiClient.post('/agent/compress', { thread_id: threadId });
}

