'use client';

/**
 * Agent 面板：会话列表 / 切换 / 历史分页 / 草稿 / 重命名 / 删除（从 AgentPanel.tsx 抽离）。
 */
import { useCallback, useEffect, useState } from 'react';
import { useBookDetailStore } from '../store';
import type { AgentMessage as StoreAgentMessage } from '../store';
import * as agentApi from '@/shared/api/agent';
import type { AgentConversation, AgentMessage as ApiAgentMessage } from '@/shared/api/types';
import { onAgentSessionsRefresh, onAgentTitle } from '@/features/agent/agentEvents';

interface UseAgentSessionsOptions {
  bookId: number;
  /** 当前输入（切换会话前保存草稿） */
  input: string;
  setInput: (v: string) => void;
  /** 切换会话前中止当前流的流式响应 */
  abort: () => void;
}

/** 后端消息 → store AgentMessage（历史回放审核卡只读）。 */
function mapHistoryMessage(m: ApiAgentMessage): StoreAgentMessage {
  const type = (m.type as StoreAgentMessage['type']) || undefined;
  return {
    role: m.role as 'user' | 'assistant',
    content: m.content,
    type,
    token: m.token || undefined,
    // 2.12：历史回放审核卡只读（live:false 不渲染操作按钮）；仅卡片消息注入
    ...(type === 'review-card' ? { live: false as const } : {}),
  } as StoreAgentMessage;
}

export function useAgentSessions({ bookId, input, setInput, abort }: UseAgentSessionsOptions) {
  const setAgentThreadId = useBookDetailStore((s) => s.setAgentThreadId);
  const setAgentStreaming = useBookDetailStore((s) => s.setAgentStreaming);
  const setAgentStatus = useBookDetailStore((s) => s.setAgentStatus);

  const [sessions, setSessions] = useState<AgentConversation[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessionSearch, setSessionSearch] = useState('');
  const [renamingSessionId, setRenamingSessionId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [draftByThreadId, setDraftByThreadId] = useState<Map<string, string>>(new Map());
  // 消息分页/懒加载——已加载的历史条数（loadMoreHistory 的 offset 基数）
  const [historyLoadedCount, setHistoryLoadedCount] = useState(0);
  const [historyConvId, setHistoryConvId] = useState<number | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      // 2.11：侧栏按当前书过滤（后端 /agent/conversations 支持 book_id）
      const list = await agentApi.fetchAgentConversations(bookId || undefined);
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setSessions(list);
    } catch { /* ignore */ }
    finally { setLoadingSessions(false); }
  }, [bookId]);

  // 书籍切换时重新进入加载态（原渲染期 setState 改为 effect 内处理）
  useEffect(() => {
    let alive = true;
    // setState 放微任务，规避 react-hooks/set-state-in-effect 同步 setState 告警
    queueMicrotask(() => { if (alive) setLoadingSessions(true); });
    agentApi.fetchAgentConversations(bookId || undefined).then((list) => {
      if (!alive) return;
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setSessions(list);
    }).catch(() => { /* ignore */ }).finally(() => { if (alive) setLoadingSessions(false); });
    return () => { alive = false; };
  }, [bookId]);

  // 事件总线收敛——会话刷新 / 标题更新统一走 agentEvents
  useEffect(() => {
    return onAgentSessionsRefresh(() => { void fetchSessions(); });
  }, [fetchSessions]);

  useEffect(() => {
    return onAgentTitle((detail) => {
      if (!detail?.threadId || !detail.title) return;
      setSessions((prev) =>
        prev.map((s) => (s.threadId === detail.threadId ? { ...s, title: detail.title as string } : s)),
      );
    });
  }, []);

  /** 切换会话前把当前未发送输入存为草稿。 */
  const saveDraft = useCallback((threadId: string, text: string) => {
    if (!text.trim()) return;
    setDraftByThreadId((prev) => {
      const next = new Map(prev);
      next.set(threadId, text);
      return next;
    });
  }, []);

  /** 新建会话：清空会话态并保留当前输入为草稿。 */
  const handleNewSession = useCallback(() => {
    const agentThreadId = useBookDetailStore.getState().agentThreadId;
    if (input.trim() && agentThreadId) {
      saveDraft(agentThreadId, input);
    }
    setAgentThreadId(null);
    useBookDetailStore.setState({
      agentMessages: [],
      agentNodeStatuses: [],
      nodeOutputs: {},
      pendingReview: null,
      agentReasoning: '',
    });
    setAgentStreaming(false);
    setAgentStatus({ kind: 'idle' });
    setInput('');
    void fetchSessions();
  }, [input, saveDraft, setAgentThreadId, setAgentStreaming, setAgentStatus, setInput, fetchSessions]);

  /** 切换会话：中止当前流、加载历史消息（最近 50 条）并恢复草稿。 */
  const handleSelectSession = useCallback(async (s: AgentConversation) => {
    const agentThreadId = useBookDetailStore.getState().agentThreadId;
    const agentStreaming = useBookDetailStore.getState().agentStreaming;
    if (input.trim() && agentThreadId) {
      saveDraft(agentThreadId, input);
    }
    // 切换会话前先中止当前流的流式响应，避免旧响应写入新会话列表
    if (agentStreaming) {
      abort();
    }
    setAgentThreadId(s.threadId);
    useBookDetailStore.setState({ agentMessages: [], agentStreaming: false, agentStatus: { kind: 'idle' }, agentNodeStatuses: [], nodeOutputs: {}, pendingReview: null, agentReasoning: '' });
    setInput(draftByThreadId.get(s.threadId) || '');
    setHistoryLoadedCount(0);
    setHistoryConvId(s.id);
    try {
      // 消息分页/懒加载——首次只拉最近 50 条，滚动到顶时加载更早
      const msgs = await agentApi.fetchAgentMessages(s.id, { limit: 50, offset: 0 });
      setHistoryLoadedCount(msgs.length);
      useBookDetailStore.setState({ agentMessages: msgs.map(mapHistoryMessage) });
    } catch { /* ignore */ }
  }, [input, saveDraft, abort, setAgentThreadId, setInput, draftByThreadId]);

  // 懒加载更早消息（offset = 已加载条数，向后翻页）；返回实际加载条数，
  // 调用方据此推进 offset，避免最后一页不足 limit 时用相同 offset 重复加载相同消息。
  const loadMoreHistory = useCallback(async (convId: number, totalLoaded: number): Promise<number> => {
    try {
      const msgs = await agentApi.fetchAgentMessages(convId, { limit: 50, offset: totalLoaded });
      if (!msgs.length) return 0;
      useBookDetailStore.setState((state) => ({
        agentMessages: [...msgs.map(mapHistoryMessage), ...state.agentMessages],
      }));
      return msgs.length;
    } catch {
      return 0;
    }
  }, []);

  const handleDeleteSession = useCallback(async (s: AgentConversation) => {
    try {
      await agentApi.deleteConversation(s.id);
      setSessions((prev) => prev.filter((x) => x.id !== s.id));
      if (useBookDetailStore.getState().agentThreadId === s.threadId) {
        handleNewSession();
      }
    } catch { /* ignore */ }
  }, [handleNewSession]);

  // 会话手动重命名（行内编辑，Enter/失焦确认，Esc 取消）
  const handleRenameStart = useCallback((s: AgentConversation) => {
    setRenameDraft(s.title || '');
    setRenamingSessionId(s.id);
  }, []);

  const handleRenameConfirm = useCallback(async (s: AgentConversation) => {
    if (renamingSessionId !== s.id) return;
    const title = renameDraft.trim();
    setRenamingSessionId(null);
    if (!title || title === s.title) return;
    try {
      await agentApi.renameConversation(s.id, title);
      setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, title } : x)));
    } catch {
      // 重命名失败：还原为原标题，静默（用户可重试）
      setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, title: s.title } : x)));
    }
  }, [renamingSessionId, renameDraft]);

  return {
    sessions,
    loadingSessions,
    sessionSearch,
    setSessionSearch,
    renamingSessionId,
    setRenamingSessionId,
    renameDraft,
    setRenameDraft,
    historyLoadedCount,
    setHistoryLoadedCount,
    historyConvId,
    fetchSessions,
    handleNewSession,
    handleSelectSession,
    loadMoreHistory,
    handleDeleteSession,
    handleRenameStart,
    handleRenameConfirm,
  };
}
