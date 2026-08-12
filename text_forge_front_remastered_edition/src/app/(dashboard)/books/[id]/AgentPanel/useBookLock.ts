'use client';

/**
 * Agent 面板：书籍占用锁预检 + 强制解除（从 AgentPanel.tsx 抽离）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as agentApi from '@/shared/api/agent';
import { useBookDetailStore } from '../store';

export function useBookLock(bookId: number, enabled: boolean) {
  const [bookLocked, setBookLocked] = useState(false);
  // P1.3：订阅流式态，流式结束（由 true→false）后重查锁，复位被后端已释放的占用横幅。
  // fetchBookLockStatus 只读取状态、不触发任何流状态变更，故不会形成循环。
  const agentStreaming = useBookDetailStore((s) => s.agentStreaming);
  const prevStreamingRef = useRef(false);

  // 面板打开时预检书籍占用锁，占用中展示横幅（可强制解除）
  useEffect(() => {
    let alive = true;
    if (!enabled || !bookId) {
      // setState 放微任务，规避 react-hooks/set-state-in-effect 同步 setState 告警
      queueMicrotask(() => { if (alive) setBookLocked(false); });
      return;
    }
    agentApi.fetchBookLockStatus(bookId)
      .then((st) => { if (alive) setBookLocked(!!st?.locked); })
      .catch(() => { /* 预检失败静默，不影响面板使用 */ });
    return () => { alive = false; };
  }, [enabled, bookId]);

  // 流式结束后重查：后端已在 end 事件后释放锁，但前端不重查会残留占用横幅。
  // 仅在 true→false 的下降沿触发，避免挂载时与上方预检重复请求。
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = agentStreaming;
    if (!enabled || !bookId || !wasStreaming || agentStreaming) return;
    let alive = true;
    agentApi.fetchBookLockStatus(bookId)
      .then((st) => { if (alive) setBookLocked(!!st?.locked); })
      .catch(() => { /* 重查失败静默，横幅保持现状 */ });
    return () => { alive = false; };
  }, [agentStreaming, bookId, enabled]);

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
      useBookDetailStore.getState().addAgentMessage({
        role: 'assistant',
        content: '书籍占用锁已解除。',
        type: 'system',
      });
    } catch { /* 解除失败保持横幅，用户可重试 */ }
  }, [bookId]);

  return { bookLocked, handleForceReleaseLock };
}
