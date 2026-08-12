'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useBookDetailStore } from '@/app/(dashboard)/books/[id]/store';
import * as agentApi from '@/shared/api/agent';
import { ragClient } from '@/lib/knowledge';
import { getRagInjectionConfig } from '@/lib/rag/injectionConfig';
import { emitAgentOutlinesRefresh, emitAgentSessionsRefresh } from './agentEvents';
import { useStreamBuffer } from './sse/useStreamBuffer';
import { createSSEHandler } from './sse/handleSSEEvent';

/**
 * Agent 会话生命周期 + 流式编排：抽取自原 useAgentSender 的 runAgentStream /
 * sendMessage / abort / resume。token 节流与 SSE 分发委托给 useStreamBuffer /
 * createSSEHandler，本层只负责回合编排、RAG 检索窗口与错误处理。
 *
 * 返回的 sendMessage / abort / resume 与原 useAgentSender 契约一致，
 * AgentPanel 与手稿页 AgentDock 共用。nearBottomRef / messagesEndRef 由薄编排层
 * 创建后注入，使发送时的贴底滚动与原实现一致。
 */
export interface AgentSessionOptions {
  bookIdOverride?: number;
  nearBottomRef: { current: boolean };
  messagesEndRef: { current: HTMLDivElement | null };
}

export function useAgentSession(opts: AgentSessionOptions) {
  const { bookIdOverride, nearBottomRef, messagesEndRef } = opts;

  const storeBookId = useBookDetailStore((s) => s.bookId);
  const bookId = bookIdOverride ?? storeBookId;
  const agentThreadId = useBookDetailStore((s) => s.agentThreadId);
  const agentStreaming = useBookDetailStore((s) => s.agentStreaming);

  const addAgentMessage = useBookDetailStore((s) => s.addAgentMessage);
  const updateAgentStreamToken = useBookDetailStore((s) => s.updateAgentStreamToken);
  const setAgentStreaming = useBookDetailStore((s) => s.setAgentStreaming);
  const setAgentStatus = useBookDetailStore((s) => s.setAgentStatus);
  const setAgentReasoning = useBookDetailStore((s) => s.setAgentReasoning);
  const upsertNodeStatus = useBookDetailStore((s) => s.upsertNodeStatus);
  const clearNodeStatuses = useBookDetailStore((s) => s.clearNodeStatuses);
  const clearNodeOutputs = useBookDetailStore((s) => s.clearNodeOutputs);
  const commitStreamingMessage = useBookDetailStore((s) => s.commitStreamingMessage);
  const updateToolMessage = useBookDetailStore((s) => s.updateToolMessage);
  const updateNodeMessage = useBookDetailStore((s) => s.updateNodeMessage);
  const setAgentThreadId = useBookDetailStore((s) => s.setAgentThreadId);
  const setPendingReview = useBookDetailStore((s) => s.setPendingReview);

  const { flushTokens, scheduleToken, flushNodeOutputs, scheduleNodeOutput, discardTokenBuffer, resetBuffers, replyRef } =
    useStreamBuffer();

  const thinkingStartRef = useRef(0);
  const reasoningBufferRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);
  const currentToolRef = useRef<Set<string>>(new Set());
  const currentToolNameRef = useRef<string>('');
  // N6：发送互斥——startAgentSession await 窗口内 agentStreaming 尚未置位，
  // 仅靠该守卫存在重复发送竞态；sendingRef 同步置位堵住窗口。
  const sendingRef = useRef(false);

  // g) currentToolRef 含 outline 时通知大纲刷新
  const notifyOutlineRefresh = useCallback(() => {
    if (currentToolRef.current.size === 0) return;
    const hasOutline = Array.from(currentToolRef.current).some((t) => t.toLowerCase().includes('outline'));
    if (hasOutline) emitAgentOutlinesRefresh();
  }, []);

  const handleSSEEvent = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- refs 仅由返回的 SSE 回调读取（事件时，非渲染期），属安全用法
      createSSEHandler({
        addAgentMessage,
        setPendingReview,
        setAgentStatus,
        setAgentReasoning,
        commitStreamingMessage,
        upsertNodeStatus,
        updateToolMessage,
        updateNodeMessage,
        flushTokens,
        scheduleToken,
        scheduleNodeOutput,
        flushNodeOutputs,
        thinkingStartRef,
        reasoningBufferRef,
        currentToolRef,
        currentToolNameRef,
        replyRef,
      }),
    [
      addAgentMessage,
      setPendingReview,
      setAgentStatus,
      setAgentReasoning,
      commitStreamingMessage,
      upsertNodeStatus,
      updateToolMessage,
      updateNodeMessage,
      flushTokens,
      scheduleToken,
      scheduleNodeOutput,
      flushNodeOutputs,
      thinkingStartRef,
      reasoningBufferRef,
      currentToolRef,
      currentToolNameRef,
      replyRef,
    ],
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
      // 任务 25：新回合复位 token + node 缓冲（旧回合残留一并丢弃）
      resetBuffers();
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
        // 后端 _empty_sse 等路径会先发 error 事件再发 end 事件：记录 error 已发生，
        // onDone 末尾不再把 agentStatus 复位为 idle，避免覆盖 onError 置的错误状态。
        let streamErrored = false;
        const onDone = (reply: string) => {
          // end.reply 是服务端最终确定的回复（含工作流候选正文确认等非流式内容）。
          // v4：仅当 reply 与当前流式缓冲不同才写入——相同则跳过冗余更新，
          // 不同才覆盖（防重复/覆盖丢失）；reply 为空时保留流式累积的正文。
          flushTokens();
          if (reply && reply !== replyRef.current) {
            replyRef.current = reply;
            updateAgentStreamToken(reply);
          }
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
          await agentApi.resumeAgent(opts.threadId, handleSSEEvent, onDone, onError, abort.signal, bookId || undefined);
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
    [
      bookId,
      addAgentMessage,
      setAgentStreaming,
      handleSSEEvent,
      setAgentStatus,
      setAgentReasoning,
      updateAgentStreamToken,
      notifyOutlineRefresh,
      commitStreamingMessage,
      clearNodeStatuses,
      clearNodeOutputs,
      flushTokens,
      flushNodeOutputs,
      resetBuffers,
      setAgentThreadId,
      replyRef,
    ],
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

        // 任务 20：发送时附带个人库检索结果（随流请求体下发，键形状对齐后端契约）。
        // 先置流式态：检索窗口内阻塞发送按钮（sendMessage 的 agentStreaming 守卫），避免重复发送。
        setAgentStreaming(true);
        // N：RAG 检索前就创建 AbortController——检索窗口内点「停止」也能被捕获，
        // 检索完成后检查 aborted 再启动流，消除「停止无效」的竞态窗口。
        const abort = new AbortController();
        abortRef.current = abort;
        let personalRagResults: Array<Record<string, unknown>> | undefined;
        // 检索入口配置：开关 + topK + 文档范围过滤，持久化于 IndexedDB
        const ragCfg = await getRagInjectionConfig();
        if (ragCfg.enabled) {
          try {
            const personalDocs = await ragClient.listPersonal().catch(() => []);
            if (personalDocs.length > 0) {
              const ragHits = await Promise.race([
                ragClient
                  .search(msg, ragCfg.topK, {
                    docIds: ragCfg.docIds.length ? ragCfg.docIds : undefined,
                  })
                  .catch(() => []),
                new Promise<never[]>((resolve) => setTimeout(() => resolve([]), 1000)),
              ]);
              if (ragHits.length > 0) {
                personalRagResults = ragHits.map((h) => ({
                  doc_name: h.docName,
                  content: h.text,
                  score: h.score,
                }));
                // 注入可见性：用户消息后插入引用卡，展示注入的文档与命中片段
                addAgentMessage({
                  role: 'assistant',
                  content: '',
                  type: 'rag-ref',
                  refs: ragHits.map((h) => ({ docName: h.docName, snippet: h.text })),
                });
              }
            }
          } catch {
            // best-effort：个人库不可用时照常发送
          }
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
    [agentStreaming, agentThreadId, bookId, addAgentMessage, setAgentThreadId, setAgentStreaming, setAgentStatus, runAgentStream, nearBottomRef, messagesEndRef],
  );

  const abort = useCallback(() => {
    // 显式通知服务端取消任务（尽快释放书籍锁），再本地中止连接
    if (agentThreadId) void agentApi.cancelStream(agentThreadId);
    abortRef.current?.abort();
    // 任务 25：停止时丢弃未刷新的 token 缓冲，避免 catch 里 flushTokens()
    // 找不到 streaming 消息时追加新消息（重复回复 / 跨会话泄漏）
    discardTokenBuffer();
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
  }, [agentThreadId, discardTokenBuffer, flushNodeOutputs, setAgentStatus]);

  const resume = useCallback(async () => {
    const threadId = agentThreadId;
    if (!threadId) return;
    await runAgentStream({ message: '', threadId });
  }, [agentThreadId, runAgentStream]);

  return { sendMessage, abort, resume };
}
