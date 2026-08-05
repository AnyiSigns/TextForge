'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useBookDetailStore } from '@/app/(dashboard)/books/[id]/store';
import * as agentApi from '@/shared/api/agent';
import type { SSEEvent } from '@/shared/api/types';

/**
 * 共享的 Agent 发送逻辑：封装 SSE 事件处理、流式渲染、滚动与大纲刷新。
 * AgentPanel 与 manuscript 页的 AgentDock 共用，避免 SSE 逻辑分叉。
 */
export function useAgentSender() {
  const bookId = useBookDetailStore((s) => s.bookId);
  const agentThreadId = useBookDetailStore((s) => s.agentThreadId);
  const agentStreaming = useBookDetailStore((s) => s.agentStreaming);
  const agentMessages = useBookDetailStore((s) => s.agentMessages);
  const agentStatus = useBookDetailStore((s) => s.agentStatus);
  const addAgentMessage = useBookDetailStore((s) => s.addAgentMessage);
  const updateAgentStreamToken = useBookDetailStore((s) => s.updateAgentStreamToken);
  const setAgentStreaming = useBookDetailStore((s) => s.setAgentStreaming);
  const setAgentStatus = useBookDetailStore((s) => s.setAgentStatus);
  const setAgentThreadId = useBookDetailStore((s) => s.setAgentThreadId);
  const setPendingReview = useBookDetailStore((s) => s.setPendingReview);
  const setCreativePhase = useBookDetailStore((s) => s.setCreativePhase);

  const thinkingStartRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const currentToolRef = useRef<Set<string>>(new Set());
  const replyBufferRef = useRef('');
  const nearBottomRef = useRef(true);

  const notifyOutlineRefresh = useCallback(() => {
    if (currentToolRef.current.size === 0) return;
    const hasOutline = Array.from(currentToolRef.current).some((t) => t.toLowerCase().includes('outline'));
    if (hasOutline) window.dispatchEvent(new CustomEvent('textforge:refresh-outlines'));
  }, []);

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
          setAgentStatus({ kind: 'working', label: `正在执行: ${(event as any).label || (event as any).node_id || ''}` });
          break;
        case 'node_stream':
          replyBufferRef.current += event.token || '';
          updateAgentStreamToken(replyBufferRef.current);
          break;
        case 'node_end':
          break;
        case 'node_fail':
          break;
        case 'extend_outline':
          setAgentStatus({ kind: 'working', label: '追加章节大纲中...' });
          break;
        case 'progress':
          setAgentStatus({ kind: 'working', label: '生成章节中...' });
          break;
        case 'propose_cards':
          setPendingReview(null);
          setAgentStatus({ kind: 'working', label: '提议卡片中...' });
          addAgentMessage({
            role: 'assistant',
            content: '',
            type: 'propose-cards',
            token: JSON.stringify({
              card_types: (event as any).card_types,
              reason: (event as any).reason,
              cards: (event as any).cards,
            }),
          });
          if ((event as any).card_types?.includes('world_setup') || (event as any).card_types?.includes('character_intro')) {
            setCreativePhase('worldbuilding');
          } else if ((event as any).card_types?.includes('plot_direction')) {
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

  const sendMessage = useCallback(
    async (msg: string) => {
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
          handleSSEEvent,
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
    },
    [agentStreaming, agentThreadId, bookId, addAgentMessage, setAgentStreaming, setAgentThreadId, handleSSEEvent, setAgentStatus, updateAgentStreamToken, notifyOutlineRefresh],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const resume = useCallback(async () => {
    const threadId = agentThreadId;
    if (!threadId) return;
    setAgentStreaming(true);
    const abort = new AbortController();
    abortRef.current = abort;
    addAgentMessage({ role: 'assistant', content: '', type: 'streaming' });
    currentToolRef.current.clear();
    try {
      await agentApi.resumeAgent(
        threadId,
        handleSSEEvent,
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
  }, [agentThreadId, addAgentMessage, handleSSEEvent, notifyOutlineRefresh, setAgentStreaming]);

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

  return { sendMessage, abort, resume, messagesEndRef };
}
