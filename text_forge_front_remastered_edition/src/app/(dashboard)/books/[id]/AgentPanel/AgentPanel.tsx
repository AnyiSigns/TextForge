'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useBookDetailStore } from '../store';
import * as agentApi from '@/shared/api/agent';
import type { SSEEvent } from '@/shared/api/types';
import { ReviewCard } from './ReviewCard';
import { ProposeCards } from './ProposeCards';

export function AgentPanel() {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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

    try {
      await agentApi.streamAgent(
        threadId,
        msg,
        (event: SSEEvent) => handleSSEEvent(event),
        () => setAgentStreaming(false),
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
      await agentApi.resumeAgent(
        agentThreadId,
        (event) => handleSSEEvent(event),
        () => setAgentStreaming(false),
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
        <span>AI 助手</span>
        <span className="text-[10px] text-foreground/60 flex items-center gap-1">
          <span className={cn('w-1.5 h-1.5 rounded-full', agentStreaming ? 'bg-foreground/60 animate-pulse' : 'bg-foreground/60')} />
          {agentStreaming ? '生成中' : '就绪'}
        </span>
      </div>
      <div className="ide-agent-body">
        {agentMessages.length === 0 && (
          <div className="text-xs text-muted-foreground text-center mt-8">发送消息开始与 AI 助手对话</div>
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
              <div key={i} className="text-[11px] text-muted-foreground px-2 py-0.5 italic">
                调用工具: {msg.token || '...'}
              </div>
            );
          }
          if (msg.type === 'node-start') {
            return (
              <div key={i} className="text-[11px] text-foreground/80 px-2 py-1 bg-muted rounded-md border border-border mb-1">
                执行节点: {msg.token || '...'}
              </div>
            );
          }
          if (msg.type === 'streaming') {
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[85%] p-2.5 rounded-xl bg-background border border-border text-[13px] leading-relaxed">
                  {msg.content || <span className="animate-pulse text-muted-foreground">...</span>}
                </div>
              </div>
            );
          }
          if (msg.type === 'error') {
            return (
              <div key={i} className="text-xs text-destructive px-2 py-1 bg-destructive/5 rounded-md">{msg.content}</div>
            );
          }
          return (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={cn(
                'max-w-[85%] p-2.5 rounded-xl text-[13px] leading-relaxed',
                msg.role === 'user'
                  ? 'bg-muted border border-transparent'
                  : 'bg-background border border-border'
              )}>
                {msg.content}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <div className="ide-agent-input-row">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
          placeholder="输入指令..."
          className="flex-1 h-8 px-3 rounded-md text-xs bg-background border border-border focus:outline-none"
        />
        {agentStreaming ? (
          <button onClick={handleAbort} className="h-8 px-3 rounded-md bg-destructive text-destructive-foreground text-xs font-medium border-none cursor-pointer hover:opacity-90">
            <X size={12} />
          </button>
        ) : (
          <button onClick={() => { void handleSend(); }} className="h-8 px-3 rounded-md bg-foreground text-background text-xs font-medium border-none cursor-pointer hover:opacity-90">
            <Send size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function safeParseJSON(str: string): unknown {
  try { return JSON.parse(str); } catch { return null; }
}
