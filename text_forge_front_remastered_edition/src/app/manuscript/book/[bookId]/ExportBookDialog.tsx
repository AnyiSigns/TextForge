'use client';

import { FileText, BookOpen } from 'lucide-react';

interface ExportBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (format: 'txt' | 'markdown') => void;
}

export function ExportBookDialog({ open, onOpenChange, onExport }: ExportBookDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70" onClick={() => onOpenChange(false)}>
      <div
        className="w-[320px] max-w-[92vw] rounded-lg border border-border bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">导出书籍正文</h3>
          <p className="text-xs text-muted-foreground mt-1">仅导出手稿章节正文（不含设定/角色）。</p>
        </div>
        <div className="flex gap-2 p-4">
          <button
            onClick={() => onExport('txt')}
            className="flex-1 flex items-center justify-center gap-1 h-9 rounded-md text-xs font-medium bg-foreground text-background border-none cursor-pointer hover:opacity-90"
          >
            <FileText size={14} /> 纯文本 (TXT)
          </button>
          <button
            onClick={() => onExport('markdown')}
            className="flex-1 flex items-center justify-center gap-1 h-9 rounded-md text-xs border border-border cursor-pointer bg-transparent hover:bg-muted"
          >
            <BookOpen size={14} /> Markdown
          </button>
        </div>
        <div className="px-4 pb-3 flex justify-end">
          <button
            onClick={() => onOpenChange(false)}
            className="h-8 px-4 rounded-md text-xs border border-border cursor-pointer bg-transparent hover:bg-muted"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
