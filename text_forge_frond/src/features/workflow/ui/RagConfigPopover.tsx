// src/components/workflow/RagConfigPopover.tsx
//
// RAG 节点检索配置悬浮窗（作家友好，少术语）。
// 三种模式：
//   1) 自动搜（默认）：系统按你正在写的内容自动从资料库找相关片段
//   2) 限定范围：只在你勾选的书 / 作者里找（可多选）
//   3) 给样本搜：你贴一段文字，按它的意思去找相似的资料
// help 问号 hover 显示白话解释。
//
// 弹层用 Portal 渲染到 body，并用 fixed 定位在触发器左侧，
// 彻底脱离右侧属性面板的层叠上下文与文档流，避免被下方卡片遮挡。

'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';
import type { RagFilter } from '@/types';
import { cn } from '@/lib/utils';

function Help({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group ml-1 align-middle">
      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-44 rounded-lg bg-popover text-popover-foreground text-[11px] leading-snug p-2 shadow-elegant opacity-0 group-hover:opacity-100 transition-opacity z-[1000]">
        {text}
      </span>
    </span>
  );
}

interface Props {
  filter?: RagFilter;
  docOptions: { id: string; name: string; uploaderName?: string }[];
  onChange: (f: RagFilter) => void;
}

export function RagConfigPopover({ filter, docOptions, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [docInput, setDocInput] = useState('');
  const [authorInput, setAuthorInput] = useState('');

  const docIds = filter?.docIds ?? [];
  const authorIds = filter?.authorIds ?? [];
  const sample = filter?.sample ?? '';

  const toggleDoc = (id: string) =>
    onChange({ ...filter, docIds: docIds.includes(id) ? docIds.filter((d) => d !== id) : [...docIds, id] });
  const toggleAuthor = (name: string) =>
    onChange({ ...filter, authorIds: authorIds.includes(name) ? authorIds.filter((a) => a !== name) : [...authorIds, name] });

  // 自动搜：无任何范围/样本限定
  const isAuto = docIds.length === 0 && authorIds.length === 0 && !sample.trim();

  // 当前选中的模式（本地 state 驱动 radio 高亮，避免切到「限定范围/样本」后
  // 因尚未填子项而被 isAuto 派生判定拉回「自动搜」）
  const initialMode: 'auto' | 'scope' | 'sample' =
    sample.trim() ? 'sample' : docIds.length || authorIds.length ? 'scope' : 'auto';
  const [mode, setMode] = useState<'auto' | 'scope' | 'sample'>(initialMode);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-2 py-1 rounded-md border border-dashed border-primary/50 text-primary hover:bg-primary/5"
      >
        检索设置{isAuto ? '（自动搜）' : '（已自定义）'}
      </button>

      {open && typeof document !== 'undefined' &&
        createPortal(
          <>
            {/* 透明遮罩：点击空白处关闭 */}
            <div
              className="fixed inset-0 z-[999]"
              onClick={() => setOpen(false)}
            />
            <div
              className="fixed z-[1000] w-80 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover shadow-elegant p-3 space-y-3 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">参考资料怎么搜</span>
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>

              {/* 模式一：自动搜 */}
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="radio" checked={mode === 'auto'} onChange={() => { setMode('auto'); onChange({ sample: undefined, docIds: [], authorIds: [] }); }} className="mt-0.5 accent-primary" />
                <span>
                  <span className="font-medium">自动搜</span>
                  <Help text="系统按你正在写的内容，自动从你的资料库里找相关的片段。" />
                  <p className="text-muted-foreground mt-0.5">什么都不用选，系统看懂你写到哪，自动找资料。</p>
                </span>
              </label>

              {/* 模式二：限定范围 */}
              <div className="rounded-lg border border-border/60 p-2 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={mode === 'scope'} onChange={() => { setMode('scope'); onChange({ ...filter, sample: undefined }); }} className="accent-primary" />
                  <span className="font-medium">限定范围</span>
                  <Help text="只在你选中的书或作者里找资料，不看别的。" />
                </label>

                <div>
                  <p className="text-muted-foreground mb-1">按书名（可多选）</p>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {docOptions.map((d) => (
                      <button key={d.id} type="button" onClick={() => toggleDoc(d.id)}
                        className={cn('px-2 py-0.5 rounded-full border text-[11px]', docIds.includes(d.id) ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>
                        {d.name}
                      </button>
                    ))}
                    {docOptions.length === 0 && <span className="text-muted-foreground">你还没上传个人文档</span>}
                  </div>
                  <input value={docInput} onChange={(e) => setDocInput(e.target.value)} placeholder="输入书名后回车添加"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && docInput.trim()) {
                        const name = docInput.trim();
                        if (!docIds.includes(name)) onChange({ ...filter, docIds: [...docIds, name] });
                        setDocInput('');
                      }
                    }}
                    className="w-full rounded-md border border-border bg-background/50 px-2 py-1 text-[11px]" />
                  {docIds.filter((id) => !docOptions.some((d) => d.id === id)).map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 mt-1 mr-1 px-2 py-0.5 rounded-full bg-secondary text-[11px]">
                      {id}<button onClick={() => toggleDoc(id)}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>

                <div>
                  <p className="text-muted-foreground mb-1">按作者（可多选）</p>
                  <input value={authorInput} onChange={(e) => setAuthorInput(e.target.value)} placeholder="输入作者名后回车添加"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && authorInput.trim()) {
                        const name = authorInput.trim();
                        if (!authorIds.includes(name)) onChange({ ...filter, authorIds: [...authorIds, name] });
                        setAuthorInput('');
                      }
                    }}
                    className="w-full rounded-md border border-border bg-background/50 px-2 py-1 text-[11px]" />
                  <div className="flex flex-wrap gap-1 mt-1">
                    {authorIds.map((a) => (
                      <span key={a} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-[11px]">
                        {a}<button onClick={() => toggleAuthor(a)}><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* 模式三：给样本搜 */}
              <div className="rounded-lg border border-border/60 p-2 space-y-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={mode === 'sample'} onChange={() => { setMode('sample'); onChange({ ...filter, docIds: [], authorIds: [], sample: sample || '' }); }} className="accent-primary" />
                  <span className="font-medium">给样本搜</span>
                  <Help text="你贴一段文字，系统按它的意思去找相似的资料。" />
                </label>
                <textarea
                  value={sample}
                  onChange={(e) => onChange({ ...filter, docIds: [], authorIds: [], sample: e.target.value })}
                  rows={3}
                  placeholder="贴一段你想要的风格/情节的文字，系统按它找相似的资料"
                  className="w-full rounded-md border border-border bg-background/50 p-2 text-[11px] resize-none"
                />
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
