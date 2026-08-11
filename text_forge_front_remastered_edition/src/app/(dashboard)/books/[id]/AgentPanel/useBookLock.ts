'use client';

/**
 * Agent 面板：书籍占用锁预检 + 强制解除（从 AgentPanel.tsx 抽离）。
 */
import { useCallback, useEffect, useState } from 'react';
import * as agentApi from '@/shared/api/agent';
import { useBookDetailStore } from '../store';

export function useBookLock(bookId: number, enabled: boolean) {
  const [bookLocked, setBookLocked] = useState(false);

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
