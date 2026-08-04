'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, CircleStop, Plus, Shrink, BookOpen, PanelRightOpen, PanelRightClose, RefreshCw } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useBookDetailStore } from '../store';
import * as agentApi from '@/shared/api/agent';
import type { SSEEvent, AgentConversation } from '@/shared/api/types';
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
        code: ({ children: c, className: cls }: any) => {
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

interface AgentPanelProps {
  panelFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function AgentPanel({ panelFullscreen, onToggleFullscreen }: AgentPanelProps) {
  const [input, setInput] = useState('');
  const [showMemoryManager, setShowMemoryManager] = useState(false);
  const [sessionsExpanded, setSessionsExpanded] = useState(false);
  const [sessions, setSessions] = useState<AgentConversation[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const thinkingStartRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const currentToolRef = useRef<Set<string>>(new Set());
  const replyBufferRef = useRef('');

  function notifyOutlineRefresh() {
    if (currentToolRef.current.size === 0) return;
    const hasOutline = Array.from(currentToolRef.current).some(
      (t) => t.toLowerCase().includes('outline'),
    );
    if (hasOutline) {
      window.dispatchEvent(new CustomEvent('textforge:refresh-outlines'));
    }
  }

  const bookId = useBookDetailStore((s) => s.bookId);
  const book = useBookDetailStore((s) => s.book);
  const agentMessages = useBookDetailStore((s) => s.agentMessages);
  const agentStreaming = useBookDetailStore((s) => s.agentStreaming);
  const agentStatus = useBookDetailStore((s) => s.agentStatus);
  const agentThreadId = useBookDetailStore((s) => s.agentThreadId);
  const pendingReview = useBookDetailStore((s) => s.pendingReview);
  const addAgentMessage = useBookDetailStore((s) => s.addAgentMessage);
  const updateAgentStreamToken = useBookDetailStore((s) => s.updateAgentStreamToken);
  const setAgentStreaming = useBookDetailStore((s) => s.setAgentStreaming);
  const setAgentStatus = useBookDetailStore((s) => s.setAgentStatus);
  const setAgentThreadId = useBookDetailStore((s) => s.setAgentThreadId);
  const setPendingReview = useBookDetailStore((s) => s.setPendingReview);
  const setCreativePhase = useBookDetailStore((s) => s.setCreativePhase);

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const list = await agentApi.fetchAgentConversations();
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setSessions(list);
    } catch { /* ignore */ }
    finally { setLoadingSessions(false); }
  }, []);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions, bookId]);

  const nearBottomRef = useRef(true);

  useEffect(() => {
    const el = messagesEndRef.current?.parentElement;
    if (!el) return;
    const onScroll = () => {
      nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!nearBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentMessages, agentStatus]);

  const handleSSEEvent = useCallback(
    (event: SSEEvent) => {
      switch (event.type) {
        case 'think_start':
          thinkingStartRef.current = Date.now();
          setAgentStatus({ kind: 'thinking' });
          break;
        case 'token':
          replyBufferRef.current += event.token || '';
          updateAgentStreamToken(replyBufferRef.current);
          break;
        case 'agent_think_end':
          setAgentStatus({ kind: 'idle' });
          thinkingStartRef.current = 0;
          break;
        case 'tool_start':
          setAgentStatus({ kind: 'working', label: '使用工具中...' });
          currentToolRef.current.add(event.tool || '');
          break;
        case 'tool_end':
          setAgentStatus({ kind: 'idle' });
          break;
        case 'node_start':
          setAgentStatus({ kind: 'working', label: '执行节点中...' });
          break;
        case 'node_end':
          setAgentStatus({ kind: 'idle' });
          break;
        case 'progress':
          setAgentStatus({ kind: 'working', label: '生成章节中...' });
          break;
        case 'propose_cards':
          setPendingReview(null);
          setAgentStatus({ kind: 'working', label: '提议卡片中...' });
          addAgentMessage({ role: 'assistant', content: '', type: 'propose-cards', token: JSON.stringify({ card_types: event.card_types, reason: event.reason, cards: event.cards }) });
          if (event.card_types?.includes('world_setup') || event.card_types?.includes('character_intro')) {
            setCreativePhase('worldbuilding');
          } else if (event.card_types?.includes('plot_direction')) {
            setCreativePhase('outlining');
          }
          break;
        case 'review_card':
          setAgentStatus({ kind: 'working', label: '等待审核...' });
          setPendingReview(event as unknown as Record<string, unknown>);
          addAgentMessage({ role: 'assistant', content: '', type: 'review-card', token: JSON.stringify(event) });
          break;
        case 'suggestions':
          break;
      }
    },
    [addAgentMessage, updateAgentStreamToken, setPendingReview, setAgentStatus, setCreativePhase],
  );

  const sendMessage = useCallback(async (msg: string) => {
    if (!msg.trim() || agentStreaming) return;

    addAgentMessage({ role: 'user', content: msg });
    nearBottomRef.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

    let threadId = agentThreadId;
    if (!threadId) {
      try {
        const session = await agentApi.startAgentSession(bookId || undefined);
        threadId = session.thread_id;
        setAgentThreadId(threadId);
      } catch {
        addAgentMessage({ role: 'assistant', content: '启动 Agent 会话失败，请重试。', type: 'error' });
        return;
      }
    }

    setAgentStreaming(true);
    const abort = new AbortController();
    abortRef.current = abort;
    replyBufferRef.current = '';

    addAgentMessage({ role: 'assistant', content: '', type: 'streaming' });
    currentToolRef.current.clear();

    try {
      await agentApi.streamAgent(
        threadId,
        msg,
        (event: SSEEvent) => handleSSEEvent(event),
        (reply) => {
          if (reply) {
            replyBufferRef.current = reply;
            updateAgentStreamToken(reply);
          }
          setAgentStreaming(false);
          setAgentStatus({ kind: 'idle' });
          notifyOutlineRefresh();
        },
        (err) => {
          addAgentMessage({ role: 'assistant', content: err, type: 'error' });
          setAgentStreaming(false);
          setAgentStatus({ kind: 'error', message: err });
        },
        abort.signal,
      );
    } catch {
      setAgentStreaming(false);
    }
  }, [agentStreaming, book, agentThreadId, bookId, addAgentMessage, setAgentStreaming, setAgentThreadId, handleSSEEvent]);

  const handleSend = useCallback(() => {
    const msg = input.trim();
    if (!msg) return;
    setInput('');
    void sendMessage(msg);
  }, [input, sendMessage]);

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
    abortRef.current?.abort();
    setAgentStreaming(false);
    setAgentStatus({ kind: 'idle' });
  };

  const handleNewSession = () => {
    setAgentThreadId(null);
    useBookDetailStore.setState({ agentMessages: [] });
    setAgentStreaming(false);
    setAgentStatus({ kind: 'idle' });
  };

  const handleManualCompress = async () => {
    if (!agentThreadId) return;
    try {
      const res = await agentApi.compressAgentContext(agentThreadId);
      if (res.summary) {
        addAgentMessage({ role: 'assistant', content: `上下文压缩完成：\n\n${res.summary}`, type: 'system' });
      }
    } catch {
      addAgentMessage({ role: 'assistant', content: '上下文压缩失败', type: 'error' });
    }
  };

  const handleReviewAction = async (action: 'accept' | 'retry' | 'edit', editedContent?: string) => {
    if (!agentThreadId) return;
    setPendingReview(null);
    try {
      await agentApi.submitReviewAction(agentThreadId, action, editedContent);
      setAgentStreaming(true);
      const abort = new AbortController();
      abortRef.current = abort;
      addAgentMessage({ role: 'assistant', content: '', type: 'streaming' });
      currentToolRef.current.clear();
      await agentApi.resumeAgent(
        agentThreadId,
        (event) => handleSSEEvent(event),
        () => {
          setAgentStreaming(false);
          notifyOutlineRefresh();
        },
        (err) => { addAgentMessage({ role: 'assistant', content: err, type: 'error' }); setAgentStreaming(false); },
        abort.signal,
      );
    } catch {
      setAgentStreaming(false);
    }
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
          <button onClick={handleManualCompress} className="agent-icon-btn" title="压缩上下文" disabled={!agentThreadId}>
            <Shrink size={12} strokeWidth={1.8} />
          </button>
          {!sessionsExpanded && (
            <>
              {bookId > 0 && (
                <button onClick={() => setShowMemoryManager(true)} className="agent-icon-btn" title="记忆">
                  <BookOpen size={12} strokeWidth={1.8} />
                </button>
              )}
              <button onClick={() => setSessionsExpanded(true)} className="agent-icon-btn" title="展开会话列表">
                <PanelRightOpen size={12} strokeWidth={1.8} />
              </button>
            </>
          )}
          <button
            onClick={onToggleFullscreen}
            className="agent-icon-btn"
            title={panelFullscreen ? '还原' : '全屏'}
          >
            <span className={cn(
              'block w-3 h-3 relative',
              panelFullscreen && 'text-foreground',
            )}>
              <span className={cn(
                'absolute top-0 left-0 w-1 h-1 border-l border-t',
                panelFullscreen ? 'border-foreground/60' : 'border-foreground/40',
              )} />
              <span className={cn(
                'absolute top-0 right-0 w-1 h-1 border-r border-t',
                panelFullscreen ? 'border-foreground/60' : 'border-foreground/40',
              )} />
              <span className={cn(
                'absolute bottom-0 left-0 w-1 h-1 border-l border-b',
                panelFullscreen ? 'border-foreground/60' : 'border-foreground/40',
              )} />
              <span className={cn(
                'absolute bottom-0 right-0 w-1 h-1 border-r border-b',
                panelFullscreen ? 'border-foreground/60' : 'border-foreground/40',
              )} />
            </span>
          </button>
        </div>
      </div>

      <div className="ide-agent-main">
        <div className="ide-agent-chat">
          <div className="ide-agent-body">
            {agentMessages.length === 0 && (
              <div className="flex flex-col items-center gap-4 mt-12 px-4">
                <div className="text-xs text-muted-foreground text-center">
                  {book ? `正在创作《${book.title}》` : '输入消息开始对话'}
                </div>
                {book && (
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
                )}
              </div>
            )}

            {agentMessages.map((msg, i) => {
              if (msg.type === 'review-card' && msg.token) {
                const reviewData = safeParseJSON(msg.token);
                return reviewData ? (
                  <ReviewCard key={i} data={reviewData as Record<string, unknown>} onAction={handleReviewAction} />
                ) : null;
              }
              if (msg.type === 'propose-cards' && msg.token) {
                const cardData = safeParseJSON(msg.token);
                return cardData ? (
                  <ProposeCards key={i} data={cardData as Record<string, unknown>} />
                ) : null;
              }
              if (msg.type === 'streaming') {
                const isLastStreaming = i === agentMessages.length - 1;
                return (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[88%] px-3 py-2 bg-transparent text-[13px] leading-relaxed">
                      {msg.content ? (
                        <MarkdownContent>{msg.content}</MarkdownContent>
                      ) : isLastStreaming && agentStreaming && agentStatus.kind !== 'thinking' ? (
                        <span className="inline-flex gap-0.5">
                          <span className="w-1 h-1 rounded-full bg-foreground/30 animate-pulse" style={{ animationDelay: '0ms' }} />
                          <span className="w-1 h-1 rounded-full bg-foreground/30 animate-pulse" style={{ animationDelay: '200ms' }} />
                          <span className="w-1 h-1 rounded-full bg-foreground/30 animate-pulse" style={{ animationDelay: '400ms' }} />
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              }
              if (msg.type === 'error') {
                return (
                  <div key={i} className="text-[11px] text-destructive/80 px-3 py-1.5 bg-destructive/[0.04] border border-destructive/10">{msg.content}</div>
                );
              }
              return (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={cn(
                    'max-w-[88%] text-[13px] leading-relaxed',
                    msg.role === 'user'
                      ? 'rounded-2xl bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] text-foreground/85 backdrop-blur-sm px-3.5 py-1.5'
                      : 'px-3 py-2 bg-transparent agent-markdown',
                  )}>
                    {msg.role === 'user' ? msg.content : <MarkdownContent>{msg.content}</MarkdownContent>}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
            {(agentStatus.kind === 'thinking' || agentStatus.kind === 'working') && (
              <div className="px-3 py-1.5 text-[11px]">
                <span className="thinking-shimmer-text">
                  {agentStatus.kind === 'thinking' ? '正在酝酿' : agentStatus.label}
                </span>
              </div>
            )}
            {agentStatus.kind === 'error' && (
              <div className="px-3 py-1.5 text-[11px] text-destructive/80 border-t border-border/30 bg-destructive/[0.04]">
                {agentStatus.message}
              </div>
            )}
          </div>

          <div className="ide-agent-input-row">
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
                placeholder={book ? '输入创作指令…' : '输入消息…'}
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
            <div className="ide-agent-sessions-list">
              {loadingSessions ? (
                <div className="text-[11px] text-muted-foreground text-center py-4">加载中...</div>
              ) : sessions.length === 0 ? (
                <div className="text-[11px] text-muted-foreground text-center py-4">暂无会话记录</div>
              ) : (
                sessions.map((s) => (
                  <div key={s.id} className="agent-session-item">
                    <div className="text-[12px] font-medium text-foreground truncate">{s.title || '未命名会话'}</div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">{s.threadId}</div>
                  </div>
                ))
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
