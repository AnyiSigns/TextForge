'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useBookDetailStore } from '@/app/(dashboard)/books/[id]/store';

/**
 * Agent SSE token / node_stream 的 rAF 节流器。
 *
 * token 流攒批一帧内多次 token 再写一次 store，避免每 token 全量
 * set store 导致长消息列表 O(n²) 重渲；N9：node_stream 输出同样 rAF 批处理。
 * replyRef 记录已提交的流式回复正文（end.reply 比对基准）。
 */
export function useStreamBuffer() {
  const updateAgentStreamToken = useBookDetailStore((s) => s.updateAgentStreamToken);
  const setNodeOutput = useBookDetailStore((s) => s.setNodeOutput);

  /** 已提交回复正文（end.reply 与该值比对，相同则跳过冗余写入） */
  const replyRef = useRef('');
  /** 攒批中的未提交 token */
  const pendingTokenRef = useRef('');
  const rafHandleRef = useRef<number | null>(null);
  /** nodeId → 攒批中的未提交输出（追加语义） */
  const nodeOutputBufferRef = useRef<Record<string, string>>({});
  const nodeRafRef = useRef<number | null>(null);

  const flushNodeOutputs = useCallback(() => {
    if (nodeRafRef.current !== null) {
      cancelAnimationFrame(nodeRafRef.current);
      nodeRafRef.current = null;
    }
    const buf = nodeOutputBufferRef.current;
    if (Object.keys(buf).length === 0) return;
    nodeOutputBufferRef.current = {};
    for (const [nodeId, token] of Object.entries(buf)) {
      setNodeOutput(nodeId, token);
    }
  }, [setNodeOutput]);

  const scheduleNodeOutput = useCallback(
    (nodeId: string, token: string) => {
      nodeOutputBufferRef.current[nodeId] = (nodeOutputBufferRef.current[nodeId] || '') + token;
      if (nodeRafRef.current === null) {
        nodeRafRef.current = requestAnimationFrame(() => {
          nodeRafRef.current = null;
          flushNodeOutputs();
        });
      }
    },
    [flushNodeOutputs],
  );

  const flushTokens = useCallback(() => {
    if (rafHandleRef.current !== null) {
      cancelAnimationFrame(rafHandleRef.current);
      rafHandleRef.current = null;
    }
    if (pendingTokenRef.current) {
      replyRef.current += pendingTokenRef.current;
      pendingTokenRef.current = '';
      updateAgentStreamToken(replyRef.current);
    }
  }, [updateAgentStreamToken]);

  const scheduleToken = useCallback(
    (token: string) => {
      pendingTokenRef.current += token;
      if (rafHandleRef.current === null) {
        rafHandleRef.current = requestAnimationFrame(() => {
          rafHandleRef.current = null;
          if (pendingTokenRef.current) {
            replyRef.current += pendingTokenRef.current;
            pendingTokenRef.current = '';
            updateAgentStreamToken(replyRef.current);
          }
        });
      }
    },
    [updateAgentStreamToken],
  );

  // abort 用：取消 rAF 并清空 token 缓冲与已提交回复（避免 catch 里 flush 追加新消息）
  const discardTokenBuffer = useCallback(() => {
    if (rafHandleRef.current !== null) {
      cancelAnimationFrame(rafHandleRef.current);
      rafHandleRef.current = null;
    }
    pendingTokenRef.current = '';
    replyRef.current = '';
  }, []);

  // 新回合复位：token + node 缓冲一并清空（旧回合残留的未冲刷 token 一并丢弃）
  const resetBuffers = useCallback(() => {
    pendingTokenRef.current = '';
    replyRef.current = '';
    if (rafHandleRef.current !== null) {
      cancelAnimationFrame(rafHandleRef.current);
      rafHandleRef.current = null;
    }
    nodeOutputBufferRef.current = {};
    if (nodeRafRef.current !== null) {
      cancelAnimationFrame(nodeRafRef.current);
      nodeRafRef.current = null;
    }
  }, []);

  // 组件卸载时清理 rAF，避免 setState after unmount 告警
  useEffect(() => {
    return () => {
      if (rafHandleRef.current !== null) cancelAnimationFrame(rafHandleRef.current);
      if (nodeRafRef.current !== null) cancelAnimationFrame(nodeRafRef.current);
    };
  }, []);

  return {
    flushTokens,
    scheduleToken,
    flushNodeOutputs,
    scheduleNodeOutput,
    discardTokenBuffer,
    resetBuffers,
    replyRef,
  };
}
