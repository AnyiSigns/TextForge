'use client';

import { useState } from 'react';
import { Check, X, Pencil, FileText } from 'lucide-react';

interface WriteReviewCardProps {
  title: string;
  subtitle?: string;
  content: string;
  onAllow: (content: string) => void;
  onReject: () => void;
}

export function WriteReviewCard({ title, subtitle, content, onAllow, onReject }: WriteReviewCardProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(content);

  return (
    <div className="w-full max-h-full flex flex-col rounded-lg border border-border bg-background shadow-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
        <FileText size={13} className="text-foreground/70" />
        <span className="text-[12px] font-semibold">{title}</span>
        <span className="text-[10px] text-muted-foreground/70 ml-auto">{subtitle}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {editing ? (
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full h-44 rounded-md text-[12px] leading-relaxed p-2 bg-background border border-border resize-none focus:outline-none font-[var(--font-serif),serif]"
          />
        ) : (
          <pre className="whitespace-pre-wrap break-words text-[12px] leading-relaxed font-[var(--font-serif),serif] max-h-52 overflow-y-auto">
            {content}
          </pre>
        )}
      </div>
      <div className="flex gap-1.5 p-2 border-t border-border/60">
        <button
          onClick={() => onAllow(editing ? editText : content)}
          className="flex-1 h-7 rounded-md bg-foreground text-background text-[11px] font-medium border-none cursor-pointer hover:opacity-90 flex items-center justify-center gap-1"
        >
          <Check size={12} /> 允许写入
        </button>
        <button
          onClick={() => setEditing((v) => !v)}
          className="flex-1 h-7 rounded-md border border-border text-[11px] cursor-pointer bg-transparent hover:bg-muted flex items-center justify-center gap-1"
        >
          <Pencil size={12} /> {editing ? '完成' : '自定义'}
        </button>
        <button
          onClick={onReject}
          className="flex-1 h-7 rounded-md border border-border text-[11px] cursor-pointer bg-transparent hover:bg-muted flex items-center justify-center gap-1"
        >
          <X size={12} /> 拒绝
        </button>
      </div>
    </div>
  );
}
