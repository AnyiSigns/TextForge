'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useBookDetailStore } from '@/app/(dashboard)/books/[id]/store';
import * as agentApi from '@/shared/api/agent';
import { ragClient } from '@/lib/knowledge';
import type { SSEEvent } from '@/shared/api/types';
import { assertReviewCard, assertToolEnd, assertNodeEnd, assertTurnMetrics } from '@/shared/api/sseGuards';
import {
  emitAgentChapterContentRefresh,
  emitAgentOutlinesRefresh,
  emitAgentSessionsRefresh,
  emitAgentTitle,
} from './agentEvents';

/**
 * 共享的 Agent 发送逻辑：封装 SSE 事件处理、流式渲染、滚动与大纲刷新。
 * AgentPanel 与 manuscript 页的 AgentDock 共用，避免 SSE 逻辑分叉。
 *
 * 任务 25：sendMessage / resume 合并为同一内部实现（runAgentStream），
 * 仅入口差异（新消息 vs 空消息续跑）；token 流经 rAF 节流批量写入 store，
 * 避免每 token 一次全列表重渲。
 *
 * 4.4：接受可选 bookId 显式注入（手稿页/书籍页），缺省回退 useBookDetailStore。
 */
export function useAgentSender(bookIdOverride?: number) {
  const storeBookId = useBookDetailStore((s) => s.bookId);
  const bookId = bookIdOverride ?? storeBookId;
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

  const thinkingStartRef = useRef(0);
  const reasoningBufferRef = useRef('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const currentToolRef = useRef<Set<string>>(new Set());
  const currentToolNameRef = useRef<string>('');
  const replyBufferRef = useRef('');
  const nearBottomRef = useRef(true);
  // N6：发送互斥——startAgentSession await 窗口内 agentStreaming 尚未置位，
  // 仅靠该守卫存在重复发送竞态；sendingRef 同步置位堵住窗口。
  const sendingRef = useRef(false);
  // 任务 25：token 流 rAF 节流——攒批一帧内多次 token 再写一次 store，
  // 避免每 token 全量 set store 导致长消息列表 O(n²) 重渲。
  const pendingTokenRef = useRef('');
  const rafHandleRef = useRef<number | null>(null);
  // N9：node_stream 输出同样 rAF 批处理（store 追加语义不变），
  // 避免每 token 一次全列表 set store 的 O(n²) 重渲。
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

  const scheduleNodeOutput = useCallback((nodeId: string, token: string) => {
    nodeOutputBufferRef.current[nodeId] = (nodeOutputBufferRef.current[nodeId] || '') + token;
    if (nodeRafRef.current === null) {
      nodeRafRef.current = requestAnimationFrame(() => {
        nodeRafRef.current = null;
        flushNodeOutputs();
      });
    }
  }, [flushNodeOutputs]);

  const flushTokens = useCallback(() => {
    if (rafHandleRef.current !== null) {
      cancelAnimationFrame(rafHandleRef.current);
      rafHandleRef.current = null;
    }
    if (pendingTokenRef.current) {
      replyBufferRef.current += pendingTokenRef.current;
      pendingTokenRef.current = '';
      updateAgentStreamToken(replyBufferRef.current);
    }
  }, [updateAgentStreamToken]);

  const scheduleToken = useCallback((token: string) => {
    pendingTokenRef.current += token;
    if (rafHandleRef.current === null) {
      rafHandleRef.current = requestAnimationFrame(() => {
        rafHandleRef.current = null;
        if (pendingTokenRef.current) {
          replyBufferRef.current += pendingTokenRef.current;
          pendingTokenRef.current = '';
          updateAgentStreamToken(replyBufferRef.current);
        }
      });
    }
  }, [updateAgentStreamToken]);

  const notifyOutlineRefresh = useCallback(() => {
    if (currentToolRef.current.size === 0) return;
    const hasOutline = Array.from(currentToolRef.current).some((t) => t.toLowerCase().includes('outline'));
    if (hasOutline) emitAgentOutlinesRefresh();
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
          const token = event.token || '';
          if (token) {
            scheduleToken(token);
          }
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
          flushTokens();
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
          assertToolEnd(event as unknown as Record<string, unknown>);
          const toolName = event.tool || currentToolNameRef.current;
          const toolCallId = event.tool_call_id || '';
          const success = (event as { success?: boolean }).success;
          currentToolNameRef.current = '';
          // success=false 时置 error，使「工具执行失败」状态真正可达（否则 toolStatus 的
          // error 分支只会在 abort 时触发，失败语义全靠 toolSuccess 表达）。
          updateToolMessage(toolName, success === false ? 'error' : 'done', {
            toolCallId: toolCallId || undefined,
            success,
          });
          // 1.4（v5）：write_chapter_content 审批执行成功 → 通知手稿编辑器刷新当前章内容
          if (toolName === 'write_chapter_content' && success) {
            emitAgentChapterContentRefresh();
          }
          break;
        }
        case 'node_start': {
          flushTokens();
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
          // N9：rAF 批处理，减少 store 写入次数
          scheduleNodeOutput(nodeId, event.token || '');
          break;
        }
        case 'node_end': {
          // N9：先冲刷未落库的 node_stream 缓冲，再读取 nodeOutputs 固化卡片内容
          flushNodeOutputs();
          // N3：node_end 事件不带 label（后端仅 node_id/output_preview/tokens），
          // 仅在 event.label 存在时才更新 label，避免用 nodeId 覆盖 node_start 的友好标签
          assertNodeEnd(event as unknown as Record<string, unknown>);
          const nodeId = event.node_id || '';
          const label = (event as { label?: string }).label;
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
          // N9：先冲刷未落库的 node_stream 缓冲
          flushNodeOutputs();
          // 节点失败必须让用户看到，不能静默
          const nodeId = event.node_id || '';
          const label = (event as { label?: string }).label;
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
            content: `工作流节点失败：${label || nodeId}${reason ? `（${reason}）` : ''}`,
          });
          setAgentStatus({ kind: 'error', message: `节点 ${label || nodeId} 执行失败` });
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
          // 任务 14：区分 build_outline（建大纲 N/M）与 generate_chapter（生成章节 N/M）
          if ((event as { step?: string }).step === 'build_outline') {
            const label = (event as { label?: string }).label || '';
            setAgentStatus({
              kind: 'working',
              label: (event as { total?: number }).total
                ? `正在建大纲 ${event.n ?? 0}/${event.total}${label ? `：${label}` : ''}...`
                : '正在建大纲...',
            });
          } else {
            setAgentStatus({
              kind: 'working',
              label: (event as { n?: number; total?: number }).total
                ? `生成章节中 ${event.n ?? 0}/${event.total}...`
                : '生成章节中...',
            });
          }
          break;
        case 'turn_metrics': {
          // 任务 28：回合指标事件——仅作调试/日志展示，不影响 UI 状态
          // 2.3：契约统一为嵌套结构 { type, metrics }
          assertTurnMetrics(event as unknown as Record<string, unknown>);
          break;
        }
        case 'review_card': {
          // 2.2/2.12：契约断言（tokens/elapsed_ms 字段） + live 卡片（可操作）
          assertReviewCard(event as unknown as Record<string, unknown>);
          setAgentStatus({ kind: 'working', label: '等待审核...' });
          setPendingReview(event as unknown as Record<string, unknown>);
          addAgentMessage({
            role: 'assistant',
            content: '',
            type: 'review-card',
            token: JSON.stringify(event),
            live: true,
          });
          // 门控写工具被拦截期间后端不发 tool_end，工具卡会一直「请求外援中」；
          // 审核卡到达时把匹配的门控写工具卡（写工具卡 node_id == 工具名）置 pending，
          // 文案改为「等待审核」，避免「仍在执行」的误导（工作流审核卡 node_id 是
          // 节点 id，不匹配任何工具卡，自然跳过）。
          const gatedTool = (event as { node_id?: string }).node_id || '';
          if (gatedTool) {
            useBookDetailStore.setState((s) => ({
              agentMessages: s.agentMessages.map((m) =>
                m.type === 'tool' && m.tool === gatedTool && m.toolStatus === 'running'
                  ? { ...m, toolStatus: 'pending' as const }
                  : m,
              ),
            }));
          }
          break;
        }
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
          // 任务 25：title_update 是会话标题唯一通道（end 事件不携带 title，
          // 后端契约已确认），统一走 agentEvents 分发避免双通道分歧。
          if (event.thread_id && event.title) {
            emitAgentTitle(event.thread_id, event.title);
          }
          break;
      }
    },
    [addAgentMessage, setPendingReview, setAgentStatus, commitStreamingMessage, upsertNodeStatus, updateToolMessage, updateNodeMessage, setAgentReasoning, flushTokens, scheduleToken, scheduleNodeOutput, flushNodeOutputs],
  );

  // 任务 25：sendMessage / resume 共用同一流式执行骨架，仅起始差异（消息内容 / 续跑）。
  const runAgentStream = useCallback(
    async (opts: {
      message: string;
      threadId: string;
      personalRagResults?: Array<Record<string, unknown>>;
      // RAG 检索窗口期间创建的 AbortController（外部注入，检索后已检查 aborted）
      abortController?: AbortController;
    }) => {
      setAgentStreaming(true);
      const abort = opts.abortController ?? new AbortController();
      abortRef.current = abort;
      replyBufferRef.current = '';
      pendingTokenRef.current = '';
      if (rafHandleRef.current !== null) cancelAnimationFrame(rafHandleRef.current);
      rafHandleRef.current = null;
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
      // N9：新回合复位节点输出缓冲（旧回合残留的未冲刷 token 一并丢弃）
      nodeOutputBufferRef.current = {};
      if (nodeRafRef.current !== null) {
        cancelAnimationFrame(nodeRafRef.current);
        nodeRafRef.current = null;
      }

      try {
        // 后端 _empty_sse 等路径会先发 error 事件再发 end 事件：记录 error 已发生，
        // onDone 末尾不再把 agentStatus 复位为 idle，避免覆盖 onError 置的错误状态。
        let streamErrored = false;
        const onDone = (reply: string) => {
          // end.reply 是服务端最终确定的回复（含工作流候选正文确认等非流式内容）。
          // v4：仅当 reply 与当前流式缓冲不同才写入——相同则跳过冗余更新，
          // 不同才覆盖（防重复/覆盖丢失）；reply 为空时保留流式累积的正文。
          flushTokens();
          if (reply && reply !== replyBufferRef.current) {
            replyBufferRef.current = reply;
            updateAgentStreamToken(reply);
          }
          // 任务 25：会话标题由后端 title_update 事件统一下发（end 事件不携带 title），
          // 此处不再处理 title，避免双通道收敛前的冗余分支。
          // 定型最后一条 streaming 消息（空消息移除），否则残留消息会一直显示 3 点光标/正在酝酿
          commitStreamingMessage();
          setAgentStreaming(false);
          if (!streamErrored) setAgentStatus({ kind: 'idle' });
          notifyOutlineRefresh();
        };
        const onError = (err: string) => {
          streamErrored = true;
          flushTokens();
          commitStreamingMessage();
          addAgentMessage({ role: 'assistant', content: err, type: 'error' });
          setAgentStreaming(false);
          setAgentStatus({ kind: 'error', message: err });
        };
        if (opts.message) {
          await agentApi.streamAgent(
            opts.threadId,
            opts.message,
            handleSSEEvent,
            onDone,
            onError,
            abort.signal,
            bookId || undefined,
            opts.personalRagResults,
          );
        } else {
          await agentApi.resumeAgent(
            opts.threadId,
            handleSSEEvent,
            onDone,
            onError,
            abort.signal,
            bookId || undefined,
          );
        }
      } catch (err) {
        const aborted = (err as Error)?.name === 'AbortError';
        if (aborted) {
          // 主动停止（abort 已清空 token/reply 缓冲）：只需定型残留的 streaming 气泡，
          // 不要再 flush 缓冲——否则 updateAgentStreamToken 找不到 streaming 消息会
          // 追加一条新消息，产生「停止后重复回复」或跨会话内容泄漏（任务 25 修复）。
          flushNodeOutputs();
          commitStreamingMessage();
        } else {
          // 真实失败：flush 缓冲 + 定型气泡 + 展示错误（含重试按钮）
          flushTokens();
          flushNodeOutputs();
          commitStreamingMessage();
          const errMsg = (err as Error)?.message || 'Agent 请求失败，请重试。';
          const status = (err as Error & { status?: number })?.status;
          const lockConflict = status === 503;
          if (status === 404) {
            // N5：会话不存在/已失效（被删除或过期）→ 重置会话并引导新建，
            // 不附加 retryMessage（重试只会再次 404）；刷新侧栏移除已失效会话
            setAgentThreadId(null);
            emitAgentSessionsRefresh();
            addAgentMessage({
              role: 'assistant',
              type: 'error',
              content: `${errMsg}，已重置会话，请重新发送。`,
            });
            setAgentStatus({ kind: 'error', message: errMsg });
          } else {
            // 任务 22：所有错误都附带原消息，供面板渲染「重试」按钮；
            // 书籍锁冲突（503）时额外提示可解除占用。
            addAgentMessage({
              role: 'assistant',
              content: lockConflict
                ? `${errMsg}。若确认没有其他任务正在运行，可点击「解除占用并重试」。`
                : errMsg,
              type: 'error',
              retryMessage: opts.message,
            });
            setAgentStatus({ kind: 'error', message: errMsg });
          }
        }
        setAgentStreaming(false);
      }
    },
    [bookId, addAgentMessage, setAgentStreaming, handleSSEEvent, setAgentStatus, setAgentReasoning, updateAgentStreamToken, notifyOutlineRefresh, commitStreamingMessage, clearNodeStatuses, clearNodeOutputs, flushTokens, flushNodeOutputs, setAgentThreadId],
  );

  const sendMessage = useCallback(
    async (msg: string) => {
      // N6：sendingRef 同步互斥（agentStreaming 置位前存在 startAgentSession await 窗口）
      if (!msg.trim() || agentStreaming || sendingRef.current) return;
      sendingRef.current = true;
      try {
        addAgentMessage({ role: 'user', content: msg });
        nearBottomRef.current = true;
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

        let threadId = agentThreadId;
        if (!threadId) {
          try {
            const session = await agentApi.startAgentSession(bookId || undefined);
            threadId = session.thread_id;
            setAgentThreadId(threadId);
            emitAgentSessionsRefresh();
          } catch {
            addAgentMessage({ role: 'assistant', content: '启动 Agent 会话失败，请重试。', type: 'error' });
            return;
          }
        }

        // 任务 20：发送时附带个人库检索结果（随流请求体下发，键形状对齐后端契约 {doc_name, content, score}）。
        // 先置流式态：检索窗口内阻塞发送按钮（sendMessage 的 agentStreaming 守卫），避免重复发送。
        // 短路 + 超时：无个人文档不触发本地 embedding/WASM 冷加载；冷启动超过 1s 直接放弃附带，
        // 不让模型下载阻塞首 token（best-effort，检索失败不影响发送）。
        setAgentStreaming(true);
        // N：RAG 检索前就创建 AbortController——检索窗口内点「停止」也能被捕获，
        // 检索完成后检查 aborted 再启动流，消除「停止无效」的竞态窗口。
        const abort = new AbortController();
        abortRef.current = abort;
        let personalRagResults: Array<Record<string, unknown>> | undefined;
        try {
          const personalDocs = await ragClient.listPersonal().catch(() => []);
          if (personalDocs.length > 0) {
            const ragHits = await Promise.race([
              ragClient.search(msg, 'personal', 3).catch(() => []),
              new Promise<never[]>((resolve) => setTimeout(() => resolve([]), 1000)),
            ]);
            if (ragHits.length > 0) {
              personalRagResults = ragHits.map((h) => ({
                doc_name: h.docName,
                content: h.text,
                score: h.score,
              }));
            }
          }
        } catch {
          // best-effort：个人库不可用时照常发送
        }
        if (abort.signal.aborted) {
          setAgentStreaming(false);
          setAgentStatus({ kind: 'idle' });
          return;
        }

        await runAgentStream({ message: msg, threadId, personalRagResults, abortController: abort });
      } finally {
        sendingRef.current = false;
      }
    },
    [agentStreaming, agentThreadId, bookId, addAgentMessage, setAgentThreadId, setAgentStreaming, setAgentStatus, runAgentStream],
  );

  const abort = useCallback(() => {
    // 显式通知服务端取消任务（尽快释放书籍锁），再本地中止连接
    if (agentThreadId) void agentApi.cancelStream(agentThreadId);
    abortRef.current?.abort();
    if (rafHandleRef.current !== null) cancelAnimationFrame(rafHandleRef.current);
    rafHandleRef.current = null;
    // 任务 25 修复：停止时丢弃未刷新的 token 缓冲，避免 catch 里 flushTokens()
    // 找不到 streaming 消息时追加新消息（重复回复 / 跨会话泄漏）
    pendingTokenRef.current = '';
    replyBufferRef.current = '';
    // N9：冲刷未落库的 node_stream 缓冲（部分正文保留在节点卡片）
    flushNodeOutputs();
    // 统一复位（与 AgentPanel.handleAbort 同语义，收敛为单入口，消除双 UI abort
    // 状态不一致）：残留 streaming 定型为 system、running/pending 工具卡转 error、
    // 清空节点状态卡/审核卡/思考气泡。
    useBookDetailStore.setState((state) => ({
      agentMessages: state.agentMessages.map((m) => {
        if (m.type === 'streaming') return { ...m, type: 'system' as const };
        if (m.type === 'tool' && (m.toolStatus === 'running' || m.toolStatus === 'pending')) {
          return { ...m, toolStatus: 'error' as const };
        }
        return m;
      }),
      agentNodeStatuses: [],
      nodeOutputs: {},
      pendingReview: null,
      agentReasoning: '',
    }));
    setAgentStatus({ kind: 'idle' });
  }, [agentThreadId, flushNodeOutputs, setAgentStatus]);

  const resume = useCallback(async () => {
    const threadId = agentThreadId;
    if (!threadId) return;
    await runAgentStream({ message: '', threadId });
  }, [agentThreadId, runAgentStream]);

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

  // 组件卸载时清理 rAF，避免 setState after unmount 告警
  useEffect(() => {
    return () => {
      if (rafHandleRef.current !== null) cancelAnimationFrame(rafHandleRef.current);
      if (nodeRafRef.current !== null) cancelAnimationFrame(nodeRafRef.current);
    };
  }, []);

  return { sendMessage, abort, resume, messagesEndRef };
}
