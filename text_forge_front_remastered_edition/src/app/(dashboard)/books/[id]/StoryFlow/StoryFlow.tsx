'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  X, ArrowLeft, Eye, GitBranch, Send, ChevronRight, History,
  RefreshCw, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import { useStoryFlowStore } from '@/features/map/stores/storyFlowStore';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useStoryFlowSubmit } from './useStoryFlowSubmit';
import { CharacterPicker } from './CharacterPicker';
import { EndConfirmModal } from './EndConfirmModal';
import { AgentSubmitView } from './AgentSubmitView';
import { DecisionSidebar } from './DecisionSidebar';
import { StoryFlowHistoryModal } from './StoryFlowHistoryModal';

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function StoryFlow() {
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const {
    submitState, agentReply, nodeStatuses, reviewData, agentThreadId,
    handleSubmitToWorkflow, goToAgentPanel, abortActive,
  } = useStoryFlowSubmit();

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
  // 回看态：currentSceneId 指向历史节点（< 最新下标）时禁用选项与自定义输入，
  // 防止把历史选项文本提交到最新节点污染决策链（后端另有 nodeSeq 乐观锁兜底）。
  const isViewingHistory = nodes.length > 0 && currentSceneId < nodes.length - 1;
  const currentNodeHasOptions = currentNode && currentNode.options.length > 0 && !isEnded && !isViewingHistory;
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
    abortActive();
    if (agentThreadId && submitState !== 'idle') {
      toast.info('推演摘要已提交到 Agent 会话，可在 Agent 面板查看');
    }
    close();
  }, [abortActive, agentThreadId, submitState, close]);

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

  // 历史推演恢复：中止当前生成后直接 restore 覆盖（restore 全量 set 状态，无需先 close）
  const openHistoryFlow = (flowId: number) => {
    useStoryFlowStore.getState().abortController?.abort();
    setHistoryOpen(false);
    void useStoryFlowStore.getState().restore(flowId);
  };

  const confirmEnd = async () => {
    setEndConfirmOpen(false);
    await finishFlow();
    if (endAction === 'submit') {
      await handleSubmitToWorkflow();
    }
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

          {/* 结束推演（active 显示，completed 隐藏；流式/生成中禁用，防与生成并发写） */}
          {!isEnded && (
            <button
              onClick={() => openEndConfirm('finish')}
              disabled={streaming || loading}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] bg-transparent border border-border/40 text-muted-foreground/60 hover:text-foreground/70 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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

          {/* 历史推演入口 */}
          <button
            onClick={() => setHistoryOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] bg-transparent border border-border/40 text-muted-foreground/60 hover:text-foreground/60 cursor-pointer"
          >
            <History size={11} />
            历史推演
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
                <AgentSubmitView
                  submitState={submitState}
                  nodeStatuses={nodeStatuses}
                  agentReply={agentReply}
                  reviewData={reviewData}
                  onRetry={() => void handleSubmitToWorkflow()}
                  onGoAgentPanel={goToAgentPanel}
                />
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

          {/* 回看历史节点提示（选项已禁用，防止误提交） */}
          {isViewingHistory && (
            <div className="px-8 py-4 border-t border-border/30 bg-card/50 flex-shrink-0">
              <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted-foreground/60">
                  正在回看历史节点，选项已锁定
                </p>
                <button
                  onClick={() => goToNode(nodes.length - 1)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] bg-foreground text-background border-none cursor-pointer hover:opacity-90"
                >
                  <ArrowLeft size={11} className="rotate-180" />
                  返回最新场景
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 决策链侧栏 */}
        <DecisionSidebar
          open={showDecisions}
          decisionChain={decisionChain}
          decisionNodeIndices={decisionNodeIndices}
          currentSceneId={currentSceneId}
          submitState={submitState}
          applyPerspective={applyPerspective}
          onGoToNode={goToNode}
          onSubmit={() => (isEnded ? void handleSubmitToWorkflow() : openEndConfirm('submit'))}
        />
      </div>

      <CharacterPicker
        open={pickCharacterOpen}
        chapterTitle={triggerChapter?.title}
        characters={availableCharacters}
        onChoose={(charId) => void chooseViewCharacter(charId)}
        onSkip={() => void skipViewCharacter()}
      />
      <EndConfirmModal
        open={endConfirmOpen}
        remainingEvents={remainingEvents}
        onConfirm={() => void confirmEnd()}
        onCancel={() => setEndConfirmOpen(false)}
      />
      <StoryFlowHistoryModal
        open={historyOpen}
        bookId={useEntityStore.getState().book?.id ?? 0}
        onClose={() => setHistoryOpen(false)}
        onOpenFlow={openHistoryFlow}
      />

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
