'use client';

import { useEffect, useRef } from 'react';
import { useBookDetailStore } from '@/app/(dashboard)/books/[id]/store';
import { useAgentSession } from './useAgentSession';

/**
 * 共享的 Agent 发送薄编排层：代理 useAgentSession 的发送/中止/续跑，
 * 仅保留会话消息滚动行为（流式 auto 贴底、结束后 smooth）。
 * AgentPanel 与手稿页 AgentDock 共用，返回契约与原实现一致。
 */
export function useAgentSender(bookIdOverride?: number) {
  const nearBottomRef = useRef(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { sendMessage, abort, resume } = useAgentSession({ bookIdOverride, nearBottomRef, messagesEndRef });
  const agentMessages = useBookDetailStore((s) => s.agentMessages);
  const agentStatus = useBookDetailStore((s) => s.agentStatus);
  const agentStreaming = useBookDetailStore((s) => s.agentStreaming);

  // 会话滚动边界感知：距底部 <80px 视为贴底（自动跟随）
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
    // 流式期间用 auto（即时贴底）避免每次 token 触发 smooth 动画造成「跳屏」抖动；
    // 结束后的状态变化仍用 smooth 平滑滚动。
    messagesEndRef.current?.scrollIntoView({ behavior: agentStreaming ? 'auto' : 'smooth' });
  }, [agentMessages, agentStatus, agentStreaming]);

  return { sendMessage, abort, resume, messagesEndRef };
}
