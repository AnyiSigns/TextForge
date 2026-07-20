// src/components/projects/ProjectGuide.tsx
'use client';

import { cn } from '@/lib/utils';
import { Check, Circle, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface GuideStep {
  key: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** 该步骤是否已完成（用于打勾） */
  done: boolean;
  /** 点击后跳转到哪个 ProcessNav 标签 */
  tab: string;
}

export function ProjectGuide({
  steps,
  onJump,
}: {
  steps: GuideStep[];
  onJump: (tab: string) => void;
}) {
  // 第一个未完成步骤 = 当前建议做的下一步
  const currentIndex = steps.findIndex((s) => !s.done);
  const allDone = currentIndex === -1;

  return (
    <div className="glass-card rounded-2xl p-3.5 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <span className="text-primary">●</span> 创作流程
        </p>
        <p className="text-xs text-muted-foreground">
          {allDone ? '全部就绪，可继续生成' : `第 ${currentIndex + 1} 步 · 共 ${steps.length} 步`}
        </p>
      </div>

      <div className="flex items-stretch gap-1.5 sm:gap-2 overflow-x-auto pb-1">
        {steps.map((s, i) => {
          const isCurrent = i === currentIndex;
          const isDone = s.done;
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              onClick={() => onJump(s.tab)}
              className={cn(
                'group flex-1 min-w-[120px] text-left rounded-xl border p-2.5 sm:p-3 transition-all',
                isCurrent
                  ? 'border-primary/40 bg-primary/[0.06] shadow-sm'
                  : isDone
                    ? 'border-border/60 hover:border-primary/30 bg-background/30'
                    : 'border-border/40 bg-background/20 hover:bg-background/40',
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'grid place-items-center w-6 h-6 rounded-full shrink-0 ring-1 transition',
                    isDone
                      ? 'bg-primary text-primary-foreground ring-primary/30'
                      : isCurrent
                        ? 'bg-primary/10 text-primary ring-primary/30'
                        : 'bg-muted text-muted-foreground ring-border/60',
                  )}
                >
                  {isDone ? (
                    <Check className="w-3.5 h-3.5" strokeWidth={2.4} />
                  ) : (
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.9} />
                  )}
                </span>
                <span className={cn('text-xs font-semibold', isCurrent ? 'text-foreground' : 'text-foreground/80')}>
                  {s.label}
                </span>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground mt-1.5 pr-1">
                {isCurrent ? s.hint : isDone ? '已完成' : s.hint}
              </p>
              {isCurrent && (
                <span className="inline-flex items-center gap-0.5 text-[11px] text-primary mt-1.5 font-medium">
                  去操作 <ArrowRight className="w-3 h-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { Circle };
