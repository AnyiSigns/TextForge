'use client';

/**
 * Agent 面板：手动压缩上下文（从 AgentPanel.tsx 抽离）。
 * 调用后端压缩接口并流式展示裁剪统计。
 */
import { useCallback } from 'react';
import { useBookDetailStore } from '../store';
import * as agentApi from '@/shared/api/agent';

interface UseManualCompressOptions {
  agentThreadId: string | null;
  agentStreaming: boolean;
}

export function useManualCompress({ agentThreadId, agentStreaming }: UseManualCompressOptions) {
  const addAgentMessage = useBookDetailStore((s) => s.addAgentMessage);
  const setAgentStreaming = useBookDetailStore((s) => s.setAgentStreaming);
  const setAgentStatus = useBookDetailStore((s) => s.setAgentStatus);
  const updateAgentStreamToken = useBookDetailStore((s) => s.updateAgentStreamToken);

  const handleManualCompress = useCallback(async () => {
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
          // N12：展示压缩裁剪统计（removed_count/remaining_count）
          const done = event as { removed_count?: number; remaining_count?: number };
          const hasCounts = typeof done.removed_count === 'number' && typeof done.remaining_count === 'number';
          const summary = hasCounts
            ? `上下文压缩完成（移除 ${done.removed_count} 条，保留 ${done.remaining_count} 条）：\n\n${buffer}`
            : `上下文压缩完成：\n\n${buffer}`;
          useBookDetailStore.setState((state) => ({
            agentMessages: state.agentMessages.map((m) =>
              m.type === 'streaming'
                ? { ...m, type: 'system' as const, content: summary }
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
  }, [agentThreadId, agentStreaming, addAgentMessage, setAgentStreaming, setAgentStatus, updateAgentStreamToken]);

  return { handleManualCompress };
}
