'use client';

import { useState } from 'react';
import { FileText, BookOpen, FileDown } from 'lucide-react';

export type ExportFormat = 'txt' | 'md' | 'epub' | 'pdf';

export interface ExportOptions {
  includeOutline: boolean;
  includeCharacters: boolean;
}

interface ExportBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (format: ExportFormat, opts: ExportOptions) => void;
}

const FORMATS: { key: ExportFormat; label: string; hint: string }[] = [
  { key: 'txt', label: '纯文本', hint: 'TXT' },
  { key: 'md', label: 'Markdown', hint: 'MD' },
  { key: 'epub', label: 'EPUB', hint: '电子书' },
  { key: 'pdf', label: 'PDF', hint: '打印/分享' },
];

export function ExportBookDialog({ open, onOpenChange, onExport }: ExportBookDialogProps) {
  // P1-11：默认导出时包含大纲与角色设定（对齐后端常用意图）
  const [includeOutline, setIncludeOutline] = useState(true);
  const [includeCharacters, setIncludeCharacters] = useState(true);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70" onClick={() => onOpenChange(false)}>
      <div
        className="w-[340px] max-w-[92vw] rounded-lg border border-border bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">导出书籍正文</h3>
          <p className="text-xs text-muted-foreground mt-1">由服务端整书导出（支持多格式，含卷/章结构）。</p>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4">
          {FORMATS.map((f) => (
            <button
              key={f.key}
              onClick={() => onExport(f.key, { includeOutline, includeCharacters })}
              className="flex flex-col items-center gap-1 h-16 rounded-md text-xs font-medium border border-border bg-transparent cursor-pointer hover:bg-muted"
            >
              {f.key === 'txt' ? <FileText size={14} /> : f.key === 'md' ? <BookOpen size={14} /> : <FileDown size={14} />}
              <span>{f.label}</span>
              <span className="text-[9px] text-foreground/30 font-normal">{f.hint}</span>
            </button>
          ))}
        </div>
        <div className="px-4 pb-3 space-y-1.5">
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={includeOutline}
              onChange={(e) => setIncludeOutline(e.target.checked)}
              className="accent-foreground"
            />
            包含大纲
          </label>
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={includeCharacters}
              onChange={(e) => setIncludeCharacters(e.target.checked)}
              className="accent-foreground"
            />
            包含角色设定
          </label>
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
