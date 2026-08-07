'use client';

import { ArrowRight } from 'lucide-react';

interface ImportBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookName: string;
  chapters: { title: string; content: string }[];
  onConfirm: () => void | Promise<void>;
}

export function ImportBookDialog({ open, onOpenChange, bookName, chapters, onConfirm }: ImportBookDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70" onClick={() => onOpenChange(false)}>
      <div
        className="w-[420px] max-w-[92vw] max-h-[80vh] rounded-lg border border-border bg-background shadow-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">导入书籍：{bookName}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            已识别 {chapters.length} 个章节，将按章节顺序创建到本书首卷（本地续写）。
          </p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-1">
          {chapters.slice(0, 100).map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px] py-1 border-b border-border/40 last:border-0">
              <span className="text-muted-foreground w-6 shrink-0 text-right">{i + 1}</span>
              <span className="flex-1 truncate">{c.title}</span>
              <span className="text-muted-foreground/70 shrink-0">{c.content.length} 字</span>
            </div>
          ))}
          {chapters.length > 100 && (
            <div className="text-[11px] text-muted-foreground text-center py-1">…还有 {chapters.length - 100} 章</div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={() => onOpenChange(false)}
            className="h-8 px-4 rounded-md text-xs border border-border cursor-pointer bg-transparent hover:bg-muted"
          >
            取消
          </button>
          <button
            onClick={() => { void onConfirm(); }}
            className="flex items-center gap-1 h-8 px-4 rounded-md text-xs font-medium bg-foreground text-background border-none cursor-pointer hover:opacity-90"
          >
            <ArrowRight size={12} /> 导入 {chapters.length} 章
          </button>
        </div>
      </div>
    </div>
  );
}
