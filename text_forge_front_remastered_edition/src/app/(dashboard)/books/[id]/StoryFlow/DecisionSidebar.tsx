'use client';

/**
 * 剧情流：决策链侧栏（从 StoryFlow.tsx 内联 JSX 抽离）。
 * 展示已做选择的节点列表，支持点击回看；底部提交到工作流。
 */
import { Send } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { Decision } from '@/features/map/stores/storyFlowStore';
import type { SubmitState } from './useStoryFlowSubmit';

interface DecisionSidebarProps {
  open: boolean;
  decisionChain: Decision[];
  /** 决策链下标 → nodes 下标映射（点击历史条目回看） */
  decisionNodeIndices: number[];
  currentSceneId: number;
  submitState: SubmitState;
  /** 场景流式生成中：禁用提交，防与生成并发写 */
  streaming: boolean;
  applyPerspective: (text: string) => string;
  onGoToNode: (index: number) => void;
  /** isEnded ? 提交到工作流 : 打开结束确认（submit 动作） */
  onSubmit: () => void;
}

export function DecisionSidebar({
  open,
  decisionChain,
  decisionNodeIndices,
  currentSceneId,
  submitState,
  streaming,
  applyPerspective,
  onGoToNode,
  onSubmit,
}: DecisionSidebarProps) {
  if (!open) return null;

  return (
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
                onClick={() => targetIndex >= 0 && onGoToNode(targetIndex)}
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
            onClick={onSubmit}
            disabled={submitState === 'summarizing' || submitState === 'streaming' || streaming}
            className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md text-[11px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-50"
          >
            <Send size={11} />
            提交到工作流（{decisionChain.length} 步）
          </button>
        </div>
      )}
    </div>
  );
}
