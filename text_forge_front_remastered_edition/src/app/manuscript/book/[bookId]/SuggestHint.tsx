'use client';

import { Sparkles } from 'lucide-react';
import { useManuscriptStore } from './store';

export function SuggestHint() {
  const show = useManuscriptStore((s) => s.showSuggestHint);
  const dismiss = useManuscriptStore((s) => s.dismissSuggestHint);
  if (!show) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Sparkles size={14} className="text-foreground/70 shrink-0 mt-0.5" />
      <p className="flex-1 leading-relaxed">
        写作时输入 <kbd className="rounded bg-background px-1 font-sans">@</kbd> 选择角色、<kbd className="rounded bg-background px-1 font-sans">#</kbd> 选择设定；停下来时，会自动提示相关角色和设定，让正文与人物、世界观保持一致。
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 text-muted-foreground/70 hover:text-foreground text-xs underline-offset-2 hover:underline bg-transparent border-none cursor-pointer"
      >
        知道了
      </button>
    </div>
  );
}
