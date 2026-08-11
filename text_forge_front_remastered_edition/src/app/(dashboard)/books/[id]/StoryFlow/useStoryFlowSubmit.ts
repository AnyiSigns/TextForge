'use client';

/**
 * 剧情流「提交到工作流」逻辑：摘要生成 + Agent SSE 流式执行 + 节点状态展示。
 * 从原 StoryFlow.tsx 抽离，收敛 handleSubmitToWorkflow / 提交态机 / node_token rAF 缓冲。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getModelConfigData, startAgentSession, streamAgent } from '@/shared/api/agent';
import { useStoryFlowStore } from '@/features/map/stores/storyFlowStore';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useBookDetailStore } from '../store';

export type SubmitState =
  | 'idle'
  | 'summarizing'
  | 'streaming'
  | 'success'
  | 'error'
  | 'lock-conflict'
  | 'review-needed';

export interface AgentNodeStatus {
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tokens?: number;
  reason?: string;
  output?: string;
}

/**
 * 提交到工作流的完整状态机与 SSE 编排。返回提交态 + 各回调，
 * 组件层仅负责渲染（AgentSubmitView）与入口（确认结束/重试）。
 */
export function useStoryFlowSubmit() {
  const bookId = useBookDetailStore((s) => s.bookId);
  const setAgentOpen = useBookDetailStore((s) => s.setAgentOpen);
  const close = useStoryFlowStore((s) => s.close);
  const finishFlow = useStoryFlowStore((s) => s.finishFlow);
  const triggerChapterId = useStoryFlowStore((s) => s.triggerChapterId);
  const chapters = useEntityStore((s) => s.chapters);

  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [agentReply, setAgentReply] = useState('');
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, AgentNodeStatus>>({});
  const [reviewData, setReviewData] = useState<{ nodeLabel?: string; reason?: string } | null>(null);
  const [agentThreadId, setAgentThreadId] = useState<string | null>(null);
  const agentAbortRef = useRef<AbortController | null>(null);

  // node_stream token 缓冲：用 rAF 合并刷新，避免每个 token 触发整组件重渲染
  const nodeBufferRef = useRef<Record<string, string>>({});
  const nodeRafRef = useRef<number | null>(null);

  const flushNodeBuffer = useCallback(() => {
    nodeRafRef.current = null;
    const buf = nodeBufferRef.current;
    nodeBufferRef.current = {};
    setNodeStatuses((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(buf)) {
        const cur = next[id] ?? { label: id, status: 'running' as const, output: '' };
        next[id] = { ...cur, status: 'running', output: (cur.output || '') + buf[id] };
      }
      return next;
    });
  }, []);

  const pushNodeToken = useCallback(
    (nodeId: string, token: string) => {
      nodeBufferRef.current[nodeId] = (nodeBufferRef.current[nodeId] ?? '') + token;
      if (nodeRafRef.current === null) {
        nodeRafRef.current = requestAnimationFrame(flushNodeBuffer);
      }
    },
    [flushNodeBuffer],
  );

  useEffect(() => () => {
    if (nodeRafRef.current !== null) cancelAnimationFrame(nodeRafRef.current);
  }, []);

  const triggerChapter = triggerChapterId
    ? chapters.find((c) => c.id === triggerChapterId)
    : null;

  const handleSubmitToWorkflow = useCallback(async () => {
    if (submitState === 'summarizing' || submitState === 'streaming') return;

    const config = await getModelConfigData();
    if (!config) {
      toast.error('请先在设置页配置模型');
      return;
    }

    setSubmitState('summarizing');
    setReviewData(null);
    setAgentReply('');
    setNodeStatuses({});

    // ① 生成摘要（completeStoryFlow 幂等：已 completed 时直接返回已有 summary）
    let summary = '';
    try {
      summary = await finishFlow();
    } catch {
      summary = '';
    }

    // ② 组装提交消息（摘要为空时用章节上下文兜底）
    const parts: string[] = [];
    if (summary) parts.push(`【本章剧情推演摘要】\n${summary}`);
    if (triggerChapter) {
      const ch = [`【章节上下文】\n章节：${triggerChapter.title}`];
      if (triggerChapter.summary) ch.push(`摘要：${triggerChapter.summary}`);
      parts.push(ch.join('\n'));
    }
    parts.push('请按本书绑定的工作流执行，生成该章正文。');
    const message = parts.join('\n\n');

    // ③ 提交给 agent 并就地展示流式输出
    try {
      const { thread_id } = await startAgentSession(bookId);
      setAgentThreadId(thread_id);
      const controller = new AbortController();
      agentAbortRef.current = controller;
      setSubmitState('streaming');

      await streamAgent(
        thread_id,
        message,
        (event) => {
          switch (event.type) {
            case 'agent_token':
              if (event.token) setAgentReply((prev) => prev + event.token);
              break;
            case 'node_start':
              if (event.node_id) {
                setNodeStatuses((prev) => ({
                  ...prev,
                  [event.node_id!]: {
                    label: event.label || event.node_id!,
                    status: 'running',
                    output: '',
                  },
                }));
              }
              break;
            case 'node_stream':
              if (event.node_id && typeof event.token === 'string') {
                pushNodeToken(event.node_id, event.token);
              }
              break;
            case 'node_end':
              if (event.node_id) {
                flushNodeBuffer();
                setNodeStatuses((prev) => ({
                  ...prev,
                  [event.node_id!]: {
                    ...(prev[event.node_id!] ?? { label: event.node_id! }),
                    status: 'completed',
                    tokens: event.tokens,
                  },
                }));
              }
              break;
            case 'node_fail':
              if (event.node_id) {
                setNodeStatuses((prev) => ({
                  ...prev,
                  [event.node_id!]: {
                    ...(prev[event.node_id!] ?? { label: event.node_id! }),
                    status: 'failed',
                    reason: event.reason,
                  },
                }));
              }
              break;
            case 'review_card':
              setReviewData({ nodeLabel: event.label || event.node_id, reason: event.reason });
              setSubmitState('review-needed');
              break;
            case 'error':
              toast.error(event.message || 'Agent 执行失败');
              setSubmitState('error');
              break;
            case 'end':
              setSubmitState('success');
              break;
            default:
              break;
          }
        },
        () => setSubmitState('success'),
        () => setSubmitState('error'),
        controller.signal,
        bookId,
      );
    } catch (err) {
      const statusCode = (err as { status?: number })?.status;
      if (statusCode === 503) {
        // 书籍级分布式锁冲突
        setSubmitState('lock-conflict');
      } else if ((err as Error)?.name !== 'AbortError') {
        setSubmitState('error');
      }
    }
  }, [bookId, finishFlow, triggerChapter, submitState, pushNodeToken, flushNodeBuffer]);

  /** 中止当前提交流（供关闭面板 / 前往 Agent 面板时调用）。 */
  const abortActive = useCallback(() => {
    agentAbortRef.current?.abort();
  }, []);

  const goToAgentPanel = useCallback(() => {
    abortActive();
    close();
    setAgentOpen(true);
  }, [abortActive, close, setAgentOpen]);

  return {
    submitState,
    agentReply,
    nodeStatuses,
    reviewData,
    agentThreadId,
    handleSubmitToWorkflow,
    goToAgentPanel,
    abortActive,
  };
}
