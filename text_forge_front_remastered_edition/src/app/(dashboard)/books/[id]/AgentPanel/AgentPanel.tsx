'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, X, BookOpen, RefreshCw, SlidersHorizontal, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useBookDetailStore } from '../store';
import * as agentApi from '@/shared/api/agent';
import type { SSEEvent, AgentConversation } from '@/shared/api/types';
import { ReviewCard } from './ReviewCard';
import { ProposeCards } from './ProposeCards';
import { AgentMemoryManager } from './AgentMemoryManager';

const SUGGESTIONS = ['构思剧情走向', '设计角色对话', '优化章节大纲', '检查设定矛盾'];

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const currentToolRef = useRef<Set<string>>(new Set());

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
  const agentThreadId = useBookDetailStore((s) => s.agentThreadId);
  const pendingReview = useBookDetailStore((s) => s.pendingReview);
  const addAgentMessage = useBookDetailStore((s) => s.addAgentMessage);
  const updateAgentStreamToken = useBookDetailStore((s) => s.updateAgentStreamToken);
  const setAgentStreaming = useBookDetailStore((s) => s.setAgentStreaming);
  const setAgentThreadId = useBookDetailStore((s) => s.setAgentThreadId);
  const setPendingReview = useBookDetailStore((s) => s.setPendingReview);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentMessages]);

  const handleSSEEvent = useCallback(
    (event: SSEEvent) => {
      switch (event.type) {
        case 'token':
          updateAgentStreamToken(event.token || '');
          break;
        case 'agent_think':
          break;
        case 'tool_start':
          addAgentMessage({ role: 'assistant', content: '', type: 'tool-start', token: event.tool });
          if (event.tool) currentToolRef.current.add(event.tool);
          break;
        case 'tool_end':
          addAgentMessage({ role: 'assistant', content: '', type: 'tool-end' });
          break;
        case 'node_start':
          addAgentMessage({ role: 'assistant', content: '', type: 'node-start', token: event.label || event.node_id });
          break;
        case 'node_stream':
          updateAgentStreamToken(event.token || '');
          break;
        case 'node_end':
          addAgentMessage({ role: 'assistant', content: '', type: 'node-end' });
          break;
        case 'propose_cards':
          setPendingReview(null);
          addAgentMessage({ role: 'assistant', content: '', type: 'propose-cards', token: JSON.stringify({ card_types: event.card_types, reason: event.reason, cards: event.cards }) });
          break;
        case 'review_card':
          setPendingReview(event as unknown as Record<string, unknown>);
          addAgentMessage({ role: 'assistant', content: '', type: 'review-card', token: JSON.stringify(event) });
          break;
        case 'suggestions':
          break;
      }
    },
    [addAgentMessage, updateAgentStreamToken, setPendingReview],
  );

  const sendMessage = useCallback(async (msg: string) => {
    if (!msg.trim() || agentStreaming || !book) return;

    addAgentMessage({ role: 'user', content: msg });

    let threadId = agentThreadId;
    if (!threadId) {
      try {
        const session = await agentApi.startAgentSession(bookId);
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

    addAgentMessage({ role: 'assistant', content: '', type: 'streaming' });
    currentToolRef.current.clear();

    try {
      await agentApi.streamAgent(
        threadId,
        msg,
        (event: SSEEvent) => handleSSEEvent(event),
        () => {
          setAgentStreaming(false);
          notifyOutlineRefresh();
        },
        (err) => {
          addAgentMessage({ role: 'assistant', content: err, type: 'error' });
          setAgentStreaming(false);
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
          {!sessionsExpanded && (
            <>
              <button onClick={() => { void fetchSessions(); }} className="agent-icon-btn" title="刷新">
                <RefreshCw size={12} strokeWidth={1.8} />
              </button>
              <button className="agent-icon-btn" title="筛选">
                <SlidersHorizontal size={12} strokeWidth={1.8} />
              </button>
              <button onClick={() => setShowMemoryManager(true)} className="agent-icon-btn" title="记忆">
                <BookOpen size={12} strokeWidth={1.8} />
              </button>
              <button onClick={() => setSessionsExpanded(true)} className="agent-icon-btn" title="展开会话列表">
                <PanelRightOpen size={12} strokeWidth={1.8} />
              </button>
            </>
          )}
          <button
            onClick={onToggleFullscreen}
            className="text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer p-1 rounded"
            title={panelFullscreen ? '还原' : '全屏'}
          >
            <span className={cn(
              'block w-3.5 h-3.5 border transition-all',
              panelFullscreen
                ? 'bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)] border-foreground/30 shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_8%,transparent)]'
                : 'border-foreground/40',
            )} />
          </button>
        </div>
      </div>

      <div className="ide-agent-main">
        <div className="ide-agent-chat">
          <div className="ide-agent-body">
            {agentMessages.length === 0 && (
              <div className="flex flex-col items-center gap-4 mt-12 px-4">
                <div className="text-xs text-muted-foreground text-center">
                  {book ? `正在创作《${book.title}》` : '输入创作指令开始对话'}
                </div>
                {book && (
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => { setInput(s); inputRef.current?.focus(); }}
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
              if (msg.type === 'tool-start') {
                return (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 px-1 py-0.5">
                    <span className="w-1 h-1 rounded-full bg-foreground/30" />
                    <span className="truncate">{msg.token || '...'}</span>
                  </div>
                );
              }
              if (msg.type === 'node-start') {
                return (
                  <div key={i} className="px-2 py-1.5 rounded-md bg-muted/60 border border-border/50 text-[11px] font-medium text-foreground/70">
                    执行：{msg.token || '...'}
                  </div>
                );
              }
              if (msg.type === 'streaming') {
                return (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[88%] px-3 py-2 bg-muted/70 text-[13px] leading-relaxed">
                      {msg.content || (
                        <span className="inline-flex gap-0.5">
                          <span className="w-1 h-1 rounded-full bg-foreground/30 animate-pulse" style={{ animationDelay: '0ms' }} />
                          <span className="w-1 h-1 rounded-full bg-foreground/30 animate-pulse" style={{ animationDelay: '200ms' }} />
                          <span className="w-1 h-1 rounded-full bg-foreground/30 animate-pulse" style={{ animationDelay: '400ms' }} />
                        </span>
                      )}
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
                    'max-w-[88%] px-3 py-2 text-[13px] leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-foreground text-background'
                      : 'bg-muted/70',
                  )}>
                    {msg.content}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
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
                placeholder={book ? '输入创作指令…' : '打开书籍开始创作'}
                disabled={!book}
                rows={1}
                className="w-full pl-3.5 pr-9 py-2 bg-muted/50 border border-border/50 focus:bg-background focus:border-foreground/20 focus:outline-none transition-colors text-[13px] placeholder:text-muted-foreground/50 disabled:opacity-50 resize-none"
              />
              {agentStreaming ? (
                <button onClick={handleAbort} className="absolute right-1.5 bottom-1.5 w-6 h-6 flex items-center justify-center bg-destructive/10 text-destructive hover:bg-destructive/20 border-none cursor-pointer transition-colors">
                  <X size={12} strokeWidth={2} />
                </button>
              ) : (
                <button onClick={() => { void handleSend(); }} disabled={!input.trim() || !book}
                  className={cn(
                    'absolute right-1.5 bottom-1.5 w-6 h-6 flex items-center justify-center border-none cursor-pointer transition-all',
                    input.trim() && book
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
                <button className="agent-icon-btn" title="筛选">
                  <SlidersHorizontal size={12} strokeWidth={1.8} />
                </button>
                <button onClick={() => setShowMemoryManager(true)} className="agent-icon-btn" title="记忆">
                  <BookOpen size={12} strokeWidth={1.8} />
                </button>
              </div>
              <button onClick={() => setSessionsExpanded(false)} className="agent-icon-btn" title="取消展示列表">
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

      {showMemoryManager && bookId && (
        <AgentMemoryManager bookId={bookId} onClose={() => setShowMemoryManager(false)} />
      )}
    </div>
  );
}

function safeParseJSON(str: string): unknown {
  try { return JSON.parse(str); } catch { return null; }
}
