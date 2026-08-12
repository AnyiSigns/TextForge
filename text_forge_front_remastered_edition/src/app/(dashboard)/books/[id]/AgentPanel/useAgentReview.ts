'use client';

/**
 * Agent 审核 / 重试 / 复制 / 编辑重发的逻辑抽取为 hook。
 * AgentPanel 与 MessageList 共用，避免 800+ 行单组件继续膨胀。
 */
import { useCallback } from 'react';
import { useBookDetailStore } from '../store';
import type { AgentMessage } from '../store';
import * as agentApi from '@/shared/api/agent';

/**
 * 共享的「解除书籍占用并重试」流程（AgentPanel 与 AgentDock 共用，避免重复分叉）。
 * 返回 ok 表示锁已解除，上层据此追加提示消息并重发指令。
 */
export async function performUnlockAndRetry(
  bookId: number,
  retryMessage: string,
  sendMessage: (msg: string) => void,
): Promise<boolean> {
  const ok = await agentApi.releaseBookLock(bookId);
  if (ok) {
    useBookDetailStore.getState().addAgentMessage({
      role: 'assistant',
      content: '书籍任务锁已解除，正在重试您的指令…',
      type: 'system',
    });
    void sendMessage(retryMessage);
  } else {
    useBookDetailStore.getState().addAgentMessage({
      role: 'assistant',
      content: '解除占用失败，请稍后重试。',
      type: 'error',
    });
  }
  return ok;
}

export function useAgentReview(opts: {
  agentThreadId: string | null;
  bookId: number;
  resume: () => Promise<void>;
  sendMessage: (msg: string) => void;
  onSetInput: (text: string) => void;
  onFocusInput: () => void;
}) {
  const { agentThreadId, bookId, resume, sendMessage, onSetInput, onFocusInput } = opts;
  const setPendingReview = useBookDetailStore((s) => s.setPendingReview);
  const setAgentStreaming = useBookDetailStore((s) => s.setAgentStreaming);
  const setAgentStatus = useBookDetailStore((s) => s.setAgentStatus);

  const handleReviewAction = useCallback(async (
    action: 'accept' | 'retry' | 'edit' | 'terminate',
    editedContent?: string,
    chapterId?: number,
  ) => {
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
      // submitting 状态卡在 true，按钮永久禁用（防双提交与此冲突的边界）。
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
  }, [agentThreadId, resume, setPendingReview, setAgentStreaming]);

  const handleUnlockAndRetry = useCallback(async (retryMessage: string) => {
    setAgentStatus({ kind: 'working', label: '解除书籍占用中…' });
    await performUnlockAndRetry(bookId, retryMessage, sendMessage);
  }, [bookId, sendMessage, setAgentStatus]);

  // 消息 hover 菜单——复制 / 编辑重发（重新生成 = 回填后手动发送）
  const handleCopyMessage = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch { /* 剪贴板不可用时静默 */ }
  }, []);

  const handleEditSend = useCallback((msg: AgentMessage) => {
    const text = msg.role === 'user' ? msg.content : '';
    if (!text.trim()) return;
    onSetInput(text);
    onFocusInput();
  }, [onSetInput, onFocusInput]);

  return { handleReviewAction, handleUnlockAndRetry, handleCopyMessage, handleEditSend };
}
