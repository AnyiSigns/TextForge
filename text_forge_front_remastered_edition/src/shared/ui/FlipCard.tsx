'use client';

import { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { cn } from '@/shared/lib/cn';
import type { Card, CardField } from '@/shared/api/wizard';

interface FlipCardProps {
  card: Card;
  index: number;
  total: number;
  step: string;
  editable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onEdit?: (index: number, card: Card) => void;
  onRemove?: (index: number) => void;
  confirmed?: boolean;
}

interface CustomDim { id: number; key: string; value: string }

const FIELD_DISPLAY: Record<string, string> = {
  'tone': '文风', 'worldview': '世界观', 'writing_taboos': '写作禁忌',
  'custom_dimensions': '自定义维度', '文风': '文风', '世界观': '世界观',
  '写作禁忌': '写作禁忌', '自定义维度': '自定义维度', '方案名称': '方案名称',
};

function displayName(key: string): string { return FIELD_DISPLAY[key] || key; }

const STEP_LABELS_MAP: Record<string, string> = {
  creative_setting: '创意设定', locations: '地点', characters: '角色',
  character_relations: '关系', timeline_foreshadowing: '时间线',
  plot_threads: '剧情线', outline: '大纲',
};

const STEP_ICONS: Record<string, string> = {
  creative_setting: '\u2726', locations: '\u25C8', characters: '\u265F',
  character_relations: '\u26AD', timeline_foreshadowing: '\u25F7',
  plot_threads: '\u2727', outline: '\u2261',
};

export function FlipCard({ card, index, total, step, editable, selected, onSelect, onEdit, onRemove, confirmed }: FlipCardProps) {
  const [editedFields, setEditedFields] = useState<CardField[]>(card.fields);
  const isCreativeSetting = step === 'creative_setting';
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const mainFields = useMemo(() => {
    if (!isCreativeSetting) return editedFields.filter((f) => f.key !== '自定义维度' && f.key !== 'custom_dimensions');
    return editedFields.filter((f) =>
      f.key !== '自定义维度' && f.key !== 'custom_dimensions' && f.key !== '方案名称',
    );
  }, [isCreativeSetting, editedFields]);

  const [customDims, setCustomDims] = useState<CustomDim[]>([]);
  const nextIdRef = useRef(0);

  useEffect(() => { setEditedFields(card.fields); }, [card]);

  useEffect(() => {
    if (!isCreativeSetting) return;
    const f = card.fields.find((f) => f.key === '自定义维度' || f.key === 'custom_dimensions');
    if (!f) { setCustomDims([]); return; }
    const raw = typeof f.value === 'string' ? f.value : JSON.stringify(f.value ?? '');
    let entries: CustomDim[];
    try {
      if (raw.trim().startsWith('{') || raw.trim().startsWith('[')) {
        const parsed = JSON.parse(raw);
        const obj = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? parsed as Record<string, unknown> : {};
        entries = Object.entries(obj).map(([k, v], i) => ({ id: i + 100, key: k, value: String(v ?? '') }));
      } else {
        const lines = raw.split('\n').filter((l) => l.trim());
        entries = lines.map((line, i) => {
          const sep = line.indexOf('：') >= 0 ? '：' : ':';
          const idx = line.indexOf(sep);
          if (idx > 0) return { id: i + 100, key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
          return { id: i + 100, key: line.trim(), value: '' };
        });
      }
    } catch { entries = []; }
    setCustomDims(entries);
    nextIdRef.current = 200 + entries.length;
  }, [card, isCreativeSetting]);

  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollTop;
  });

  const saveScroll = () => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
  };

  const handleFieldChange = (fieldKey: string, value: string) => {
    saveScroll();
    const updated = editedFields.map((f) => (f.key === fieldKey ? { ...f, value } : f));
    setEditedFields(updated);
    onEdit?.(index, { ...card, fields: updated });
  };

  const updateCustomDims = (dims: CustomDim[]) => {
    saveScroll();
    const obj: Record<string, string> = {};
    dims.forEach((d) => { obj[d.key || `\u7EF4\u5EA6${d.id}`] = d.value; });
    const jsonStr = JSON.stringify(obj);
    const existing = editedFields.find((f) => f.key === '自定义维度' || f.key === 'custom_dimensions');
    let updated: CardField[];
    if (existing) {
      updated = editedFields.map((f) =>
        (f.key === '自定义维度' || f.key === 'custom_dimensions') ? { ...f, value: jsonStr } : f,
      );
    } else {
      updated = [...editedFields, { key: '自定义维度', value: jsonStr }];
    }
    setCustomDims(dims);
    setEditedFields(updated);
    onEdit?.(index, { ...card, fields: updated });
  };

  const addCustomDim = () => {
    const newId = nextIdRef.current++;
    updateCustomDims([...customDims, { id: newId, key: '', value: '' }]);
  };

  const cellStyle =
    'text-[11px] leading-relaxed text-foreground/90 resize-none bg-transparent border-0 p-0 focus:outline-none focus:ring-0 placeholder:text-muted-foreground/20';
  const labelStyle = 'text-[10px] font-medium text-muted-foreground tracking-wider';

  return (
    <div
      className={cn(
        'relative select-none transition-all duration-200 rounded-2xl flex-shrink-0',
        onSelect && 'cursor-pointer',
      )}
      onClick={() => onSelect?.()}
    >
      {selected && (
        <div
          className="absolute -inset-1 rounded-2xl pointer-events-none"
          style={{ boxShadow: '0 0 20px rgba(28,27,26,0.25), 0 0 6px rgba(28,27,26,0.1)' }}
        />
      )}
      <div
        className={cn(
          'w-[230px] rounded-2xl border border-border overflow-hidden flex flex-col',
          'bg-card transition-colors',
          isCreativeSetting ? 'h-[480px]' : 'min-h-[320px]',
          selected && 'bg-foreground/[0.04] border-foreground/25',
        )}
      >
        {/* Header */}
        <div className="px-4 pt-3.5 pb-2 flex items-center justify-between border-b border-border/40">
          <span className="text-[10px] tracking-wider text-muted-foreground/50 font-mono tabular-nums">
            {index + 1}/{total}
          </span>
          <span className="text-[13px] font-semibold text-foreground/85 truncate max-w-[150px]">
            {card.title}
          </span>
          <span className="text-muted-foreground/30 text-sm">{STEP_ICONS[step] || '\u25C7'}</span>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3 space-y-3">
          {mainFields.map((field) => {
            const v = typeof field.value === 'string' ? field.value
              : Array.isArray(field.value) ? field.value.join('\u3001')
              : JSON.stringify(field.value);
            return (
              <div key={field.key} className="space-y-1">
                <label className={labelStyle}>{displayName(field.key)}</label>
                <textarea
                  className={cellStyle}
                  value={v}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  rows={1}
                  style={{ height: 'auto', minHeight: '2.5rem' }}
                  ref={(el) => { if (el) { el.style.height = el.scrollHeight + 'px'; } }}
                />
              </div>
            );
          })}

          {isCreativeSetting && customDims.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-border/20">
              <label className={labelStyle}>自定义维度</label>
              <div className="space-y-1.5">
                {customDims.map((dim) => (
                  <div key={dim.id} className="flex gap-1.5 group">
                    <input
                      className="w-[72px] text-[10px] bg-transparent border-0 p-0 text-foreground/80 focus:outline-none placeholder:text-muted-foreground/30"
                      value={dim.key} placeholder="名称"
                      onChange={(e) => updateCustomDims(customDims.map((d) => d.id === dim.id ? { ...d, key: e.target.value } : d))}
                    />
                    <textarea
                      className={`flex-1 text-[10px] leading-relaxed text-foreground/90 resize-none bg-transparent border-0 p-0 focus:outline-none placeholder:text-muted-foreground/20`}
                      value={dim.value} placeholder="说明" rows={1}
                      style={{ height: 'auto' }}
                      ref={(el) => { if (el) { el.style.height = el.scrollHeight + 'px'; } }}
                      onChange={(e) => updateCustomDims(customDims.map((d) => d.id === dim.id ? { ...d, value: e.target.value } : d))}
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); updateCustomDims(customDims.filter((d) => d.id !== dim.id)); }}
                      className="self-start mt-1 text-muted-foreground/20 group-hover:text-destructive/50 transition-colors text-[10px]"
                    >{'\u2715'}</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isCreativeSetting && (
            <button
              onClick={(e) => { e.stopPropagation(); addCustomDim(); }}
              className="w-full text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors py-1.5 rounded-lg border border-dashed border-border/40 hover:border-border/70"
            >+ 自定义维度</button>
          )}
        </div>

        {/* Footer actions */}
        {!confirmed && onRemove && (
          <div className="px-4 py-2 border-t border-border/30">
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(index); }}
              className="w-full py-1 text-[10px] rounded-lg text-muted-foreground/40 hover:text-destructive/60 hover:bg-destructive/5 transition-colors"
            >移除</button>
          </div>
        )}
      </div>
    </div>
  );
}
