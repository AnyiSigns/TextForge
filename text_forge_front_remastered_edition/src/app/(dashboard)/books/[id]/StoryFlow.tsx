'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { X, ArrowLeft, Eye, GitBranch, Send, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useStoryFlowStore } from '@/features/map/stores/storyFlowStore';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useBookDetailStore } from './store';
import type { Perspective } from '@/features/map/stores/storyFlowStore';

export function StoryFlow() {
  const router = useRouter();
  const bookId = useBookDetailStore((s) => s.bookId);
  const {
    isOpen, currentSceneId, perspective, decisionChain, triggerChapterId,
    close, setPerspective, makeDecision,
  } = useStoryFlowStore();

  const chapters = useEntityStore((s) => s.chapters);
  const [showDecisions, setShowDecisions] = useState(false);

  const currentScene = useStoryFlowStore.getState().getCurrentScene();
  const triggerChapter = triggerChapterId
    ? chapters.find((c) => c.id === triggerChapterId)
    : null;

  const narrationText = useMemo(() => {
    if (!currentScene) return '';
    if (perspective === 'first') {
      return currentScene.narration
        .replace(/林星辰/g, '你')
        .replace(/你的/g, '你的')
        .replace(/你/g, '你');
    }
    return currentScene.narration;
  }, [currentScene, perspective]);

  const hasOptions = currentScene && currentScene.options.length > 0;
  const isEnding = currentScene && currentScene.options.length === 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-hidden flex flex-col"
      style={{ animation: 'storyflow-in 0.3s ease-out' }}
    >
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-border/40 flex-shrink-0 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={close}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer transition-colors"
          >
            <ArrowLeft size={14} strokeWidth={1.5} />
            返回地图
          </button>
          <span className="text-muted-foreground/30">|</span>
          <span className="text-[13px] font-semibold text-foreground/80">
            剧情流
            {triggerChapter && ` · ${triggerChapter.title}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 视角切换 */}
          <div className="flex items-center bg-muted/50 rounded-lg p-0.5">
            <button
              onClick={() => setPerspective('first')}
              className={cn(
                'px-3 py-1 rounded-md text-[11px] transition-all bg-transparent border-none cursor-pointer',
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
                'px-3 py-1 rounded-md text-[11px] transition-all bg-transparent border-none cursor-pointer',
                perspective === 'third'
                  ? 'bg-card text-foreground/80 shadow-sm'
                  : 'text-muted-foreground/60 hover:text-foreground/60',
              )}
            >
              <Eye size={11} className="inline mr-1" />
              第三人称
            </button>
          </div>

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
            onClick={close}
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
          <div className="flex-1 overflow-y-auto px-8 py-8">
            {currentScene ? (
              <div className="max-w-2xl mx-auto">
                {/* 场景标题 */}
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-foreground/90 mb-1">
                    {currentScene.title}
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground/60">
                    {currentScene.locationName && (
                      <span>{currentScene.locationName}</span>
                    )}
                    {currentScene.characters && currentScene.characters.length > 0 && (
                      <span>出场：{currentScene.characters.join('、')}</span>
                    )}
                  </div>
                </div>

                {/* 叙事文本 */}
                <div className="relative">
                  {/* 地点背景占位 */}
                  <div className="absolute inset-0 -mx-4 -my-2 rounded-2xl opacity-[0.03] pointer-events-none"
                    style={{
                      background: 'linear-gradient(135deg, var(--foreground) 0%, transparent 60%)',
                    }}
                  />
                  <div className="relative text-[15px] leading-relaxed text-foreground/80 whitespace-pre-line font-serif">
                    {narrationText}
                  </div>
                </div>

                {/* 结局提示 */}
                {isEnding && (
                  <div className="mt-10 text-center">
                    <div className="text-2xl opacity-20 mb-3">✦</div>
                    <p className="text-sm text-muted-foreground/70 mb-4">
                      剧情流到此暂告一段落
                    </p>
                    <button
                      className="flex items-center gap-2 mx-auto h-10 px-6 rounded-xl text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer"
                    >
                      <Send size={13} />
                      提交到工作流
                    </button>
                    <p className="text-[10px] text-muted-foreground/40 mt-2">
                      将决策链和场景上下文提交给工作流，生成完整正文
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground/50">
                暂无场景数据
              </div>
            )}
          </div>

          {/* 决策选项 */}
          {hasOptions && (
            <div className="px-8 py-5 border-t border-border/30 bg-card/50 flex-shrink-0">
              <div className="max-w-2xl mx-auto">
                <p className="text-[11px] text-muted-foreground/60 mb-3">
                  {perspective === 'first' ? '你想做什么？' : '接下来会发生什么？'}
                </p>
                <div className="flex flex-wrap gap-3">
                  {currentScene!.options.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => makeDecision(option.id, option.text)}
                      className={cn(
                        'flex items-center gap-2 px-5 py-3 rounded-xl transition-all duration-200 bg-transparent cursor-pointer',
                        'border border-border/50 bg-card hover:border-foreground/20 hover:bg-foreground/[0.02] hover:shadow-sm',
                        'text-[13px] text-foreground/70 text-left group',
                      )}
                    >
                      <span className="flex-1">{option.text}</span>
                      <ChevronRight size={14} className="text-muted-foreground/30 group-hover:text-foreground/40 transition-colors" />
                    </button>
                  ))}
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
                decisionChain.map((d) => (
                  <div key={d.id} className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-foreground/[0.06] flex items-center justify-center text-[9px] text-foreground/50 font-medium">
                        {d.id}
                      </span>
                      <span className="text-[11px] text-foreground/70 font-medium">{d.sceneTitle}</span>
                    </div>
                    <div className="pl-5.5">
                      <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                        → {d.chosenOption}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            {decisionChain.length > 0 && (
              <div className="px-4 py-3 border-t border-border/20 flex-shrink-0">
                <button
                  onClick={() => router.push(`/workflow?book_id=${bookId}`)}
                  className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md text-[11px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer"
                >
                  <Send size={11} />
                  提交到工作流
                </button>
              </div>
            )}
          </div>
        )}
      </div>

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
