// src/components/workflow/RagConfigPopover.tsx
'use client';

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { RagFilter } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  filter?: RagFilter;
  docOptions: { id: string; name: string; uploaderName?: string }[];
  onChange: (f: RagFilter) => void;
  inline?: boolean;
}

export function RagConfigPopover({ filter, docOptions, onChange, inline = false }: Props) {
  const [open, setOpen] = useState(false);
  const [docQuery, setDocQuery] = useState('');
  const [authorInput, setAuthorInput] = useState('');
  const [sampleInput, setSampleInput] = useState('');

  const docIds = filter?.docIds ?? [];
  const authorIds = filter?.authorIds ?? [];
  const sample = filter?.sample ?? '';

  const toggleDoc = (id: string) => {
    const next = docIds.includes(id) ? docIds.filter((d) => d !== id) : [...docIds, id];
    onChange({ ...filter, docIds: next });
  };

  const toggleAuthor = (name: string) => {
    const next = authorIds.includes(name) ? authorIds.filter((a) => a !== name) : [...authorIds, name];
    onChange({ ...filter, authorIds: next });
  };

  const matchedDocs = useMemo(() => {
    const q = docQuery.trim().toLowerCase();
    if (q) {
      return docOptions.filter((d) => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q));
    }
    return docOptions.slice(0, 3);
  }, [docQuery, docOptions]);

  const content = (
    <div className="space-y-3 text-xs">
      <div className="space-y-2">
        <p className="text-[10px] text-muted-foreground">按文件名（可多选）</p>
        <input
          value={docQuery}
          onChange={(e) => setDocQuery(e.target.value)}
          placeholder="输入文件名搜索"
          className="w-full rounded-md border border-border bg-background/50 px-2 py-1 text-[11px]"
        />
        <div className="flex flex-wrap gap-1">
          {matchedDocs.map((d) => {
            const selected = docIds.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => toggleDoc(d.id)}
                className={cn(
                  'px-2 py-0.5 rounded-full border text-[11px]',
                  selected ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent/40',
                )}
              >
                {d.name}
              </button>
            );
          })}
          {matchedDocs.length === 0 && (
            <span className="text-muted-foreground text-[11px]">未找到匹配文档</span>
          )}
          {!docQuery && docOptions.length > 3 && (
            <span className="text-[11px] text-muted-foreground">还有 {docOptions.length - 3} 个文档，请输入搜索</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] text-muted-foreground">按作者（可多选）</p>
        <input
          value={authorInput}
          onChange={(e) => setAuthorInput(e.target.value)}
          placeholder="输入作者名后回车添加"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && authorInput.trim()) {
              const name = authorInput.trim();
              if (!authorIds.includes(name)) toggleAuthor(name);
              setAuthorInput('');
            }
          }}
          className="w-full rounded-md border border-border bg-background/50 px-2 py-1 text-[11px]"
        />
        <div className="flex flex-wrap gap-1">
          {authorIds.map((a) => (
            <span key={a} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-[11px]">
              {a}
              <button type="button" onClick={() => toggleAuthor(a)}><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-[10px] text-muted-foreground">自定义文本（按此语义检索）</p>
        <textarea
          value={sampleInput || sample}
          onChange={(e) => {
            setSampleInput(e.target.value);
            onChange({ ...filter, sample: e.target.value || undefined, docIds: [], authorIds: [] });
          }}
          rows={2}
          placeholder="贴一段你想要的风格/情节的文字，系统按它找相似的资料"
          className="w-full rounded-md border border-border bg-background/50 p-2 text-[11px] resize-none"
        />
      </div>
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-2 py-1 rounded-md border border-dashed border-primary/50 text-primary hover:bg-primary/5"
      >
        检索范围与过滤
      </button>

      {open && typeof document !== 'undefined' &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[999]" onClick={() => setOpen(false)} />
            <div className="fixed z-[1000] w-80 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover shadow-elegant p-3 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium">检索范围与过滤</span>
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
              {content}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
