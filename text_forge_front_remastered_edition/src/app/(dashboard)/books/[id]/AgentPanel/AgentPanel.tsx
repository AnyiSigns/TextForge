'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, Shrink, BookOpen, PanelRightOpen, X } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/shared/lib/cn';
import { useBookDetailStore } from '../store';
import type { AgentMessage } from '../store';
import { useAgentSender } from '@/features/agent/useAgentSender';
import * as agentApi from '@/shared/api/agent';
import * as workflowApi from '@/shared/api/workflows';
import type { AgentConversation } from '@/shared/api/types';
import { AgentMemoryManager } from './AgentMemoryManager';
import { MessageList } from './MessageList';
import { AgentInput } from './AgentInput';
import { ConversationSidebar } from './ConversationSidebar';
import { useAgentReview } from './useAgentReview';
import { onAgentSessionsRefresh, onAgentTitle, onAgentCardDrawStart } from '@/features/agent/agentEvents';

interface AgentPanelProps {
  panelFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function AgentPanel({ panelFullscreen, onToggleFullscreen }: AgentPanelProps) {
  const [input, setInput] = useState('');
  const [showMemoryManager, setShowMemoryManager] = useState(false);
  const [sessionsExpanded, setSessionsExpanded] = useState(true);
  const [sessions, setSessions] = useState<AgentConversation[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [workflowList, setWorkflowList] = useState<workflowApi.Workflow[]>([]);
  const [sessionSearch, setSessionSearch] = useState('');
  const [renamingSessionId, setRenamingSessionId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  // 任务 23：@角色/#设定 提及输入
  const [mention, setMention] = useState<{ kind: 'character' | 'setting'; query: string; index: number; items: Array<{ label: string }> } | null>(null);
  const [mentionCharacters, setMentionCharacters] = useState<Array<{ name: string }>>([]);
  const [mentionSettings, setMentionSettings] = useState<Array<{ name: string }>>([]);
  const mentionStartRef = useRef(0);
  // 任务 23：消息分页/懒加载——已加载的历史条数（loadMoreHistory 的 offset 基数）
  const [historyLoadedCount, setHistoryLoadedCount] = useState(0);
  const [historyConvId, setHistoryConvId] = useState<number | null>(null);
  const [draftByThreadId, setDraftByThreadId] = useState<Map<string, string>>(new Map());
  const [modelConfigured, setModelConfigured] = useState<boolean | null>(null);
  const [expandedNodeCards, setExpandedNodeCards] = useState<Set<string>>(new Set());
  const seenNodeIdsRef = useRef<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage, abort, resume, messagesEndRef } = useAgentSender();

  useEffect(() => {
    // 检查是否已配置主模型：未配置时展示引导条
    import('@/shared/api/models').then(({ fetchModelConfig }) =>
      fetchModelConfig().then((cfg) => {
        const main = cfg.textRoleModels?.main;
        setModelConfigured(!!main?.api_key && !!main?.base_url && !!main?.model_id);
      }).catch(() => setModelConfigured(false)),
    );
  }, []);

  const bookId = useBookDetailStore((s) => s.bookId);
  const book = useBookDetailStore((s) => s.book);
  const agentOpen = useBookDetailStore((s) => s.agentOpen);
  const agentMessages = useBookDetailStore((s) => s.agentMessages);
  const agentStreaming = useBookDetailStore((s) => s.agentStreaming);
  const agentStatus = useBookDetailStore((s) => s.agentStatus);
  const agentReasoning = useBookDetailStore((s) => s.agentReasoning);
  const agentReasoningExpanded = useBookDetailStore((s) => s.agentReasoningExpanded);
  const agentNodeStatuses = useBookDetailStore((s) => s.agentNodeStatuses);
  const nodeOutputs = useBookDetailStore((s) => s.nodeOutputs);
  const agentThreadId = useBookDetailStore((s) => s.agentThreadId);

  // 2.4：面板打开时预检书籍占用锁，占用中展示横幅（可强制解除）
  const [bookLocked, setBookLocked] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!agentOpen || !bookId) {
      // setState 放微任务，规避 react-hooks/set-state-in-effect 同步 setState 告警
      queueMicrotask(() => { if (alive) setBookLocked(false); });
      return;
    }
    agentApi.fetchBookLockStatus(bookId)
      .then((st) => { if (alive) setBookLocked(!!st?.locked); })
      .catch(() => { /* 预检失败静默，不影响面板使用 */ });
    return () => { alive = false; };
  }, [agentOpen, bookId]);

  const handleForceReleaseLock = useCallback(async () => {
    try {
      const ok = await agentApi.releaseBookLock(bookId);
      // 审查修复：解除失败（后端错误/网络）时保留横幅并提示，避免误报"已解除"
      if (!ok) {
        useBookDetailStore.getState().addAgentMessage({
          role: 'assistant',
          content: '解除书籍占用锁失败，请稍后重试。',
          type: 'error',
        });
        return;
      }
      setBookLocked(false);
      // 用 getState 避免声明顺序依赖（addAgentMessage 在下方定义）
      useBookDetailStore.getState().addAgentMessage({
        role: 'assistant',
        content: '书籍占用锁已解除。',
        type: 'system',
      });
    } catch { /* 解除失败保持横幅，用户可重试 */ }
  }, [bookId]);

  // 新出现的节点卡片自动展开（对应气泡可见），节点列表清空时复位。
  // 原渲染期 setState 改为 effect + ref（任务 22：渲染期调整移除）
  const prevStatusLenRef = useRef(agentNodeStatuses.length);
  useEffect(() => {
    if (agentNodeStatuses.length === 0 && prevStatusLenRef.current !== 0) {
      setExpandedNodeCards(new Set());
    }
    prevStatusLenRef.current = agentNodeStatuses.length;
  }, [agentNodeStatuses.length]);

  useEffect(() => {
    if (agentNodeStatuses.length === 0) {
      seenNodeIdsRef.current.clear();
      return;
    }
    const fresh = agentNodeStatuses.filter((n) => !seenNodeIdsRef.current.has(n.nodeId));
    if (fresh.length > 0) {
      fresh.forEach((n) => seenNodeIdsRef.current.add(n.nodeId));
      setExpandedNodeCards((prev) => {
        const next = new Set(prev);
        fresh.forEach((n) => next.add(n.nodeId));
        return next;
      });
    }
  }, [agentNodeStatuses]);
  const setAgentStreaming = useBookDetailStore((s) => s.setAgentStreaming);
  const setAgentStatus = useBookDetailStore((s) => s.setAgentStatus);
  const setAgentThreadId = useBookDetailStore((s) => s.setAgentThreadId);
  const setAgentOpen = useBookDetailStore((s) => s.setAgentOpen);
  const setAgentReasoningExpanded = useBookDetailStore((s) => s.setAgentReasoningExpanded);
  const addAgentMessage = useBookDetailStore((s) => s.addAgentMessage);
  const updateAgentStreamToken = useBookDetailStore((s) => s.updateAgentStreamToken);

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

  // 任务 25：事件总线收敛——会话刷新 / 标题更新统一走 agentEvents
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

  useEffect(() => {
    workflowApi.listWorkflows().then(setWorkflowList).catch(() => {});
  }, []);

  // 任务 23：提及输入数据源——角色名 + 设定关键词（文风/世界观/禁忌/自定义维度键）
  useEffect(() => {
    let alive = true;
    if (!bookId) return;
    Promise.all([
      import('@/shared/api/characters').then(({ fetchCharacters }) => fetchCharacters(bookId)),
      import('@/shared/api/books').then(({ fetchCreativeSetting }) => fetchCreativeSetting(bookId)),
    ]).then(([chars, setting]) => {
      if (!alive) return;
      const names = (chars || []).map((c) => ({ name: c.name })).filter((x) => x.name);
      const dims = setting?.customDimensions || {};
      const keys = Object.keys(dims).filter(Boolean).map((k) => ({ name: k }));
      const extras: Array<{ name: string }> = [];
      if (setting?.tone) extras.push({ name: setting.tone.slice(0, 20) });
      if (setting?.worldview) extras.push({ name: setting.worldview.slice(0, 20) });
      if (setting?.writingTaboos) extras.push({ name: setting.writingTaboos.slice(0, 20) });
      setMentionCharacters(names);
      setMentionSettings([...keys, ...extras]);
    }).catch(() => { /* 数据加载失败则提及功能静默降级 */ });
    return () => { alive = false; };
  }, [bookId]);

  const showWorkflowSuggestions = input.trim().startsWith('用') && workflowList.length > 0;

  const handleSend = useCallback(() => {
    const msg = input.trim();
    if (!msg) return;
    setInput('');
    setMention(null);
    void sendMessage(msg);
  }, [input, sendMessage]);

  // 任务 23：@角色/#设定 提及——输入时检测触发词，弹出建议浮层
  const handleInputChange = useCallback((value: string, el: HTMLTextAreaElement) => {
    setInput(value);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    const pos = el.selectionStart ?? value.length;
    const before = value.slice(0, pos);
    const at = before.match(/@([\u4e00-\u9fa5\w]*)$/);
    const hash = before.match(/#([\u4e00-\u9fa5\w]*)$/);
    if (at) {
      const query = at[1];
      const items = mentionCharacters
        .filter((c) => !query || c.name.includes(query))
        .map((c) => ({ label: c.name }));
      if (items.length) {
        mentionStartRef.current = pos - at[0].length;
        setMention({ kind: 'character', query, index: 0, items });
        return;
      }
    } else if (hash) {
      const query = hash[1];
      const items = mentionSettings
        .filter((c) => !query || c.name.includes(query))
        .map((c) => ({ label: c.name }));
      if (items.length) {
        mentionStartRef.current = pos - hash[0].length;
        setMention({ kind: 'setting', query, index: 0, items });
        return;
      }
    }
    setMention(null);
  }, [mentionCharacters, mentionSettings]);

  const applyMention = useCallback((item: { label: string }) => {
    if (!mention || !inputRef.current) return;
    const el = inputRef.current;
    const value = el.value;
    const pos = el.selectionStart ?? value.length;
    const trigger = mention.kind === 'character' ? '@' : '#';
    const replaced = value.slice(0, mentionStartRef.current) + `${trigger}${item.label} ` + value.slice(pos);
    setInput(replaced);
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      const caret = mentionStartRef.current + trigger.length + item.label.length + 1;
      el.setSelectionRange(caret, caret);
    });
  }, [mention]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mention || !mention.items.length) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      // N13：导航 index 限制在展示范围（slice(0,6)），仅 min(index,5) 不够——
      // ArrowUp 从 0 回绕到 items.length-1（>5）仍不可见，模数双向统一取 min(len,6)
      setMention((m) => (m ? { ...m, index: (m.index + 1) % Math.min(m.items.length, 6) } : m));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMention((m) => {
        if (!m) return m;
        const n = Math.min(m.items.length, 6);
        return { ...m, index: (m.index - 1 + n) % n };
      });
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      applyMention(mention.items[mention.index]);
    } else if (e.key === 'Escape') {
      setMention(null);
    } else if (e.key === 'Enter' && e.shiftKey) {
      // shift+Enter 换行，照常（不阻止默认行为）
    }
  }, [mention, handleSend, applyMention]);

  const handleWorkflowSelect = useCallback((wf: workflowApi.Workflow) => {
    // 2.8：提示词示例为半角 (ID: xxx)（subgraph_prompts.py），全角会导致模型无法匹配
    const msg = `请用工作流"${wf.name}" (ID: ${wf.id}) 执行创作任务。`;
    setInput('');
    void sendMessage(msg);
  }, [sendMessage]);

  // 任务 25：卡片绘制事件走 typed agentEvents
  useEffect(() => {
    return onAgentCardDrawStart((detail) => {
      if (!detail) return;

      const chars = ((detail.characters as Array<{ name: string; roleType?: string; description?: string }>) || [])
        .map((c) => `${c.name}${c.roleType ? `（${c.roleType}）` : ''}${c.description ? `：${c.description}` : ''}`)
        .join('、');
      const locs = ((detail.locations as Array<{ name: string; type?: string }>) || [])
        .map((l) => `${l.name}${l.type ? `（${l.type}）` : ''}`)
        .join('、');
      const parts: string[] = [];
      if (chars) parts.push(`选定角色：${chars}`);
      if (locs) parts.push(`场景地点：${locs}`);
      if (detail.storyDirection) parts.push(`故事方向：${detail.storyDirection}`);
      if (detail.outlineNode) parts.push(`关联大纲：${detail.outlineNode}`);
      if (detail.extraRequirements) parts.push(`额外要求：${detail.extraRequirements}`);

      const prompt = `请基于以下创作要素展开剧情：\n\n${parts.join('\n')}\n\n请根据以上设定，生成一段完整的剧情展开（包含场景描写、角色对话和情节推进）。`;
      void sendMessage(prompt);
    });
  }, [sendMessage]);

  const handleAbort = () => {
    abort();
    setAgentStreaming(false);
    setAgentStatus({ kind: 'idle' });
    useBookDetailStore.setState((state) => ({
      agentMessages: state.agentMessages.map((m) => {
        if (m.type === 'streaming') return { ...m, type: 'system' as const };
        // 任务 22：abort 后复位工具卡片（防止永久「请求外援中」spinner）
        if (m.type === 'tool' && m.toolStatus === 'running') return { ...m, toolStatus: 'error' as const };
        return m;
      }),
      agentNodeStatuses: [],
      nodeOutputs: {},
      pendingReview: null,
      agentReasoning: '',
    }));
  };

  const handleNewSession = () => {
    if (input.trim() && agentThreadId) {
      setDraftByThreadId((prev) => {
        const next = new Map(prev);
        next.set(agentThreadId, input);
        return next;
      });
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
  };

  const handleSelectSession = async (s: AgentConversation) => {
    if (input.trim() && agentThreadId) {
      setDraftByThreadId((prev) => {
        const next = new Map(prev);
        next.set(agentThreadId, input);
        return next;
      });
    }
    // 任务 22：切换会话前先中止当前流的流式响应，避免旧响应写入新会话列表
    if (agentStreaming) {
      abort();
    }
    setAgentThreadId(s.threadId);
    useBookDetailStore.setState({ agentMessages: [], agentStreaming: false, agentStatus: { kind: 'idle' }, agentNodeStatuses: [], nodeOutputs: {}, pendingReview: null, agentReasoning: '' });
    setInput(draftByThreadId.get(s.threadId) || '');
    setHistoryLoadedCount(0);
    setHistoryConvId(s.id);
    try {
      // 任务 23：消息分页/懒加载——首次只拉最近 50 条，滚动到顶时加载更早
      const msgs = await agentApi.fetchAgentMessages(s.id, { limit: 50, offset: 0 });
      setHistoryLoadedCount(msgs.length);
      const mapped = msgs.map((m) => {
        const type = (m.type as AgentMessage['type']) || undefined;
        return {
          role: m.role as 'user' | 'assistant',
          content: m.content,
          type,
          token: m.token || undefined,
          // 2.12：历史回放审核卡只读（live:false 不渲染操作按钮）；仅卡片消息注入
          ...(type === 'review-card' ? { live: false as const } : {}),
        };
      }) as AgentMessage[];
      useBookDetailStore.setState({ agentMessages: mapped });
    } catch { /* ignore */ }
  };

  // 任务 23：懒加载更早消息（offset = 已加载条数，向后翻页）；返回实际加载条数，
  // 调用方据此推进 offset，避免最后一页不足 limit 时用相同 offset 重复加载相同消息。
  const loadMoreHistory = useCallback(async (convId: number, totalLoaded: number): Promise<number> => {
    try {
      const msgs = await agentApi.fetchAgentMessages(convId, { limit: 50, offset: totalLoaded });
      if (!msgs.length) return 0;
      const mapped = msgs.map((m) => {
        const type = (m.type as AgentMessage['type']) || undefined;
        return {
          role: m.role as 'user' | 'assistant',
          content: m.content,
          type,
          token: m.token || undefined,
          // 2.12：历史回放审核卡只读
          ...(type === 'review-card' ? { live: false as const } : {}),
        };
      }) as AgentMessage[];
      useBookDetailStore.setState((state) => ({
        agentMessages: [...mapped, ...state.agentMessages],
      }));
      return msgs.length;
    } catch {
      return 0;
    }
  }, []);

  const handleDeleteSession = async (s: AgentConversation) => {
    try {
      await agentApi.deleteConversation(s.id);
      setSessions((prev) => prev.filter((x) => x.id !== s.id));
      if (agentThreadId === s.threadId) {
        handleNewSession();
      }
    } catch { /* ignore */ }
  };

  // 任务 23：会话手动重命名（行内编辑，Enter/失焦确认，Esc 取消）
  const handleRenameStart = (s: AgentConversation) => {
    setRenameDraft(s.title || '');
    setRenamingSessionId(s.id);
  };

  const handleRenameConfirm = async (s: AgentConversation) => {
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
  };

  const handleManualCompress = async () => {
    if (!agentThreadId || agentStreaming) return;
    setAgentStreaming(true);
    setAgentStatus({ kind: 'working', label: '压缩上下文中…' });
    addAgentMessage({ role: 'assistant', content: '', type: 'streaming' });
    let buffer = '';
    try {
      await agentApi.streamCompress(agentThreadId, (event) => {
        if (event.type === 'token') {
          buffer += (event as { token?: string }).token || '';
          updateAgentStreamToken(buffer);
        } else if (event.type === 'compress_done') {
          // N12：展示压缩裁剪统计（removed_count/remaining_count）
          const done = event as { removed_count?: number; remaining_count?: number };
          const hasCounts = typeof done.removed_count === 'number' && typeof done.remaining_count === 'number';
          const summary = hasCounts
            ? `上下文压缩完成（移除 ${done.removed_count} 条，保留 ${done.remaining_count} 条）：\n\n${buffer}`
            : `上下文压缩完成：\n\n${buffer}`;
          useBookDetailStore.setState((state) => ({
            agentMessages: state.agentMessages.map((m) =>
              m.type === 'streaming'
                ? { ...m, type: 'system' as const, content: summary }
                : m,
            ),
          }));
        } else if (event.type === 'error') {
          throw new Error((event as { message?: string }).message || '压缩失败');
        }
      });
    } catch (e) {
      useBookDetailStore.setState((s) => ({
        agentMessages: s.agentMessages.filter((m) => m.type !== 'streaming'),
      }));
      addAgentMessage({
        role: 'assistant',
        content: `上下文压缩失败：${(e as Error)?.message || ''}`,
        type: 'error',
      });
    } finally {
      setAgentStreaming(false);
      setAgentStatus({ kind: 'idle' });
    }
  };

  // 任务 24：审核 / 重试 / 复制 / 编辑重发逻辑抽到 useAgentReview
  const { handleReviewAction, handleUnlockAndRetry, handleCopyMessage, handleEditSend } = useAgentReview({
    agentThreadId,
    bookId,
    resume,
    sendMessage,
    onSetInput: setInput,
    onFocusInput: () => inputRef.current?.focus(),
  });

  const toggleNodeCard = useCallback((nodeId: string) => {
    setExpandedNodeCards((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const placeholderText = book ? '输入创作指令…' : '输入消息…';

  return (
    <div className="ide-agent">
      <div className="ide-agent-header">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[13px]">AI 助手</span>
          <span className="text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-px rounded">聊天</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={handleNewSession} className="agent-icon-btn" title="新建会话">
            <Plus size={14} strokeWidth={1.8} />
          </button>
          <button onClick={handleManualCompress} className="agent-icon-btn" title="压缩上下文" disabled={!agentThreadId || agentStreaming}>
            <Shrink size={12} strokeWidth={1.8} />
          </button>
          {/* 任务 22：记忆按钮入口常驻（原来仅在会话列表收起时显示） */}
          {bookId > 0 && (
            <button onClick={() => setShowMemoryManager(true)} className="agent-icon-btn" title="记忆">
              <BookOpen size={12} strokeWidth={1.8} />
            </button>
          )}
          {!sessionsExpanded && (
            <button onClick={() => setSessionsExpanded(true)} className="agent-icon-btn" title="展开会话列表">
              <PanelRightOpen size={12} strokeWidth={1.8} />
            </button>
          )}
          <button
            onClick={onToggleFullscreen}
            className="agent-icon-btn"
            title={panelFullscreen ? '还原' : '全屏'}
          >
            <span className={cn('block w-3 h-3 relative', panelFullscreen && 'text-foreground')}>
              <span className={cn('absolute top-0 left-0 w-1 h-1 border-l border-t', panelFullscreen ? 'border-foreground/60' : 'border-foreground/40')} />
              <span className={cn('absolute top-0 right-0 w-1 h-1 border-r border-t', panelFullscreen ? 'border-foreground/60' : 'border-foreground/40')} />
              <span className={cn('absolute bottom-0 left-0 w-1 h-1 border-l border-b', panelFullscreen ? 'border-foreground/60' : 'border-foreground/40')} />
              <span className={cn('absolute bottom-0 right-0 w-1 h-1 border-r border-b', panelFullscreen ? 'border-foreground/60' : 'border-foreground/40')} />
            </span>
          </button>
          <button
            onClick={() => setAgentOpen(false)}
            className="agent-icon-btn"
            title="关闭面板"
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {bookLocked && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-amber-500/[0.06]">
          <span className="text-[11px] text-amber-600/90 flex-1">该书正在执行 Agent 任务，新操作可能被拒绝</span>
          <button
            onClick={() => { void handleForceReleaseLock(); }}
            className="text-[11px] font-medium text-foreground underline underline-offset-2 hover:opacity-70 bg-transparent border-none cursor-pointer"
          >
            强制解除
          </button>
        </div>
      )}

      {modelConfigured === false && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-destructive/[0.04]">
          <span className="text-[11px] text-destructive/80 flex-1">尚未配置模型，AI 助手无法工作</span>
          <Link href="/settings" className="text-[11px] font-medium text-foreground underline underline-offset-2 hover:opacity-70">
            去设置
          </Link>
        </div>
      )}

      <div className="ide-agent-main">
        <div className="ide-agent-chat">
          <MessageList
            messages={agentMessages}
            book={book}
            agentStreaming={agentStreaming}
            agentStatus={agentStatus}
            agentReasoning={agentReasoning}
            agentReasoningExpanded={agentReasoningExpanded}
            onToggleReasoning={() => setAgentReasoningExpanded(!agentReasoningExpanded)}
            expandedNodeCards={expandedNodeCards}
            onToggleNode={toggleNodeCard}
            nodeOutputs={nodeOutputs}
            onReviewAction={handleReviewAction}
            onSendMessage={(msg) => void sendMessage(msg)}
            onPickSuggestion={(s) => { setInput(s); inputRef.current?.focus(); }}
            onCopy={handleCopyMessage}
            onEditSend={handleEditSend}
            onUnlockAndRetry={handleUnlockAndRetry}
            messagesEndRef={messagesEndRef}
            loadMoreHistory={loadMoreHistory}
            historyConvId={historyConvId}
            historyLoadedCount={historyLoadedCount}
            onHistoryLoadedChange={setHistoryLoadedCount}
          />

          <AgentInput
            input={input}
            placeholderText={placeholderText}
            agentStreaming={agentStreaming}
            showWorkflowSuggestions={showWorkflowSuggestions}
            workflowList={workflowList}
            mention={mention}
            inputRef={inputRef}
            onInputChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onApplyMention={applyMention}
            onMentionHover={(i) => setMention((m) => (m ? { ...m, index: i } : m))}
            onSend={() => { void handleSend(); }}
            onAbort={handleAbort}
            onWorkflowSelect={handleWorkflowSelect}
          />
        </div>

        {sessionsExpanded && (
          <ConversationSidebar
            sessions={sessions}
            loadingSessions={loadingSessions}
            agentThreadId={agentThreadId}
            sessionSearch={sessionSearch}
            renamingSessionId={renamingSessionId}
            renameDraft={renameDraft}
            onSearch={setSessionSearch}
            onRefresh={() => { void fetchSessions(); }}
            onCollapse={() => setSessionsExpanded(false)}
            onSelect={(s) => { void handleSelectSession(s); }}
            onRenameStart={handleRenameStart}
            onRenameDraft={setRenameDraft}
            onRenameConfirm={(s) => { void handleRenameConfirm(s); }}
            onRenameCancel={() => setRenamingSessionId(null)}
            onDelete={(s) => { void handleDeleteSession(s); }}
          />
        )}
      </div>

      {showMemoryManager && (
        <AgentMemoryManager bookId={bookId} onClose={() => setShowMemoryManager(false)} />
      )}
    </div>
  );
}
