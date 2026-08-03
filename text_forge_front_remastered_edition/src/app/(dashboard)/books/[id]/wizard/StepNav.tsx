'use client';

import { useMemo } from 'react';
import { cn } from '@/shared/lib/cn';
import { STEP_ORDER, STEP_LABELS } from './store';
import type { StepType } from '@/shared/api/wizard';

interface StepNavProps {
  currentStep: StepType;
  currentStepIndex: number;
  onGoToStep: (step: StepType) => void;
  completedSteps: Set<StepType>;
}

export function StepNav({ currentStep, currentStepIndex, onGoToStep, completedSteps }: StepNavProps) {
  const latestCompletedIdx = useMemo(() => {
    let max = -1;
    STEP_ORDER.forEach((s, i) => { if (completedSteps.has(s)) max = i; });
    return max;
  }, [completedSteps]);

  return (
    <div className="flex items-center justify-center gap-1.5 py-3 px-4 overflow-x-auto">
      {STEP_ORDER.map((step, idx) => {
        const isCurrent = step === currentStep;
        const isCompleted = completedSteps.has(step);
        const isClickable = isCompleted || idx <= Math.max(currentStepIndex, latestCompletedIdx);

        return (
          <button
            key={step}
            onClick={() => isClickable && onGoToStep(step)}
            disabled={!isClickable}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-colors shrink-0',
              isCurrent && 'bg-foreground text-background',
              isCompleted && !isCurrent && 'bg-secondary text-foreground/70 hover:bg-accent/20',
              !isClickable && !isCompleted && 'text-muted-foreground/40',
              !isClickable && 'cursor-not-allowed',
              isClickable && !isCurrent && 'cursor-pointer',
            )}
          >
            {isCompleted && !isCurrent ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3.5 6l1.5 1.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <span className={cn(
                'w-3 h-3 rounded-full border',
                isCurrent ? 'border-background' : 'border-current',
              )}>
                {!isCompleted && !isCurrent && (
                  <span className="block w-1.5 h-1.5 rounded-full bg-current mx-auto mt-[2px]" />
                )}
              </span>
            )}
            <span className="hidden sm:inline">{STEP_LABELS[step]}</span>
          </button>
        );
      })}
    </div>
  );
}
