'use client';

import { useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Lock, RefreshCw } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useInitializerStore, STEP_LABELS } from '@/features/map/stores/initializerStore';
import { FlipCard } from '@/shared/ui/FlipCard';
import { CardGrid } from '@/shared/ui/CardGrid';
import type { Card } from '@/shared/api/wizard';

export function Initializer() {
  const {
    isOpen, currentStep, candidates, lockedIds,
    close, nextStep, prevStep,
    toggleLock, regenerateCandidates, finish,
  } = useInitializerStore();

  const currentCandidates = candidates[currentStep] ?? [];
  const isLastStep = currentStep >= 6;
  const isFirstStep = currentStep <= 0;

  const toCard = useCallback(
    (candidate: (typeof currentCandidates)[number]): Card => ({
      title: candidate.title,
      fields: candidate.fields,
    }),
    [],
  );

  const handleClose = () => close();

  const handleLockToggle = (index: number) => {
    const candidate = currentCandidates[index];
    if (candidate) toggleLock(currentStep, candidate.id);
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-foreground/[0.03] backdrop-blur-[2px]"
        onClick={handleClose}
      />

      <div
        className="fixed top-0 right-0 z-50 h-full w-[520px] bg-card/98 backdrop-blur-md border-l border-border/60 shadow-2xl flex flex-col"
        style={{
          animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-border/40 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-semibold text-foreground/80">初始化器</span>
            <span className="text-[10px] text-muted-foreground/50 bg-muted/50 px-2 py-0.5 rounded">
              步骤 {currentStep + 1}/7
            </span>
          </div>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 bg-transparent border-none cursor-pointer transition-colors"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        {/* 步骤指示器 */}
        <div className="px-5 py-3 border-b border-border/30 flex-shrink-0">
          <div className="flex items-center gap-1">
            {STEP_LABELS.map((label, i) => (
              <div key={i} className="flex items-center flex-1 min-w-0">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0 transition-colors',
                    i < currentStep
                      ? 'bg-foreground/40'
                      : i === currentStep
                        ? 'bg-foreground/80 ring-2 ring-foreground/20'
                        : 'bg-border/60',
                  )}
                />
                {i < 6 && (
                  <div
                    className={cn(
                      'flex-1 h-px mx-0.5',
                      i < currentStep ? 'bg-foreground/20' : 'bg-border/40',
                    )}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex mt-1.5">
            {STEP_LABELS.map((label, i) => (
              <span
                key={i}
                className={cn(
                  'flex-1 text-center text-[9px] transition-colors',
                  i === currentStep
                    ? 'text-foreground/70 font-medium'
                    : i < currentStep
                      ? 'text-foreground/30'
                      : 'text-muted-foreground/30',
                )}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* 候选卡片区域 */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              点击卡片选中，点击<Lock size={9} className="inline mx-0.5" strokeWidth={2} />锁定保留
            </span>
            <span className="text-[10px] text-muted-foreground/50 tabular-nums">
              已选中 {currentCandidates.filter((c) => lockedIds.has(c.id)).length}/{currentCandidates.length}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {currentCandidates.map((candidate, idx) => {
              const card = toCard(candidate);
              const isLocked = lockedIds.has(candidate.id);

              return (
                <div key={candidate.id} className="relative">
                  <div
                    className={cn(
                      'relative rounded-2xl border overflow-hidden transition-all duration-200',
                      isLocked
                        ? 'border-foreground/30 bg-foreground/[0.03] shadow-sm'
                        : 'border-border/40 bg-card hover:border-foreground/15',
                    )}
                  >
                    {/* 锁定按钮 */}
                    <button
                      onClick={() => handleLockToggle(idx)}
                      className={cn(
                        'absolute top-2 right-2 z-10 w-6 h-6 flex items-center justify-center rounded-full transition-all cursor-pointer border',
                        isLocked
                          ? 'bg-foreground/10 border-foreground/30 text-foreground/70'
                          : 'bg-card/80 border-border/40 text-muted-foreground/30 hover:text-foreground/50 hover:border-foreground/20',
                      )}
                      title={isLocked ? '取消锁定' : '锁定此候选'}
                    >
                      <Lock size={11} strokeWidth={2} />
                    </button>

                    {/* 卡片内容 */}
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[13px] font-semibold text-foreground/80">
                          {candidate.title}
                        </span>
                        {isLocked && (
                          <Check size={14} className="text-foreground/50" strokeWidth={2} />
                        )}
                      </div>
                      <div className="space-y-2">
                        {candidate.fields.map((field) => (
                          <div key={field.key} className="space-y-0.5">
                            <label className="text-[10px] font-medium text-muted-foreground/60">
                              {field.key}
                            </label>
                            <p className="text-[11px] leading-relaxed text-foreground/70">
                              {field.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {currentCandidates.length === 0 && (
            <div className="text-center py-16 text-xs text-muted-foreground/50">
              暂无候选，请点击重新生成
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="px-5 py-3 border-t border-border/40 flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => regenerateCandidates()}
              className="flex items-center gap-1 h-8 px-3 rounded-md text-xs text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5 bg-transparent border border-border/40 cursor-pointer transition-colors"
            >
              <RefreshCw size={12} />
              重新生成
            </button>
            <button
              onClick={handleClose}
              className="h-8 px-3 rounded-md text-xs text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5 bg-transparent border border-border/40 cursor-pointer transition-colors"
            >
              跳过
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                onClick={prevStep}
                className="flex items-center gap-1 h-8 px-4 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 bg-transparent border border-border/40 cursor-pointer transition-colors"
              >
                <ChevronLeft size={13} />
                上一步
              </button>
            )}

            {isLastStep ? (
              <button
                onClick={finish}
                className="flex items-center gap-1 h-8 px-5 rounded-md text-xs font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer"
              >
                <Check size={13} />
                完成初始化
              </button>
            ) : (
              <button
                onClick={nextStep}
                className="flex items-center gap-1 h-8 px-5 rounded-md text-xs font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer"
              >
                下一步
                <ChevronRight size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
