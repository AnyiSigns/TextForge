// src/features/manuscript/ui/SuggestHint.tsx
'use client';

import { Sparkles } from 'lucide-react';

interface SuggestHintProps {
  show: boolean;
  onDismiss: () => void;
}

export function SuggestHint({ show, onDismiss }: SuggestHintProps) {
  if (!show) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-2 text-xs text-muted-foreground">
      <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <p className="flex-1 leading-relaxed">
        写作时输入 <kbd className="rounded bg-background/60 px-1 font-sans">@</kbd> 选择角色、<kbd className="rounded bg-background/60 px-1 font-sans">#</kbd> 选择设定；停下来时，会自动提示相关角色和设定，让正文与人物、世界观保持一致。
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-muted-foreground/70 hover:text-foreground text-xs underline-offset-2 hover:underline"
      >
        知道了
      </button>
    </div>
  );
}
