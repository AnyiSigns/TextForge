'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, CircleStop, Plus, Shrink, BookOpen, PanelRightOpen, PanelRightClose, RefreshCw, Trash2, Search, ChevronDown, X } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/shared/lib/cn';
import { useBookDetailStore } from '../store';
import { useAgentSender } from '@/features/agent/useAgentSender';
import * as agentApi from '@/shared/api/agent';
import * as workflowApi from '@/shared/api/workflows';
import type { AgentConversation } from '@/shared/api/types';
import { ReviewCard } from './ReviewCard';
import { ProposeCards } from './ProposeCards';
import { AgentMemoryManager } from './AgentMemoryManager';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const SUGGESTIONS = ['分析创作状态并提议卡片', '构思剧情走向', '设计角色对话', '优化章节大纲', '检查设定矛盾'];

function MarkdownContent({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children: c }) => <p className="my-1 first:mt-0 last:mb-0">{c}</p>,
        strong: ({ children: c }) => <strong className="font-semibold">{c}</strong>,
        em: ({ children: c }) => <em className="italic">{c}</em>,
        ul: ({ children: c }) => <ul className="list-disc pl-4 my-1 space-y-0.5">{c}</ul>,
        ol: ({ children: c }) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{c}</ol>,
        li: ({ children: c }) => <li>{c}</li>,
        code: ({ children: c, className: cls }) => {
          const isInline = !cls;
          return isInline ? (
            <code className="px-1 py-0.5 bg-foreground/10 text-[12px]">{c}</code>
          ) : (
            <code className="block my-1 p-2 bg-foreground/5 text-[12px] overflow-x-auto whitespace-pre-wrap">{c}</code>
          );
        },
        pre: ({ children: c }) => <pre className="my-1">{c}</pre>,
        blockquote: ({ children: c }) => (
          <blockquote className="border-l-2 border-foreground/15 pl-3 my-1 italic text-muted-foreground/80">{c}</blockquote>
        ),
        hr: () => <hr className="my-2 border-foreground/10" />,
        h1: ({ children: c }) => <h1 className="text-[15px] font-semibold my-2">{c}</h1>,
        h2: ({ children: c }) => <h2 className="text-[14px] font-semibold my-1.5">{c}</h2>,
        h3: ({ children: c }) => <h3 className="text-[13px] font-semibold my-1">{c}</h3>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function relativeTime(dateStr: string): string {
  const s = dateStr.trim();
  const normalized = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`;
  const now = Date.now();
  const diff = now - new Date(normalized).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return `${Math.floor(days / 7)}周前`;
}

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
  const agentMessages = useBookDetailStore((s) => s.agentMessages);
  const agentStreaming = useBookDetailStore((s) => s.agentStreaming);
  const agentStatus = useBookDetailStore((s) => s.agentStatus);
  const agentNodeStatuses = useBookDetailStore((s) => s.agentNodeStatuses);
  const nodeOutputs = useBookDetailStore((s) => s.nodeOutputs);
  const agentThreadId = useBookDetailStore((s) => s.agentThreadId);

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
  const addAgentMessage = useBookDetailStore((s) => s.addAgentMessage);
  const updateAgentStreamToken = useBookDetailStore((s) => s.updateAgentStreamToken);
  const setAgentStreaming = useBookDetailStore((s) => s.setAgentStreaming);
  const setAgentStatus = useBookDetailStore((s) => s.setAgentStatus);
  const setAgentThreadId = useBookDetailStore((s) => s.setAgentThreadId);
  const setPendingReview = useBookDetailStore((s) => s.setPendingReview);
  const setAgentOpen = useBookDetailStore((s) => s.setAgentOpen);

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const list = await agentApi.fetchAgentConversations();
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setSessions(list);
    } catch { /* ignore */ }
    finally { setLoadingSessions(false); }
  }, []);

  // 书籍切换时重新进入加载态（原渲染期 setState 改为 effect 内处理）
  useEffect(() => {
    let alive = true;
    // setState 放微任务，规避 react-hooks/set-state-in-effect 同步 setState 告警
    queueMicrotask(() => { if (alive) setLoadingSessions(true); });
    agentApi.fetchAgentConversations().then((list) => {
      if (!alive) return;
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setSessions(list);
    }).catch(() => { /* ignore */ }).finally(() => { if (alive) setLoadingSessions(false); });
    return () => { alive = false; };
  }, [bookId]);

  useEffect(() => {
    const onRefreshSessions = () => { void fetchSessions(); };
    window.addEventListener('textforge:refresh-agent-sessions', onRefreshSessions);
    return () => window.removeEventListener('textforge:refresh-agent-sessions', onRefreshSessions);
  }, [fetchSessions]);

  useEffect(() => {
    const onTitleUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { threadId?: string; title?: string } | undefined;
      if (!detail?.threadId || !detail.title) return;
      setSessions((prev) =>
        prev.map((s) => (s.threadId === detail.threadId ? { ...s, title: detail.title as string } : s)),
      );
    };
    window.addEventListener('textforge:agent-title', onTitleUpdate);
    return () => window.removeEventListener('textforge:agent-title', onTitleUpdate);
  }, []);

  useEffect(() => {
    workflowApi.listWorkflows().then(setWorkflowList).catch(() => {});
  }, []);

  const showWorkflowSuggestions = input.trim().startsWith('用') && workflowList.length > 0;

  const handleSend = useCallback(() => {
    const msg = input.trim();
    if (!msg) return;
    setInput('');
    void sendMessage(msg);
  }, [input, sendMessage]);

  const handleWorkflowSelect = useCallback((wf: workflowApi.Workflow) => {
    const msg = `请用工作流"${wf.name}"（ID: ${wf.id}）执行创作任务。`;
    setInput('');
    void sendMessage(msg);
  }, [sendMessage]);

  useEffect(() => {
    const handleCardDrawStart = (e: Event) => {
      const detail = (e as CustomEvent).detail as Record<string, unknown> | undefined;
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
    };

    window.addEventListener('textforge:card-draw-start', handleCardDrawStart);
    return () => window.removeEventListener('textforge:card-draw-start', handleCardDrawStart);
  }, [sendMessage]);

  const handleAbort = () => {
    abort();
    setAgentStreaming(false);
    setAgentStatus({ kind: 'idle' });
    useBookDetailStore.setState((state) => ({
      agentMessages: state.agentMessages.map((m) => {
        if (m.type === 'streaming') return { ...m, type: 'system' };
        // 任务 22：abort 后复位工具卡片（防止永久「请求外援中」spinner）
        if (m.type === 'tool' && m.toolStatus === 'running') return { ...m, toolStatus: 'error' };
        return m;
      }),
      agentNodeStatuses: [],
      nodeOutputs: {},
      pendingReview: null,
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
      agentToolLog: [],
      agentNodeStatuses: [],
      nodeOutputs: {},
      pendingReview: null,
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
    useBookDetailStore.setState({ agentMessages: [], agentStreaming: false, agentStatus: { kind: 'idle' }, agentToolLog: [], agentNodeStatuses: [], nodeOutputs: {}, pendingReview: null });
    setInput(draftByThreadId.get(s.threadId) || '');
    try {
      const msgs = await agentApi.fetchAgentMessages(s.id);
      const mapped: Array<{ role: 'user' | 'assistant'; content: string; type?: string; token?: string }> = msgs.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        type: m.type || undefined,
        token: m.token || undefined,
      }));
      useBookDetailStore.setState({ agentMessages: mapped });
    } catch { /* ignore */ }
  };

  const handleDeleteSession = async (s: AgentConversation) => {
    try {
      await agentApi.deleteConversation(s.id);
      setSessions((prev) => prev.filter((x) => x.id !== s.id));
      if (agentThreadId === s.threadId) {
        handleNewSession();
      }
    } catch { /* ignore */ }
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
          useBookDetailStore.setState((state) => ({
            agentMessages: state.agentMessages.map((m) =>
              m.type === 'streaming'
                ? { ...m, type: 'system', content: `上下文压缩完成：\n\n${m.content}` }
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

  const handleReviewAction = async (action: 'accept' | 'retry' | 'edit' | 'terminate', editedContent?: string, chapterId?: number) => {
    if (!agentThreadId) return;
    // 先保存待审状态与审核卡消息副本，续跑失败时恢复，避免「卡消失且无法再操作」的 UI 死锁
    const prevReview = useBookDetailStore.getState().pendingReview;
    const removedCards = useBookDetailStore.getState().agentMessages.filter((m) => m.type === 'review-card');
    setPendingReview(null);
    // 清除消息流中的审核卡（review-card 是持久化消息，只清 store 不删消息卡片不会消失）
    useBookDetailStore.setState((s) => ({
      agentMessages: s.agentMessages.filter((m) => m.type !== 'review-card'),
    }));
    try {
      // 终止生成正文时回传审核卡携带的目标章节（如工作流执行时的 target_chapter_id）
      await agentApi.submitReviewAction(agentThreadId, action, editedContent, chapterId);
      await resume();
    } catch {
      setAgentStreaming(false);
      // 续跑失败（如书籍锁被占用/网络异常）：恢复审核卡与待审状态，允许用户重试。
      // 恢复时必须给卡片换新 id——否则 React 复用同 key 组件实例，ReviewCard 的
      // submitting 状态卡在 true，按钮永久禁用（任务 31 防双提交与此冲突的边界）。
      setPendingReview(prevReview);
      if (removedCards.length > 0) {
        const _now = Date.now();
        useBookDetailStore.setState((s) => ({
          agentMessages: [
            ...s.agentMessages,
            ...removedCards.map((c, i) => ({ ...c, id: `${c.id || 'rc'}-${_now}-${i}` })),
          ],
        }));
      }
    }
  };

  const handleUnlockAndRetry = async (retryMessage: string) => {
    setAgentStatus({ kind: 'working', label: '解除书籍占用中…' });
    const ok = await agentApi.releaseBookLock(bookId);
    if (ok) {
      addAgentMessage({ role: 'assistant', content: '书籍任务锁已解除，正在重试您的指令…', type: 'system' });
      void sendMessage(retryMessage);
    } else {
      addAgentMessage({ role: 'assistant', content: '解除占用失败，请稍后重试。', type: 'error' });
    }
  };

  const filteredSessions = sessions.filter((s) =>
    !sessionSearch.trim() || (s.title || '').toLowerCase().includes(sessionSearch.toLowerCase())
  );

  const placeholderText = book ? '输入创作指令…' : '输入消息…';

  const renderAgentMessage = (msg: (typeof agentMessages)[number], key: number) => {
    // 稳定 key（任务 22）：消息插入时生成的 id 优先，历史映射消息回退 index
    const stableKey = msg.id || `i-${key}`;
    if (msg.type === 'review-card' && msg.token) {      const reviewData = safeParseJSON(msg.token);
      return reviewData ? (
        <ReviewCard key={stableKey} data={reviewData as Record<string, unknown>} onAction={handleReviewAction} />
      ) : null;
    }
    if (msg.type === 'propose-cards' && msg.token) {
      const cardData = safeParseJSON(msg.token);
      return cardData ? <ProposeCards key={stableKey} data={cardData as Record<string, unknown>} onSendMessage={sendMessage} /> : null;
    }
    if (msg.type === 'node-output') {
      return (
        <div key={stableKey} className="flex justify-start">
          <div className="max-w-[88%] px-3 py-2 border-l-2 border-foreground/15 bg-[#1c1b1a]/[0.02] text-[13px] leading-relaxed">
            {msg.label && (
              <div className="text-[10px] text-foreground/40 mb-0.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-foreground/25 inline-block" />
                {msg.label} · 节点输出
              </div>
            )}
            {msg.content ? (
              <MarkdownContent>{msg.content}</MarkdownContent>
            ) : (
              <span className="text-foreground/30 text-[12px]">节点执行中，正文实时生成…</span>
            )}
          </div>
        </div>
      );
    }
    if (msg.type === 'tool') {
      // 工具卡片作为独立消息：running 显示「请求外援中」，done 显示「外援已找到 ✓」，
      // error（abort 复位）显示「已中断」。位置由插入时刻决定（工具在回复前开始 →
      // 卡片在回复前），不随流式消息跳动。
      const running = msg.toolStatus === 'running';
      const failed = msg.toolStatus === 'error';
      return (
        <div key={stableKey} className="flex justify-start">
          <div className="mx-1 mb-1 flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-1.5 text-[11px]">
            {running ? (
              <>
                <span className="thinking-shimmer-text">{msg.tool === 'execute_workflow' || msg.tool === 'execute_workflow_node' ? '执行工作流中' : '请求外援中'}</span>
                <span className="ml-auto inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground/70" />
              </>
            ) : failed ? (
              <>
                <span className="text-foreground/50">{msg.tool === 'execute_workflow' || msg.tool === 'execute_workflow_node' ? '工作流已中断' : '已中断'}</span>
                <span className="ml-auto text-foreground/45">✗</span>
              </>
            ) : (
              <>
                <span className="text-foreground/60">{msg.tool === 'execute_workflow' || msg.tool === 'execute_workflow_node' ? '工作流已启动' : '外援已找到'}</span>
                <span className="ml-auto text-foreground/70">✓</span>
              </>
            )}
          </div>
        </div>
      );
    }
    if (msg.type === 'node') {
      // 节点卡片同样作为独立消息：状态（running/completed/failed）+ 展开时展示 nodeOutputs 正文
      const expanded = expandedNodeCards.has(msg.nodeId || '');
      return (
        <div key={stableKey} className="flex justify-start">
          <div className="w-full rounded-lg border border-border/40 bg-background/40 overflow-hidden">
            <button
              onClick={() => {
                if (!msg.nodeId) return;
                setExpandedNodeCards((prev) => {
                  const next = new Set(prev);
                  if (next.has(msg.nodeId!)) next.delete(msg.nodeId!);
                  else next.add(msg.nodeId!);
                  return next;
                });
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] bg-transparent border-none cursor-pointer hover:bg-muted/40 text-left"
            >
              {msg.nodeStatus === 'running' ? (
                <>
                  <span className="thinking-shimmer-text">{msg.label}</span>
                  <span className="ml-auto inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground/70" />
                </>
              ) : msg.nodeStatus === 'completed' ? (
                <>
                  <span className="text-foreground/70">{msg.label}</span>
                  {msg.tokens !== undefined && (
                    <span className="text-[10px] text-foreground/30 tabular-nums">{msg.tokens}t</span>
                  )}
                  <span className="ml-auto text-foreground/60">✓ 完成</span>
                </>
              ) : (
                <>
                  <span className="text-red-500/70">{msg.label}</span>
                  <span className="ml-auto text-red-500/60">✗ 失败</span>
                </>
              )}
              <ChevronDown size={11} strokeWidth={1.5} className={cn('shrink-0 text-foreground/30 transition-transform', expanded && 'rotate-180')} />
            </button>
            {expanded && (
              <div className="px-3 pb-2 space-y-1">
                {msg.nodeStatus === 'failed' && msg.reason && (
                  <div className="text-[10px] text-red-500/60">失败原因：{msg.reason}</div>
                )}
                {msg.nodeStatus === 'completed' && msg.tokens !== undefined && (
                  <div className="text-[10px] text-foreground/35">输出 {msg.tokens} tokens</div>
                )}
                {msg.nodeId && (msg.content || nodeOutputs[msg.nodeId]) ? (
                  <div className="max-h-64 overflow-y-auto rounded-md border-l-2 border-foreground/15 bg-[#1c1b1a]/[0.02] px-2.5 py-2 text-[12px] leading-relaxed text-foreground/70">
                    <MarkdownContent>{msg.content || nodeOutputs[msg.nodeId]}</MarkdownContent>
                  </div>
                ) : msg.nodeStatus === 'running' ? (
                  <div className="text-[11px] text-foreground/30">节点执行中，正文实时生成…</div>
                ) : (
                  <div className="text-[10px] text-foreground/25">暂无输出</div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }
    if (msg.type === 'streaming') {
      const hasContent = !!msg.content;
      const isThinking = agentStreaming && agentStatus.kind === 'thinking';
      return (
        <div key={stableKey} className="flex justify-start">
          <div className="max-w-[88%] px-3 py-2 border-l-2 border-foreground/10 text-[13px] leading-relaxed">
            {hasContent && <MarkdownContent>{msg.content}</MarkdownContent>}
            {agentStreaming && (
              <div className={cn('flex', hasContent && 'mt-1.5')}>
                {isThinking ? (
                  <span className="thinking-shimmer-text">正在酝酿</span>
                ) : (
                  <span className="inline-flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-foreground/30 animate-pulse" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-foreground/30 animate-pulse" style={{ animationDelay: '200ms' }} />
                    <span className="w-1 h-1 rounded-full bg-foreground/30 animate-pulse" style={{ animationDelay: '400ms' }} />
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }
    if (msg.type === 'error') {
      return (
        <div key={stableKey} className="text-[11px] text-destructive/80 px-3 py-1.5 bg-destructive/[0.04] border border-destructive/10">
          <div>{msg.content}</div>
          {msg.retryMessage && (
            <button
              onClick={() => { void handleUnlockAndRetry(msg.retryMessage!); }}
              className="mt-1.5 text-[11px] px-2 py-0.5 rounded-md border border-destructive/30 text-destructive/90 bg-transparent hover:bg-destructive/10 cursor-pointer transition-colors"
            >
              {msg.content.includes('解除占用') ? '解除占用并重试' : '重试'}
            </button>
          )}
        </div>
      );
    }
    return (
      <div key={stableKey} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        <div className={cn(
          'max-w-[88%] text-[13px] leading-relaxed',
          msg.role === 'user'
            ? 'rounded-2xl bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] text-foreground/85 backdrop-blur-sm px-3.5 py-1.5'
            : 'px-3 py-2 border-l-2 border-foreground/10 agent-markdown',
        )}>
          {msg.role === 'user' ? msg.content : <MarkdownContent>{msg.content}</MarkdownContent>}
        </div>
      </div>
    );
  };

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
          <div className="ide-agent-body">
            {agentMessages.length === 0 && (
              <div className="flex flex-col items-center gap-4 mt-12 px-4">
                <div className="text-xs text-muted-foreground text-center">
                  {book ? `正在创作《${book.title}》` : '输入消息开始对话'}
                </div>
                {book && (
                  <>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => {
                            if (s === '分析创作状态并提议卡片') {
                              void sendMessage('请分析当前书籍的创作状态，判断当前处于哪个创作阶段（initializing/worldbuilding/outlining/drafting/revising），并提议需要创建的卡片类型（world_setup/plot_direction/character_intro/location_card/foreshadow_card/char_dialogue）。输出JSON格式：{"phase":"...","proposals":[{"type":"...","reason":"..."}]}');
                            } else {
                              setInput(s);
                              inputRef.current?.focus();
                            }
                          }}
                          className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      <button onClick={() => void sendMessage('请调用 search 工具（mode="web"）联网搜索，获取最新外部信息。')} className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer transition-colors">联网搜索</button>
                      <button onClick={() => void sendMessage('请调用 search 工具（mode="docs"）在公开文档库中做语义检索，寻找相关资料。')} className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer transition-colors">检索知识库</button>
                      <button onClick={() => void sendMessage('请调用 manage_memory 工具（mode="save"）保存本次创作中值得沉淀的偏好/设定要点作为长期记忆。')} className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer transition-colors">保存记忆</button>
                      <button onClick={() => void sendMessage('请调用 manage_memory 工具（mode="recall"）调取与本作品相关的长期记忆。')} className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer transition-colors">调取记忆</button>
                      <button onClick={() => void sendMessage('请调用 update_entity 工具（kind="timeline"）更新时间线事件。')} className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer transition-colors">更新时间线</button>
                    </div>
                  </>
                )}
              </div>
            )}

            {agentMessages
              .filter((m) => {
                // 工具卡片/节点卡片是独立消息（顺序由插入时刻决定），正常渲染；
                // 旧 node-output 消息已迁移到节点卡片内部，过滤掉避免重复。
                // streaming 消息也按数组原位渲染（不再单独沉底），避免流式结束后
                // 消息从底部「跳回」原位造成卡片/文字上下跳动。
                if (m.type === 'node-output') return false;
                return true;
              })
              .map((msg, idx) => renderAgentMessage(msg, idx))}
            <div ref={messagesEndRef} />
            {/* 工具卡片/节点卡片已作为独立消息渲染在消息流中（顺序由插入时刻决定） */}
            {agentStatus.kind === 'working' && agentStatus.label && !agentMessages.some((m) => m.type === 'node') && (
              <div className="px-3 py-1.5 text-[11px]">
                <span className="thinking-shimmer-text">{agentStatus.label}</span>
              </div>
            )}
            {agentStatus.kind === 'error' && (
              <div className="px-3 py-1.5 text-[11px] text-destructive/80 border-t border-border/30 bg-destructive/[0.04]">
                {agentStatus.message}
              </div>
            )}
          </div>

          <div className="ide-agent-input-row">
            {showWorkflowSuggestions && (
              <div className="mb-1 mx-1 rounded-lg border border-border/60 bg-background overflow-hidden">
                <div className="px-3 py-1.5 text-[10px] text-muted-foreground/60 font-medium">我的工作流</div>
                {workflowList.map((wf) => (
                  <button
                    key={wf.id}
                    onClick={() => handleWorkflowSelect(wf)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left bg-transparent border-none cursor-pointer hover:bg-muted/50 text-xs"
                  >
                    <span className="text-[#1c1b1a]/60 truncate">{wf.name}</span>
                    <span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">
                      {wf.nodes?.length ?? 0}角色
                    </span>
                  </button>
                ))}
                <Link href="/workflow" className="block px-3 py-1.5 text-[10px] text-muted-foreground/40 no-underline hover:bg-muted/50 border-t border-border/30">
                  管理工作流 →
                </Link>
              </div>
            )}
            <div className="relative flex-1">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  const el = e.target;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
                placeholder={placeholderText}
                disabled={false}
                rows={1}
                className={cn(
                  'w-full pl-3.5 pr-9 py-2.5 bg-muted/50 border focus:bg-background focus:outline-none transition-all text-[13px] placeholder:text-muted-foreground/50 disabled:opacity-50 resize-none min-h-[40px]',
                  agentStreaming
                    ? 'border-solid border-transparent [border-image:linear-gradient(135deg,color-mix(in_srgb,var(--foreground)_16%,transparent),color-mix(in_srgb,var(--foreground)_4%,transparent),color-mix(in_srgb,var(--foreground)_10%,transparent))_1] shadow-[0_0_12px_2px_color-mix(in_srgb,var(--foreground)_3%,transparent)]'
                    : 'border-border/50 focus:border-foreground/20',
                )}
              />
              {agentStreaming ? (
                <button onClick={handleAbort} className="absolute right-1.5 bottom-1.5 w-6 h-6 flex items-center justify-center bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] text-foreground/60 hover:text-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_14%,transparent)] border-none cursor-pointer rounded-full transition-all">
                  <CircleStop size={15} strokeWidth={1.8} />
                </button>
              ) : (
                <button onClick={() => { void handleSend(); }} disabled={!input.trim()}
                  className={cn(
                    'absolute right-1.5 bottom-1.5 w-6 h-6 flex items-center justify-center border-none cursor-pointer transition-all',
                    input.trim()
                      ? 'text-foreground/60 hover:text-foreground'
                      : 'text-muted-foreground/30 cursor-default',
                  )}>
                  <ArrowUp size={15} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </div>

        {sessionsExpanded && (
          <div className="ide-agent-sessions">
            <div className="ide-agent-sessions-header">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">会话</span>
                <button onClick={() => { void fetchSessions(); }} className="agent-icon-btn" title="刷新">
                  <RefreshCw size={12} strokeWidth={1.8} />
                </button>
              </div>
              <button onClick={() => setSessionsExpanded(false)} className="agent-icon-btn" title="收起会话列表">
                <PanelRightClose size={12} strokeWidth={1.8} />
              </button>
            </div>
            <div className="px-2 pb-1">
              <div className="relative">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/30" />
                <input
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                  placeholder="搜索会话..."
                  className="w-full h-7 pl-6 pr-2 rounded-md text-[11px] bg-muted/50 border border-border/30 focus:outline-none focus:border-foreground/20"
                />
              </div>
            </div>
            <div className="ide-agent-sessions-list">
              {loadingSessions ? (
                <div className="text-[11px] text-muted-foreground text-center py-4">加载中...</div>
              ) : filteredSessions.length === 0 ? (
                <div className="text-[11px] text-muted-foreground text-center py-4">暂无会话记录</div>
              ) : (
                filteredSessions.map((s) => {
                  const isActive = s.threadId === agentThreadId;
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleSelectSession(s)}
                      className={cn(
                        'agent-session-item group',
                        isActive && 'is-active',
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-foreground truncate">{s.title || '未命名会话'}</div>
                        <div className="text-[10px] text-muted-foreground truncate mt-0.5 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 flex-shrink-0" />
                          <span>{relativeTime(s.updatedAt)}</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteSession(s); }}
                        className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground/30 hover:text-red-500/60 opacity-0 group-hover:opacity-100 transition-all bg-transparent border-none cursor-pointer flex-shrink-0"
                        title="删除会话"
                      >
                        <Trash2 size={11} strokeWidth={1.5} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {showMemoryManager && (
        <AgentMemoryManager bookId={bookId} onClose={() => setShowMemoryManager(false)} />
      )}
    </div>
  );
}

function safeParseJSON(str: string): unknown {
  try { return JSON.parse(str); } catch { return null; }
}
