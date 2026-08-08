'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  X, ArrowLeft, Eye, GitBranch, Send, ChevronRight,
  AlertTriangle, RefreshCw, Loader2, CheckCircle2, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import { useStoryFlowStore } from '@/features/map/stores/storyFlowStore';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useBookDetailStore } from './store';
import { getModelConfigData, startAgentSession, streamAgent } from '@/shared/api/agent';

type SubmitState =
  | 'idle'
  | 'summarizing'
  | 'streaming'
  | 'success'
  | 'error'
  | 'lock-conflict'
  | 'review-needed';

interface AgentNodeStatus {
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tokens?: number;
  reason?: string;
  output?: string;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function StoryFlow() {
  const bookId = useBookDetailStore((s) => s.bookId);
  const setAgentOpen = useBookDetailStore((s) => s.setAgentOpen);
  const {
    isOpen, currentSceneId, perspective, decisionChain, triggerChapterId,
    nodes, status, viewCharacterId, availableCharacters, loading, streaming,
    perspectiveLocked, pickCharacterOpen, streamText, anchorEventIds,
    currentEventIndex, restored, pendingChosenOption,
    close, setPerspective, chooseViewCharacter, skipViewCharacter,
    advance, retry, finishFlow, goToNode,
  } = useStoryFlowStore();

  const chapters = useEntityStore((s) => s.chapters);
  const characters = useEntityStore((s) => s.characters);

  const [showDecisions, setShowDecisions] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [endAction, setEndAction] = useState<'finish' | 'submit'>('finish');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [agentReply, setAgentReply] = useState('');
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, AgentNodeStatus>>({});
  const [reviewData, setReviewData] = useState<{ nodeLabel?: string; reason?: string } | null>(null);
  const [agentThreadId, setAgentThreadId] = useState<string | null>(null);
  const agentAbortRef = useRef<AbortController | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

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

  const currentNode = nodes[currentSceneId] ?? null;
  const triggerChapter = triggerChapterId
    ? chapters.find((c) => c.id === triggerChapterId)
    : null;

  const viewName = viewCharacterId != null
    ? (characters.find((c) => c.id === viewCharacterId)?.name ?? null)
    : null;

  const applyPerspective = useCallback(
    (text: string) => {
      if (perspective !== 'first' || !viewName) return text;
      const name = escapeRegExp(viewName);
      return text
        .replace(new RegExp(`${name}的`, 'g'), '你的')
        .replace(new RegExp(name, 'g'), '你');
    },
    [perspective, viewName],
  );

  const narrationText = currentNode ? applyPerspective(currentNode.narration) : '';
  const streamDisplay = streamText ? applyPerspective(streamText) : '';

  const isEventMode = anchorEventIds.length > 0;
  const anchoredIndex = currentNode?.anchoredEventId != null
    ? anchorEventIds.indexOf(currentNode.anchoredEventId)
    : -1;
  const progressLabel = isEventMode
    ? (anchoredIndex >= 0 ? `事件 ${anchoredIndex + 1} / ${anchorEventIds.length} · ${currentNode?.title ?? ''}` : '剧情推演')
    : '自由推演';
  const remainingEvents = isEventMode && currentEventIndex >= 0
    ? Math.max(0, anchorEventIds.length - 1 - currentEventIndex)
    : null;

  const isEnded = status === 'completed';
  const currentNodeHasOptions = currentNode && currentNode.options.length > 0 && !isEnded;
  const pendingRetryVisible = pendingChosenOption !== null && !streaming;

  // 决策链 → 节点下标映射（点击历史条目回看）
  const decisionNodeIndices = useMemo(() => {
    const idx: number[] = [];
    nodes.forEach((n, i) => {
      if (n.chosenOption) idx.push(i);
    });
    return idx;
  }, [nodes]);

  const handleClose = useCallback(() => {
    agentAbortRef.current?.abort();
    if (agentThreadId && submitState !== 'idle') {
      toast.info('推演摘要已提交到 Agent 会话，可在 Agent 面板查看');
    }
    close();
  }, [agentThreadId, submitState, close]);

  // Esc 关闭
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  // 节点切换时主区滚动到顶部
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [currentSceneId]);

  // 流式期间自动滚动到底部跟随
  useEffect(() => {
    if (!streaming || !contentRef.current) return;
    contentRef.current.scrollTop = contentRef.current.scrollHeight;
  }, [streamText, streaming]);

  if (!isOpen) return null;

  const handleOptionClick = (text: string) => {
    void advance(text);
  };

  const handleCustomSubmit = () => {
    const text = customInput.trim();
    if (!text) return;
    if (text.length > 200) {
      toast.error('输入过长（上限 200 字）');
      return;
    }
    setCustomInput('');
    void advance(text);
  };

  const openEndConfirm = (action: 'finish' | 'submit') => {
    setEndAction(action);
    setEndConfirmOpen(true);
  };

  const confirmEnd = async () => {
    setEndConfirmOpen(false);
    await finishFlow();
    if (endAction === 'submit') {
      await handleSubmitToWorkflow();
    }
  };

  const handleSubmitToWorkflow = async () => {
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
  };

  const goToAgentPanel = () => {
    agentAbortRef.current?.abort();
    close();
    setAgentOpen(true);
  };

  const statusList = Object.entries(nodeStatuses);

  const renderCharacterPicker = () => {
    if (!pickCharacterOpen) return null;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
        <div className="modal-enter w-full max-w-lg bg-card border border-border/40 rounded-2xl shadow-card overflow-hidden flex flex-col max-h-[80vh]">
          <div className="px-6 py-4 border-b border-border/30 flex-shrink-0">
            <h3 className="text-[15px] font-semibold text-foreground/90">
              {triggerChapter?.title ?? '本章'} · 选择视角角色
            </h3>
            <p className="text-[11px] text-muted-foreground/60 mt-1">
              以所选角色的所见所闻展开推演（第三人称叙述，展示层可切第一人称）
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4 grid grid-cols-2 gap-3">
            {availableCharacters.map((c) => (
              <button
                key={c.id}
                onClick={() => void chooseViewCharacter(c.id)}
                className="text-left flex gap-2.5 items-start p-3 rounded-xl border border-border/40 bg-background/40 hover:border-foreground/20 hover:bg-foreground/[0.02] hover:shadow-sm transition-all cursor-pointer"
              >
                {c.avatarUrl ? (
                  // 用户自定义远程头像 URL，next/image 需配置任意远程域名白名单，此处用 img 合理
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.avatarUrl} alt={c.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className="w-9 h-9 rounded-full bg-foreground/[0.06] flex items-center justify-center text-[13px] font-medium text-foreground/60 flex-shrink-0">
                    {c.name.slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium text-foreground/80">{c.name}</span>
                    {c.roleType && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-foreground/[0.05] text-foreground/50">{c.roleType}</span>
                    )}
                  </span>
                  {c.description && (
                    <span className="block text-[10px] text-muted-foreground/70 leading-relaxed mt-1 line-clamp-2">{c.description}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
          <div className="px-6 py-3 border-t border-border/30 flex-shrink-0 flex items-center justify-between">
            <button
              onClick={() => void skipViewCharacter()}
              className="text-[11px] text-muted-foreground/60 hover:text-foreground/70 bg-transparent border-none cursor-pointer"
            >
              以第三人称进入
            </button>
            <span className="text-[10px] text-muted-foreground/40">
              共 {availableCharacters.length} 位出场角色
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderEndConfirm = () => {
    if (!endConfirmOpen) return null;
    const text = remainingEvents !== null && remainingEvents > 0
      ? `尚有 ${remainingEvents} 个事件未推演，确认结束？`
      : remainingEvents === 0
        ? '推演已完整，确认结束？'
        : '确认结束本次推演？';
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
        <div className="modal-enter w-full max-w-sm bg-card border border-border/40 rounded-2xl shadow-card p-6">
          <h3 className="text-[15px] font-semibold text-foreground/90 mb-2">结束推演</h3>
          <p className="text-[12px] text-muted-foreground/70 mb-5">{text}</p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEndConfirmOpen(false)}
              className="h-8 px-4 rounded-md text-[12px] text-muted-foreground/70 border border-border/40 bg-transparent cursor-pointer hover:text-foreground/80"
            >
              取消
            </button>
            <button
              onClick={() => void confirmEnd()}
              className="h-8 px-4 rounded-md text-[12px] font-medium bg-foreground text-background border-none cursor-pointer hover:opacity-90"
            >
              确认结束
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderAgentSubmitView = () => {
    if (submitState === 'idle') return null;

    // 审计拦截提示条
    if (submitState === 'review-needed' && reviewData) {
      return (
        <div className="mt-6 max-w-2xl mx-auto">
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3">
            <AlertTriangle size={14} className="text-amber-500/70 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-foreground/80 font-medium">
                节点 {reviewData.nodeLabel ?? ''} 需要审核
              </p>
              {reviewData.reason && (
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">{reviewData.reason}</p>
              )}
              <p className="text-[10px] text-muted-foreground/50 mt-1">工作流已暂停，请前往 Agent 面板处理（接受/重试/编辑）</p>
            </div>
            <button
              onClick={goToAgentPanel}
              className="flex-shrink-0 h-7 px-3 rounded-md text-[11px] font-medium bg-amber-500/90 text-background border-none cursor-pointer hover:opacity-90"
            >
              前往 Agent 面板处理
            </button>
          </div>
        </div>
      );
    }

    if (submitState === 'lock-conflict') {
      return (
        <div className="mt-6 max-w-2xl mx-auto">
          <div className="flex items-start gap-2 rounded-xl border border-border/40 bg-background/40 px-4 py-3">
            <AlertTriangle size={14} className="text-muted-foreground/50 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-foreground/80 font-medium">该书正有 Agent 任务进行中</p>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">请稍后再试，或前往 Agent 面板查看进行中的任务。</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => void handleSubmitToWorkflow()}
                className="h-7 px-3 rounded-md text-[11px] border border-border/40 bg-transparent cursor-pointer hover:text-foreground/80 flex items-center gap-1"
              >
                <RefreshCw size={11} /> 稍后重试
              </button>
              <button
                onClick={goToAgentPanel}
                className="h-7 px-3 rounded-md text-[11px] font-medium bg-foreground text-background border-none cursor-pointer hover:opacity-90"
              >
                前往 Agent 面板
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (submitState === 'summarizing') {
      return (
        <div className="mt-6 max-w-2xl mx-auto">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground/70">
            <Loader2 size={13} className="animate-spin" />
            生成摘要中…
          </div>
        </div>
      );
    }

    // streaming / success / error：agent 消息气泡 + 节点状态列表
    return (
      <div className="mt-6 max-w-2xl mx-auto">
        <div className="rounded-xl border border-border/40 bg-background/40 overflow-hidden">
          <div className="px-4 py-2 border-b border-border/20 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">Agent 执行中</span>
            {(submitState === 'streaming' || submitState === 'success') && (
              <span className="text-[10px] text-muted-foreground/50">
                {Object.values(nodeStatuses).filter((s) => s.status === 'completed').length}/{Object.keys(nodeStatuses).length || '—'} 节点完成
              </span>
            )}
          </div>
          <div className="px-4 py-3 space-y-2 max-h-[280px] overflow-y-auto">
            {agentReply ? (
              <div className="text-[12px] leading-relaxed text-foreground/80 whitespace-pre-wrap break-words">
                {agentReply}
                {submitState === 'streaming' && <span className="inline-block w-1 h-3.5 bg-foreground/40 ml-0.5 align-middle animate-pulse" />}
              </div>
            ) : submitState === 'streaming' ? (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
                <span className="thinking-shimmer-text">执行工作流中</span>
                <span className="ml-auto inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground/70" />
              </div>
            ) : null}

            {statusList.map(([nodeId, s]) => (
              <div key={nodeId} className="flex items-start gap-2">
                {s.status === 'completed' && <CheckCircle2 size={13} className="text-green-500/70 mt-0.5 shrink-0" />}
                {s.status === 'failed' && <XCircle size={13} className="text-red-500/60 mt-0.5 shrink-0" />}
                {s.status === 'running' && <Loader2 size={13} className="text-foreground/40 animate-spin mt-0.5 shrink-0" />}
                {s.status === 'pending' && <div className="w-3 h-3 rounded-full border border-border/30 mt-1 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('text-[11px]', s.status === 'completed' ? 'text-foreground/50' : s.status === 'failed' ? 'text-red-500/70' : s.status === 'running' ? 'text-foreground/80 font-medium' : 'text-foreground/40')}>
                      {s.label}
                    </span>
                    {s.tokens !== undefined && (
                      <span className="text-[9px] text-foreground/30 tabular-nums">{s.tokens}t</span>
                    )}
                    {s.status === 'failed' && s.reason && (
                      <span className="text-[9px] text-red-500/50 truncate max-w-[140px]">{s.reason}</span>
                    )}
                  </div>
                  {s.output && (
                    <div className="text-[10px] leading-relaxed text-foreground/45 bg-foreground/[0.03] rounded-md px-2 py-1.5 mt-1 max-h-[80px] overflow-y-auto whitespace-pre-wrap break-words">
                      {s.output}
                      {s.status === 'running' && <span className="inline-block w-1 h-3 bg-foreground/30 ml-0.5 animate-pulse" />}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {submitState === 'success' && (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground/60">已在 agent 会话中生成，可前往 Agent 面板查看</p>
            <button
              onClick={goToAgentPanel}
              className="h-7 px-3 rounded-md text-[11px] font-medium bg-foreground text-background border-none cursor-pointer hover:opacity-90"
            >
              前往 Agent 面板查看
            </button>
          </div>
        )}

        {submitState === 'error' && (
          <div className="mt-3 flex items-center gap-2">
            <p className="text-[11px] text-red-500/70 flex-1">Agent 执行失败，推演与会话已保留</p>
            <button
              onClick={() => void handleSubmitToWorkflow()}
              className="h-7 px-3 rounded-md text-[11px] border border-border/40 bg-transparent cursor-pointer hover:text-foreground/80 flex items-center gap-1"
            >
              <RefreshCw size={11} /> 重试
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderEndArea = () => {
    if (!isEnded) return null;
    return (
      <div className="mt-10 text-center">
        <div className="text-2xl opacity-20 mb-3">✦</div>
        <p className="text-sm text-muted-foreground/70 mb-2">
          推演结束 · 决策链共 {decisionChain.length} 步
        </p>
        <button
          onClick={() => void handleSubmitToWorkflow()}
          disabled={submitState === 'summarizing' || submitState === 'streaming'}
          className="flex items-center gap-2 mx-auto h-10 px-6 rounded-xl text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-50"
        >
          {submitState === 'summarizing' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          {submitState === 'summarizing' ? '生成摘要中…' : '提交到工作流'}
        </button>
        <p className="text-[10px] text-muted-foreground/40 mt-2">
          将推演摘要和章节上下文提交给工作流，生成完整正文
        </p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-hidden flex flex-col"
      style={{ animation: 'storyflow-in 0.3s ease-out' }}
    >
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-border/40 flex-shrink-0 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleClose}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer transition-colors flex-shrink-0"
          >
            <ArrowLeft size={14} strokeWidth={1.5} />
            返回地图
          </button>
          <span className="text-muted-foreground/30">|</span>
          <span className="text-[13px] font-semibold text-foreground/80 truncate">
            剧情流{triggerChapter && ` · ${triggerChapter.title}`}
            {restored && (
              <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[9px] font-normal bg-foreground/[0.06] text-foreground/50 align-middle">
                续上次推演
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* 阶段进度 */}
          {isOpen && nodes.length > 0 && (
            <span className="hidden md:inline-block text-[10px] text-muted-foreground/50 mr-1">
              {progressLabel}
            </span>
          )}

          {/* 视角切换（completed 后隐藏） */}
          {!isEnded && (
            <div className="flex items-center bg-muted/50 rounded-lg p-0.5" title={perspectiveLocked ? '本章暂无出场角色' : undefined}>
              <button
                onClick={() => setPerspective('first')}
                disabled={perspectiveLocked}
                className={cn(
                  'px-3 py-1 rounded-md text-[11px] transition-all border-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-40',
                  perspective === 'first'
                    ? 'bg-card text-foreground/80 shadow-sm'
                    : 'text-muted-foreground/60 hover:text-foreground/60',
                )}
              >
                <Eye size={11} className="inline mr-1" />
                第一人称
              </button>
              <button
                onClick={() => setPerspective('third')}
                className={cn(
                  'px-3 py-1 rounded-md text-[11px] transition-all border-none cursor-pointer',
                  perspective === 'third'
                    ? 'bg-card text-foreground/80 shadow-sm'
                    : 'text-muted-foreground/60 hover:text-foreground/60',
                )}
              >
                <Eye size={11} className="inline mr-1" />
                第三人称
              </button>
            </div>
          )}

          {/* 结束推演（active 显示，completed 隐藏） */}
          {!isEnded && (
            <button
              onClick={() => openEndConfirm('finish')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] bg-transparent border border-border/40 text-muted-foreground/60 hover:text-foreground/70 cursor-pointer"
            >
              结束推演
            </button>
          )}

          {/* 决策链面板切换 */}
          <button
            onClick={() => setShowDecisions(!showDecisions)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] bg-transparent border cursor-pointer transition-colors',
              showDecisions
                ? 'border-foreground/20 bg-foreground/[0.03] text-foreground/70'
                : 'border-border/40 text-muted-foreground/60 hover:text-foreground/60',
            )}
          >
            <GitBranch size={11} />
            决策记录 ({decisionChain.length})
          </button>

          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 bg-transparent border-none cursor-pointer ml-2"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 主内容区 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 场景描述 */}
          <div ref={contentRef} className="flex-1 overflow-y-auto px-8 py-8">
            {loading && !streaming && nodes.length === 0 ? (
              <div className="max-w-2xl mx-auto">
                <div className="mb-6">
                  <div className="h-5 w-32 rounded bg-foreground/[0.05] animate-pulse mb-2" />
                  <div className="h-3 w-48 rounded bg-foreground/[0.04] animate-pulse" />
                </div>
                <p className="text-[11px] text-muted-foreground/50 mb-6">正在检查未完成推演…</p>
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-foreground/[0.04] animate-pulse" />
                  <div className="h-3 w-11/12 rounded bg-foreground/[0.04] animate-pulse" />
                  <div className="h-3 w-4/5 rounded bg-foreground/[0.04] animate-pulse" />
                </div>
              </div>
            ) : streaming && nodes.length === 0 && !streamDisplay ? (
              <div className="max-w-2xl mx-auto">
                <p className="text-[11px] text-muted-foreground/50 mb-6">正在生成首幕…</p>
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-foreground/[0.04] animate-pulse" />
                  <div className="h-3 w-11/12 rounded bg-foreground/[0.04] animate-pulse" />
                  <div className="h-3 w-4/5 rounded bg-foreground/[0.04] animate-pulse" />
                </div>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto">
                {currentNode && (
                  <>
                    {/* 场景标题 */}
                    <div className="mb-6">
                      <h2 className="text-lg font-semibold text-foreground/90 mb-1">
                        {currentNode.title}
                      </h2>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground/60">
                        {currentNode.locationName && (
                          <span>{currentNode.locationName}</span>
                        )}
                        {currentNode.characters && currentNode.characters.length > 0 && (
                          <span>
                            出场：
                            {currentNode.characters.length > 3
                              ? `${currentNode.characters.slice(0, 3).join('、')} 等 ${currentNode.characters.length} 人`
                              : currentNode.characters.join('、')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 叙事文本 */}
                    <div className="relative">
                      <div className="absolute inset-0 -mx-4 -my-2 rounded-2xl opacity-[0.03] pointer-events-none"
                        style={{
                          background: 'linear-gradient(135deg, var(--foreground) 0%, transparent 60%)',
                        }}
                      />
                      <div className="relative text-[15px] leading-relaxed text-foreground/80 whitespace-pre-line font-serif">
                        {narrationText}
                      </div>
                    </div>
                  </>
                )}

                {/* 流式预览（推进中） */}
                {streamDisplay && (
                  <div className="mt-4 relative">
                    <div className="absolute inset-0 -mx-4 -my-2 rounded-2xl opacity-[0.03] pointer-events-none"
                      style={{
                        background: 'linear-gradient(135deg, var(--foreground) 0%, transparent 60%)',
                      }}
                    />
                    <div className="relative text-[15px] leading-relaxed text-foreground/80 whitespace-pre-line font-serif">
                      {streamDisplay}
                      <span className="inline-block w-1 h-4 bg-foreground/40 ml-0.5 align-middle animate-pulse" />
                    </div>
                  </div>
                )}

                {/* 生成中断提示（SSE 断开但已发出请求） */}
                {!streaming && !loading && pendingRetryVisible && (
                  <button
                    onClick={() => void retry()}
                    className="mt-4 flex items-center gap-1.5 text-[11px] text-amber-600/80 bg-transparent border border-amber-500/30 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-amber-500/[0.06]"
                  >
                    <RefreshCw size={11} />
                    生成中断，点击重试
                  </button>
                )}

                {renderEndArea()}
                {renderAgentSubmitView()}
              </div>
            )}
          </div>

          {/* 决策选项 */}
          {currentNodeHasOptions && (
            <div className="px-8 py-5 border-t border-border/30 bg-card/50 flex-shrink-0">
              <div className="max-w-2xl mx-auto">
                <p className="text-[11px] text-muted-foreground/60 mb-3">
                  {perspective === 'first' && viewName ? '你想做什么？' : '接下来会发生什么？'}
                </p>
                <div className="flex flex-wrap gap-3">
                  {currentNode!.options.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => handleOptionClick(option.text)}
                      disabled={streaming}
                      className={cn(
                        'flex items-center gap-2 px-5 py-3 rounded-xl transition-all duration-200 border bg-card cursor-pointer',
                        'border-border/50 hover:border-foreground/20 hover:bg-foreground/[0.02] hover:shadow-sm',
                        'text-[13px] text-foreground/70 text-left group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border/50 disabled:hover:bg-card disabled:hover:shadow-none',
                      )}
                    >
                      <span className="flex-1">{applyPerspective(option.text)}</span>
                      <ChevronRight size={14} className="text-muted-foreground/30 group-hover:text-foreground/40 transition-colors" />
                    </button>
                  ))}
                </div>

                {/* 自定义输入框 */}
                <div className="mt-4 flex items-center gap-2">
                  <input
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value.slice(0, 200))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCustomSubmit();
                    }}
                    disabled={streaming}
                    placeholder="或输入你想做的事…"
                    className="flex-1 h-9 px-3 rounded-lg text-[12px] bg-background/60 border border-border/40 focus:outline-none focus:border-foreground/30 disabled:opacity-50"
                  />
                  <button
                    onClick={handleCustomSubmit}
                    disabled={streaming || !customInput.trim()}
                    className="h-9 px-4 rounded-lg text-[12px] font-medium bg-foreground text-background border-none cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {streaming ? '推演中…' : '发送'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 决策链侧栏 */}
        {showDecisions && (
          <div
            className="w-64 border-l border-border/30 bg-card/50 flex-shrink-0 overflow-hidden flex flex-col"
            style={{ animation: 'slideInRight 0.2s ease-out' }}
          >
            <div className="px-4 py-3 border-b border-border/20 flex-shrink-0">
              <span className="text-[11px] font-medium text-muted-foreground">决策记录</span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {decisionChain.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/50 text-center py-8">
                  暂无决策记录
                </p>
              ) : (
                decisionChain.map((d, i) => {
                  const targetIndex = decisionNodeIndices[i];
                  const active = targetIndex === currentSceneId;
                  return (
                    <button
                      key={d.id}
                      onClick={() => targetIndex >= 0 && goToNode(targetIndex)}
                      className={cn(
                        'w-full text-left space-y-1 bg-transparent border-none cursor-pointer rounded-lg px-1 py-1 transition-colors',
                        active && 'bg-foreground/[0.04]',
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-foreground/[0.06] flex items-center justify-center text-[9px] text-foreground/50 font-medium flex-shrink-0">
                          {d.id}
                        </span>
                        <span className={cn('text-[11px] font-medium truncate', active ? 'text-foreground/90' : 'text-foreground/70')}>
                          {d.sceneTitle}
                        </span>
                      </span>
                      <span className="block pl-5.5">
                        <span className="text-[11px] text-muted-foreground/80 leading-relaxed">
                          → {applyPerspective(d.chosenOption)}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            {decisionChain.length > 0 && (
              <div className="px-4 py-3 border-t border-border/20 flex-shrink-0">
                <button
                  onClick={() => isEnded ? void handleSubmitToWorkflow() : openEndConfirm('submit')}
                  disabled={submitState === 'summarizing' || submitState === 'streaming'}
                  className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md text-[11px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-50"
                >
                  <Send size={11} />
                  提交到工作流（{decisionChain.length} 步）
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {renderCharacterPicker()}
      {renderEndConfirm()}

      <style jsx global>{`
        @keyframes storyflow-in {
          from { opacity: 0; transform: scale(1.02); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
