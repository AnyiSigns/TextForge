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
  const setAgentReasoning = useBookDetailStore((s) => s.setAgentReasoning);
  const upsertNodeStatus = useBookDetailStore((s) => s.upsertNodeStatus);
  const clearNodeStatuses = useBookDetailStore((s) => s.clearNodeStatuses);
  const setNodeOutput = useBookDetailStore((s) => s.setNodeOutput);
  const clearNodeOutputs = useBookDetailStore((s) => s.clearNodeOutputs);
  const commitStreamingMessage = useBookDetailStore((s) => s.commitStreamingMessage);
  const updateToolMessage = useBookDetailStore((s) => s.updateToolMessage);
  const updateNodeMessage = useBookDetailStore((s) => s.updateNodeMessage);
  const setAgentThreadId = useBookDetailStore((s) => s.setAgentThreadId);
  const setPendingReview = useBookDetailStore((s) => s.setPendingReview);
  const setCreativePhase = useBookDetailStore((s) => s.setCreativePhase);

  const thinkingStartRef = useRef(0);
  const reasoningBufferRef = useRef('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const currentToolRef = useRef<Set<string>>(new Set());
  const currentToolNameRef = useRef<string>('');
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
          reasoningBufferRef.current = '';
          setAgentReasoning('');
          setAgentStatus({ kind: 'thinking' });
          break;
        case 'token':
        case 'agent_token': {
          // agent_token 为单通道模式下的正文流式事件（与原 token 事件同语义）
          replyBufferRef.current += event.token || '';
          updateAgentStreamToken(replyBufferRef.current);
          break;
        }
        case 'agent_reasoning':
          // 任务 23：思考内容流式累积进独立气泡（不写入会话历史，只做 UI 展示）
          reasoningBufferRef.current += event.token || '';
          setAgentReasoning(reasoningBufferRef.current);
          setAgentStatus({ kind: 'thinking' });
          break;
        case 'agent_think_end':
          setAgentStatus({ kind: 'idle' });
          thinkingStartRef.current = 0;
          break;
        case 'tool_start': {
          // 工具调用以独立卡片消息插入消息流（顺序天然正确：工具在回复前开始，
          // 卡片就出现在回复之前），不再依赖消息流外单独渲染的状态条。
          const toolName = event.tool || '';
          const toolCallId = event.tool_call_id || '';
          currentToolNameRef.current = toolName;
          // 定型当前流式回复（若有），再插入工具卡片，之后新回复从卡片后继续
          commitStreamingMessage();
          replyBufferRef.current = '';
          addAgentMessage({
            role: 'assistant',
            type: 'tool',
            tool: toolName,
            toolCallId,
            toolStatus: 'running',
            content: '',
          });
          currentToolRef.current.add(toolName);
          break;
        }
        case 'tool_end': {
          // 任务 25：优先用事件里的 tool_call_id 配对；兼容旧后端（不带 id）时
          // 按最近记录的 tool_start 工具名回退。success=false 表示工具失败。
          const toolName = event.tool || currentToolNameRef.current;
          const toolCallId = event.tool_call_id || '';
          currentToolNameRef.current = '';
          updateToolMessage(toolName, 'done', {
            toolCallId: toolCallId || undefined,
            success: (event as { success?: boolean }).success,
          });
          break;
        }
        case 'node_start': {
          const nodeId = event.node_id || event.label || '';
          const label = event.label || nodeId;
          setAgentStatus({ kind: 'working', label: `正在执行: ${label}` });
          upsertNodeStatus({ nodeId, label, status: 'running' });
          // 节点卡片同样作为独立消息插入消息流，紧跟触发它的工具卡片之后
          addAgentMessage({
            role: 'assistant',
            type: 'node',
            nodeId,
            label,
            nodeStatus: 'running',
            content: '',
          });
          break;
        }
        case 'node_stream': {
          // 事件只有 node_id（无 label），按 nodeId 累积到 nodeOutputs（状态卡片展开时在卡片内部展示）
          const nodeId = event.node_id || '';
          setNodeOutput(nodeId, event.token || '');
          break;
        }
        case 'node_end': {
          const nodeId = event.node_id || event.label || '';
          const label = event.label || nodeId;
          upsertNodeStatus({ nodeId, label, status: 'completed', tokens: event.tokens });
          updateNodeMessage(nodeId, { label, nodeStatus: 'completed', tokens: event.tokens });
          // 把流式累积的节点输出固化到节点卡片消息自身（content），
          // 否则新消息开始时 clearNodeOutputs() 会清空 nodeOutputs，卡片展开只剩「暂无输出」。
          const accumulated = useBookDetailStore.getState().nodeOutputs?.[nodeId] || '';
          if (accumulated) {
            updateNodeMessage(nodeId, { content: accumulated });
          }
          break;
        }
        case 'node_fail': {
          // 节点失败必须让用户看到，不能静默
          const nodeId = event.node_id || event.label || '';
          const label = event.label || nodeId;
          const reason = event.reason || '';
          upsertNodeStatus({ nodeId, label, status: 'failed', reason });
          updateNodeMessage(nodeId, { label, nodeStatus: 'failed', reason });
          // 任务 25：失败节点固化已流式内容（node_end 同款处理），
          // 否则新消息开始时 clearNodeOutputs() 清空 nodeOutputs，卡片只剩「暂无输出」。
          const accumulated = useBookDetailStore.getState().nodeOutputs?.[nodeId] || '';
          if (accumulated) {
            updateNodeMessage(nodeId, { content: accumulated });
          }
          addAgentMessage({
            role: 'assistant',
            type: 'error',
            content: `工作流节点失败：${label}${reason ? `（${reason}）` : ''}`,
          });
          setAgentStatus({ kind: 'error', message: `节点 ${label} 执行失败` });
          break;
        }
        case 'extend_outline':
          setAgentStatus({ kind: 'working', label: '追加章节大纲中...' });
          break;
        case 'subgraph_start':
          // supervisor 路由事件（任务 23）：显示「正在进入 xx 阶段」徽标
          setAgentStatus({
            kind: 'working',
            label: event.label ? `正在进入「${event.label}」阶段` : '正在进入创作子图',
          });
          break;
        case 'progress':
          setAgentStatus({
            kind: 'working',
            label: (event as { n?: number; total?: number }).total
              ? `生成章节中 ${event.n ?? 0}/${event.total}...`
              : '生成章节中...',
          });
          break;
        case 'propose_cards':
          setPendingReview(null);
          setAgentStatus({ kind: 'working', label: '提议卡片中...' });
          addAgentMessage({
            role: 'assistant',
            content: '',
            type: 'propose-cards',
            token: JSON.stringify({
              card_types: event.card_types,
              reason: event.reason,
              cards: event.cards,
            }),
          });
          if (event.card_types?.includes('world_setup') || event.card_types?.includes('character_intro')) {
            setCreativePhase('worldbuilding');
          } else if (event.card_types?.includes('plot_direction')) {
            setCreativePhase('outlining');
          }
          break;
        case 'review_card':
          setAgentStatus({ kind: 'working', label: '等待审核...' });
          setPendingReview(event as unknown as Record<string, unknown>);
          addAgentMessage({ role: 'assistant', content: '', type: 'review-card', token: JSON.stringify(event) });
          break;
        case 'suggestions': {
          // 创作建议必须展示给用户（后端每条回复后都会推送）
          const items = event.items;
          if (Array.isArray(items) && items.length > 0) {
            const lines = items
              .map((it) => {
                const typeLabel: Record<string, string> = {
                  summary_missing: '章节缺少摘要',
                  foreshadowing_due: '伏笔待回收',
                  plot_thread_stalled: '情节线停滞',
                  pacing_imbalance: '节奏失衡',
                };
                const label = typeLabel[it?.type || ''] || it?.type || '建议';
                const message = it?.message || it?.suggestion || '';
                return `· ${label}：${message}`;
              })
              .join('\n');
            addAgentMessage({ role: 'assistant', type: 'suggestions', content: `**创作建议**\n${lines}` });
          }
          break;
        }
        case 'title_update':
          if (event.thread_id && event.title) {
            window.dispatchEvent(new CustomEvent('textforge:agent-title', {
              detail: { threadId: event.thread_id, title: event.title },
            }));
          }
          break;
      }
    },
    [addAgentMessage, updateAgentStreamToken, setPendingReview, setAgentStatus, setCreativePhase, commitStreamingMessage, upsertNodeStatus, setNodeOutput, updateToolMessage, updateNodeMessage, setAgentReasoning],
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
          window.dispatchEvent(new CustomEvent('textforge:refresh-agent-sessions'));
        } catch {
          addAgentMessage({ role: 'assistant', content: '启动 Agent 会话失败，请重试。', type: 'error' });
          return;
        }
      }

      setAgentStreaming(true);
      const abort = new AbortController();
      abortRef.current = abort;
      replyBufferRef.current = '';
      // 任务 23：新回合复位上一轮的思考气泡内容
      reasoningBufferRef.current = '';
      setAgentReasoning('');
      // 复位上一轮残留的状态（thinking/working/error），避免新一轮开始时旧思考状态被再次激活
      setAgentStatus({ kind: 'idle' });

      addAgentMessage({ role: 'assistant', content: '', type: 'streaming' });
      currentToolRef.current.clear();
      currentToolNameRef.current = '';
      clearNodeStatuses();
      clearNodeOutputs();

      try {
        await agentApi.streamAgent(
          threadId,
          msg,
          handleSSEEvent,
          (reply, title) => {
            // end.reply 是服务端最终确定的回复（含工作流候选正文确认等非流式内容），
            // 应覆盖缓冲区；仅当 reply 为空时保留流式累积的正文。
            if (reply) {
              replyBufferRef.current = reply;
              updateAgentStreamToken(reply);
            }
            // 会话标题由后端写入数据库后随 end 事件一并下发（避免单独 title_update
            // 事件在 end 之后到达导致前端面板状态紊乱）。这里派发事件更新会话列表。
            if (title && threadId) {
              window.dispatchEvent(new CustomEvent('textforge:agent-title', {
                detail: { threadId, title },
              }));
            }
            // 定型最后一条 streaming 消息（空消息移除），否则残留消息会一直显示 3 点光标/正在酝酿
            commitStreamingMessage();
            setAgentStreaming(false);
            setAgentStatus({ kind: 'idle' });
            notifyOutlineRefresh();
          },
          (err) => {
            commitStreamingMessage();
            addAgentMessage({ role: 'assistant', content: err, type: 'error' });
            setAgentStreaming(false);
            setAgentStatus({ kind: 'error', message: err });
          },
          abort.signal,
          bookId || undefined,
        );
      } catch (err) {
        // 无论失败还是主动停止，都必须定型残留的 streaming 气泡，
        // 否则面板残留「三点脉冲/空白消息」造成显示异常。
        commitStreamingMessage();
        const aborted = (err as Error)?.name === 'AbortError';
        if (!aborted) {
          const errMsg = (err as Error)?.message || 'Agent 请求失败，请重试。';
          const lockConflict = (err as Error & { status?: number })?.status === 503;
          // 任务 22：所有错误都附带原消息，供面板渲染「重试」按钮；
          // 书籍锁冲突（503）时额外提示可解除占用。
          addAgentMessage({
            role: 'assistant',
            content: lockConflict
              ? `${errMsg}。若确认没有其他任务正在运行，可点击「解除占用并重试」。`
              : errMsg,
            type: 'error',
            retryMessage: msg,
          });
          setAgentStatus({ kind: 'error', message: errMsg });
        }
        setAgentStreaming(false);
      }
    },
    [agentStreaming, agentThreadId, bookId, addAgentMessage, setAgentStreaming, setAgentThreadId, handleSSEEvent, setAgentStatus, setAgentReasoning, updateAgentStreamToken, notifyOutlineRefresh, commitStreamingMessage, clearNodeStatuses, clearNodeOutputs],
  );

  const abort = useCallback(() => {
    // 显式通知服务端取消任务（尽快释放书籍锁），再本地中止连接
    if (agentThreadId) void agentApi.cancelStream(agentThreadId);
    abortRef.current?.abort();
  }, [agentThreadId]);

  const resume = useCallback(async () => {
    const threadId = agentThreadId;
    if (!threadId) return;
    setAgentStreaming(true);
    const abort = new AbortController();
    abortRef.current = abort;
    setAgentStatus({ kind: 'idle' });
    reasoningBufferRef.current = '';
    setAgentReasoning('');
    addAgentMessage({ role: 'assistant', content: '', type: 'streaming' });
    currentToolRef.current.clear();
    currentToolNameRef.current = '';
    clearNodeStatuses();
    clearNodeOutputs();
    try {
      await agentApi.resumeAgent(
        threadId,
        handleSSEEvent,
        (reply, title) => {
          // 审批续跑同样以 end.reply 为准（覆盖缓冲区）
          if (reply) {
            replyBufferRef.current = reply;
            updateAgentStreamToken(reply);
          }
          if (title && threadId) {
            window.dispatchEvent(new CustomEvent('textforge:agent-title', {
              detail: { threadId, title },
            }));
          }
          commitStreamingMessage();
          setAgentStreaming(false);
          setAgentStatus({ kind: 'idle' });
          notifyOutlineRefresh();
        },
        (err) => {
          commitStreamingMessage();
          addAgentMessage({ role: 'assistant', content: err, type: 'error' });
          setAgentStreaming(false);
          setAgentStatus({ kind: 'error', message: err });
        },
        abort.signal,
        bookId || undefined,
      );
    } catch (err) {
      commitStreamingMessage();
      const aborted = (err as Error)?.name === 'AbortError';
      if (!aborted) {
        addAgentMessage({
          role: 'assistant',
          content: (err as Error)?.message || 'Agent 请求失败，请重试。',
          type: 'error',
        });
      }
      setAgentStreaming(false);
    }
  }, [agentThreadId, bookId, addAgentMessage, handleSSEEvent, notifyOutlineRefresh, setAgentStreaming, setAgentStatus, updateAgentStreamToken, clearNodeStatuses, clearNodeOutputs, commitStreamingMessage, setAgentReasoning]);

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
