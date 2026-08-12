'use client';

import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Check, RefreshCw, Plus, Sparkles, Layers, BookOpen, ClipboardCheck, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useInitializerStore, STEP_LABELS } from '@/features/map/stores/initializerStore';
import { useEntityStore } from '@/features/map/stores/entityStore';

/* ─── 模式徽标：初始化 / 追加（追加不覆盖已有数据） ─── */

function ModeBadge({ mode }: { mode: 'init' | 'append' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold tracking-wide border',
        mode === 'append'
          ? 'text-emerald-400/90 border-emerald-400/25 bg-emerald-400/[0.08]'
          : 'text-amber-400/90 border-amber-400/25 bg-amber-400/[0.08]',
      )}
    >
      {mode === 'append' ? <Layers size={9} /> : <Sparkles size={9} />}
      {mode === 'append' ? '追加模式' : '初始化'}
    </span>
  );
}

/* ─── 步骤指示器：数字徽章 + 连线，完成打勾 ─── */

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="px-4 py-3 border-b border-border flex-shrink-0 bg-gradient-to-b from-transparent to-foreground/[0.02]">
      <div className="flex items-start gap-0">
        {Array.from({ length: total }).map((_, i) => {
          const isDone = i < current;
          const isCurrent = i === current;
          return (
            <div key={i} className="flex-1 flex flex-col items-center min-w-0">
              <div className="flex items-center w-full">
                {i > 0 && (
                  <div
                    className={cn('h-px flex-1 transition-colors duration-500', isDone || isCurrent ? 'bg-foreground/25' : 'bg-foreground/[0.06]')}
                  />
                )}
                <div
                  className={cn(
                    'w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-300',
                    isCurrent
                      ? 'bg-foreground text-background shadow-[0_0_12px_rgba(0,0,0,0.25)] scale-110'
                      : isDone
                        ? 'bg-foreground/70 text-background'
                        : 'bg-foreground/[0.06] text-foreground/25 border border-foreground/[0.08]',
                  )}
                >
                  {isDone ? (
                    <Check size={10} strokeWidth={3} />
                  ) : (
                    <span className={cn('text-[8px] font-bold', isCurrent ? 'text-background' : 'text-foreground/30')}>{i + 1}</span>
                  )}
                </div>
              </div>
              <span
                className={cn(
                  'text-[8px] mt-1 transition-colors whitespace-nowrap',
                  isCurrent ? 'text-foreground/80 font-semibold' : isDone ? 'text-foreground/40' : 'text-foreground/15',
                )}
              >
                {STEP_LABELS[i]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 前置校验警告条（meta.warnings） ─── */

function WarningsBanner() {
  const warnings = useInitializerStore((s) => s.warnings);
  if (warnings.length === 0) return null;
  return (
    <div className="px-4 py-2 border-b border-amber-400/20 bg-amber-400/[0.06]">
      {warnings.map((w) => (
        <p key={w} className="text-[10px] leading-relaxed text-amber-500/80">
          {w}
        </p>
      ))}
    </div>
  );
}

/* ─── Step 0: Creative Setting Form（分组卡片） ─── */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider block mb-1.5">{children}</label>
  );
}

function StepCreativeSetting() {
  const creativeForm = useInitializerStore((s) => s.creativeForm);
  const setCreativeForm = useInitializerStore((s) => s.setCreativeForm);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-1.5 mb-1">
        <BookOpen size={12} className="text-foreground/35" />
        <span className="text-[11px] font-semibold text-foreground/60">方案概要</span>
      </div>

      <div className="rounded-xl border border-border bg-card p-3.5 space-y-3.5 shadow-sm">
        <div>
          <FieldLabel>方案名称</FieldLabel>
          <input value={creativeForm.name} onChange={(e) => setCreativeForm({ name: e.target.value })} placeholder="星辰纪元"
            className="w-full h-8 px-3 rounded-lg text-xs bg-background border border-border focus:outline-none focus:border-foreground/25 focus:ring-2 focus:ring-foreground/[0.06] transition-all" />
        </div>
        <div>
          <FieldLabel>文风基调</FieldLabel>
          <input value={creativeForm.tone} onChange={(e) => setCreativeForm({ tone: e.target.value })} placeholder="史诗奇幻、轻松幽默、黑暗残酷..."
            className="w-full h-8 px-3 rounded-lg text-xs bg-background border border-border focus:outline-none focus:border-foreground/25 focus:ring-2 focus:ring-foreground/[0.06] transition-all" />
        </div>
        <div>
          <FieldLabel>世界观</FieldLabel>
          <textarea value={creativeForm.worldview} onChange={(e) => setCreativeForm({ worldview: e.target.value })} rows={5}
            placeholder="一个由星辰之力驱动的奇幻世界..."
            className="w-full px-3 py-2 rounded-lg text-xs bg-background border border-border focus:outline-none focus:border-foreground/25 focus:ring-2 focus:ring-foreground/[0.06] transition-all resize-none" />
        </div>
        <div>
          <FieldLabel>写作禁忌</FieldLabel>
          <textarea value={creativeForm.taboos} onChange={(e) => setCreativeForm({ taboos: e.target.value })} rows={3}
            placeholder="禁止现代科技；禁止降智反派..."
            className="w-full px-3 py-2 rounded-lg text-xs bg-background border border-border focus:outline-none focus:border-foreground/25 focus:ring-2 focus:ring-foreground/[0.06] transition-all resize-none" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
        <div className="flex items-center justify-between mb-2.5">
          <FieldLabel>自定义字段</FieldLabel>
          <button onClick={() => setCreativeForm({ customFields: [...creativeForm.customFields, { key: '', value: '', _uid: crypto.randomUUID() }] })}
            className="flex items-center gap-1 h-6 px-2 rounded-md text-[10px] text-foreground/50 hover:text-foreground bg-foreground/[0.04] border border-border cursor-pointer transition-colors">
            <Plus size={10} />
            添加
          </button>
        </div>
        {creativeForm.customFields.length === 0 && (
          <p className="text-[10px] text-foreground/30">暂无自定义字段，可添加如战力体系、势力等</p>
        )}
        {creativeForm.customFields.map((f, i) => (
          <div key={f._uid ?? i} className="flex gap-1.5 mb-1.5 last:mb-0">
            <input value={f.key}
              onChange={(e) => {
                const updated = creativeForm.customFields.map((x, j) => j === i ? { ...x, key: e.target.value } : x);
                setCreativeForm({ customFields: updated });
              }}
              placeholder="键" className="flex-1 h-7 px-2 rounded-lg text-[11px] bg-background border border-border focus:outline-none" />
            <input value={f.value}
              onChange={(e) => {
                const updated = creativeForm.customFields.map((x, j) => j === i ? { ...x, value: e.target.value } : x);
                setCreativeForm({ customFields: updated });
              }}
              placeholder="值" className="flex-[2] h-7 px-2 rounded-lg text-[11px] bg-background border border-border focus:outline-none" />
            <button onClick={() => setCreativeForm({ customFields: creativeForm.customFields.filter((_, j) => j !== i) })}
              className="w-5 h-7 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-foreground/15 hover:text-red-500/60 transition-colors">
              <X size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── 表单确认模式：实体卡片列表（字段可编辑、条目可删、可新增空条目） ─── */

type FieldType = 'text' | 'textarea' | 'datalist' | 'tags' | 'customFields' | 'relations';

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  /** 引用下拉候选（datalist） */
  options?: string[];
  hint?: string;
}

function inputCls(compact = false) {
  return cn(
    'w-full rounded-lg text-[11px] bg-background border border-border focus:outline-none focus:border-foreground/25 transition-all',
    compact ? 'h-7 px-2' : 'h-8 px-3',
  );
}

/** 通用字段输入：text/textarea/datalist（可手填）/tags（顿号分隔）/customFields（键：值多行） */
function FieldInput({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  if (field.type === 'textarea') {
    return (
      <textarea value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} rows={3}
        placeholder={field.placeholder}
        className={cn(inputCls(), 'py-2 resize-none')} />
    );
  }
  if (field.type === 'datalist') {
    const listId = `dl-${field.key}`;
    return (
      <>
        <input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} list={listId}
          placeholder={field.placeholder ?? '从列表选择或手填'}
          className={inputCls()} />
        <datalist id={listId}>
          {(field.options ?? []).map((o) => <option key={o} value={o} />)}
        </datalist>
      </>
    );
  }
  if (field.type === 'tags') {
    const names = Array.isArray(value) ? (value as string[]) : [];
    return (
      <input value={names.join('、')}
        onChange={(e) => onChange(e.target.value.split(/[、,，]/).map((s) => s.trim()).filter(Boolean))}
        placeholder={field.placeholder ?? '用顿号分隔'}
        className={inputCls()} />
    );
  }
  if (field.type === 'customFields') {
    const map = (value && typeof value === 'object' ? value : {}) as Record<string, string>;
    const text = Object.entries(map).map(([k, v]) => `${k}：${v}`).join('\n');
    return (
      <textarea value={text}
        onChange={(e) => {
          const next: Record<string, string> = {};
          for (const line of e.target.value.split('\n')) {
            const m = line.match(/^(.+?)[:：]\s*(.*)$/);
            if (m && m[1].trim()) next[m[1].trim()] = m[2].trim();
          }
          onChange(next);
        }}
        rows={3} placeholder={'键：值（每行一条）'}
        className={cn(inputCls(), 'py-2 resize-none')} />
    );
  }
  return (
    <input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder}
      className={inputCls()} />
  );
}

/** 实体卡片：标题行（序号 + 名称预览 + 删除）+ 字段列表 */
function ItemCard({
  index, item, fields, onUpdate, onRemove, accent,
}: {
  index: number;
  item: Record<string, unknown>;
  fields: FieldDef[];
  onUpdate: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
  accent?: string;
}) {
  const preview = String(item.name ?? item.title ?? '');
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={cn('w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-background', accent ?? 'bg-foreground/50')}>
          {index + 1}
        </span>
        <span className={cn('flex-1 text-[11px] font-semibold truncate', preview ? 'text-foreground/70' : 'text-foreground/25 italic')}>
          {preview || '未命名条目'}
        </span>
        <button onClick={onRemove}
          className="w-5 h-5 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-foreground/15 hover:text-red-500/60 transition-colors"
          aria-label="删除条目">
          <Trash2 size={11} />
        </button>
      </div>
      <div className="space-y-1.5">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="text-[9px] text-foreground/35 block mb-0.5">{f.label}</label>
            <FieldInput field={f} value={item[f.key]} onChange={(v) => onUpdate({ [f.key]: v })} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* 引用候选：已有实体名称（追加模式下供下拉选择） */
function useEntityOptions() {
  const locations = useEntityStore((s) => s.locations);
  const characters = useEntityStore((s) => s.characters);
  const plotThreads = useEntityStore((s) => s.plotThreads);
  const sceneEvents = useEntityStore((s) => s.sceneEvents);
  const volumes = useEntityStore((s) => s.volumes);
  const chapters = useEntityStore((s) => s.chapters);
  const volTitleById = new Map(volumes.map((v) => [v.id, v.title]));
  return {
    locationNames: locations.map((l) => l.name),
    characterNames: characters.map((c) => c.name),
    threadNames: plotThreads.map((t) => t.name),
    eventNames: sceneEvents.map((e) => e.title),
    chapterRefs: chapters.map((c) => `${volTitleById.get(c.volumeId) ?? ''}·${c.title}`).filter((x) => !x.startsWith('·')),
  };
}

/* ── Step 1-3 / 5-6 通用卡片表单 ── */

function StepReviewForm() {
  const items = useInitializerStore((s) => s.items);
  const currentStep = useInitializerStore((s) => s.currentStep);
  const updateItem = useInitializerStore((s) => s.updateItem);
  const removeItem = useInitializerStore((s) => s.removeItem);
  const addItem = useInitializerStore((s) => s.addItem);
  const opts = useEntityOptions();
  const batchNames = Array.isArray(items) ? (items as unknown as Array<Record<string, unknown>>).map((i) => String(i.name ?? i.title ?? '')) : [];

  if (!Array.isArray(items) || currentStep === 4) return null;

  const fields: FieldDef[] = (() => {
    switch (currentStep) {
      case 1:
        return [
          { key: 'name', label: '名称', type: 'text', placeholder: '地点名称' },
          { key: 'type', label: '类型', type: 'text', placeholder: '大陆/王都/酒馆…' },
          { key: 'description', label: '描述', type: 'textarea', placeholder: '视觉特征、氛围、功能…' },
          { key: 'parentName', label: '父地点', type: 'datalist', options: [...new Set([...opts.locationNames, ...batchNames])], hint: '顶层地点可留空' },
          { key: 'customFields', label: '自定义字段', type: 'customFields' },
        ];
      case 2:
        return [
          { key: 'name', label: '姓名', type: 'text', placeholder: '角色名' },
          { key: 'roleType', label: '类型', type: 'text', placeholder: '主角/导师/宿敌…' },
          { key: 'aliases', label: '别名', type: 'tags', placeholder: '顿号分隔' },
          { key: 'status', label: '状态', type: 'text', placeholder: '当前身份/处境' },
          { key: 'spawnLocationName', label: '首次出场', type: 'datalist', options: opts.locationNames },
          { key: 'description', label: '描述', type: 'textarea', placeholder: '外貌、性格、欲望…' },
          { key: 'relationships', label: '关系链', type: 'relations', options: [...new Set([...opts.characterNames, ...batchNames])] },
          { key: 'customFields', label: '自定义字段', type: 'customFields' },
        ];
      case 3:
        return [
          { key: 'name', label: '名称', type: 'text', placeholder: '情节线名' },
          { key: 'type', label: '类型', type: 'text', placeholder: '主线/支线/暗线…' },
          { key: 'parentName', label: '父线', type: 'datalist', options: [...new Set([...opts.threadNames, ...batchNames])], hint: '独立主线可留空' },
          { key: 'description', label: '描述', type: 'textarea', placeholder: '起点 → 转折 → 终点' },
        ];
      case 5:
        return [
          { key: 'title', label: '事件名', type: 'text', placeholder: '事件名（4-10字）' },
          { key: 'chapterRef', label: '所属章节', type: 'datalist', options: opts.chapterRefs, hint: '选「卷·章」或输入章标题' },
          { key: 'timeLabel', label: '时间标签', type: 'text', placeholder: '第一天清晨' },
          { key: 'location', label: '地点', type: 'datalist', options: opts.locationNames },
          { key: 'characters', label: '角色', type: 'tags', options: opts.characterNames, placeholder: '顿号分隔' },
          { key: 'plotThreads', label: '情节线', type: 'tags', options: opts.threadNames, placeholder: '顿号分隔' },
          { key: 'summary', label: '描述', type: 'textarea', placeholder: '事件描述' },
        ];
      case 6:
        return [
          { key: 'title', label: '伏笔名', type: 'text', placeholder: '伏笔名称（4-10字）' },
          { key: 'type', label: '类型', type: 'datalist', options: ['身份谜团', '隐藏关系', '世界秘密', '预言', '物品', '背叛'] },
          { key: 'description', label: '内容描述', type: 'textarea', placeholder: '现在种什么因、将来收什么果' },
          { key: 'characters', label: '关联角色', type: 'tags', options: opts.characterNames, placeholder: '顿号分隔' },
          { key: 'relatedEvent', label: '埋下事件', type: 'datalist', options: opts.eventNames, hint: '从已有事件中选择' },
          { key: 'revealTiming', label: '揭示时机', type: 'text', placeholder: '如 第三卷决战前夕' },
        ];
      default:
        return [];
    }
  })();

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {items.map((it, i) => (
        <ItemCard
          key={i}
          index={i}
          item={it as unknown as Record<string, unknown>}
          fields={fields}
          onUpdate={(patch) => updateItem(i, patch)}
          onRemove={() => removeItem(i)}
        />
      ))}
      <button onClick={addItem}
        className="w-full h-8 rounded-lg border border-dashed border-border text-[10px] text-foreground/35 hover:text-foreground/60 hover:border-foreground/25 bg-transparent cursor-pointer transition-colors flex items-center justify-center gap-1">
        <Plus size={11} />
        新增{STEP_LABELS[currentStep]}条目
      </button>
    </div>
  );
}

/* ── Step 4：大纲嵌套表单（卷 → 章 → 场景） ── */

function OutlineReviewForm() {
  const items = useInitializerStore((s) => s.items) as Array<Record<string, unknown>> | null;
  const updateNestedItem = useInitializerStore((s) => s.updateNestedItem);
  const removeNestedItem = useInitializerStore((s) => s.removeNestedItem);
  const addNestedItem = useInitializerStore((s) => s.addNestedItem);
  const opts = useEntityOptions();

  if (!Array.isArray(items)) return null;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {items.map((vol, vi) => {
        const volChapters = Array.isArray(vol.chapters) ? vol.chapters as Array<Record<string, unknown>> : [];
        return (
          <div key={vi} className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-background bg-foreground/50">{vi + 1}</span>
              <span className={cn('flex-1 text-[11px] font-semibold truncate', String(vol.title ?? '') ? 'text-foreground/70' : 'text-foreground/25 italic')}>
                {String(vol.title ?? '') || '未命名卷'}
              </span>
              <button onClick={() => removeNestedItem(vi, null, null)}
                className="w-5 h-5 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-foreground/15 hover:text-red-500/60 transition-colors" aria-label="删除卷">
                <Trash2 size={11} />
              </button>
            </div>
            <div className="space-y-1.5 mb-2">
              <div>
                <label className="text-[9px] text-foreground/35 block mb-0.5">卷标题</label>
                <input value={String(vol.title ?? '')} onChange={(e) => updateNestedItem(vi, null, null, { title: e.target.value })}
                  className={inputCls()} placeholder="卷标题" />
              </div>
              <div>
                <label className="text-[9px] text-foreground/35 block mb-0.5">卷摘要</label>
                <textarea value={String(vol.summary ?? '')} onChange={(e) => updateNestedItem(vi, null, null, { summary: e.target.value })}
                  rows={2} className={cn(inputCls(), 'py-2 resize-none')} placeholder="本卷阶段性目标" />
              </div>
            </div>
            <div className="space-y-2 pl-3 border-l border-foreground/[0.06]">
              {volChapters.map((ch, ci) => {
                const scenes = Array.isArray(ch.scenes) ? ch.scenes as Array<Record<string, unknown>> : [];
                return (
                  <div key={ci} className="rounded-lg border border-border/80 bg-background/50 p-2.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center text-[7px] font-bold text-background bg-foreground/35">{ci + 1}</span>
                      <span className={cn('flex-1 text-[10px] font-medium truncate', String(ch.title ?? '') ? 'text-foreground/60' : 'text-foreground/25 italic')}>
                        {String(ch.title ?? '') || '未命名章'}
                      </span>
                      <button onClick={() => removeNestedItem(vi, ci, null)}
                        className="w-4 h-4 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-foreground/15 hover:text-red-500/60" aria-label="删除章">
                        <Trash2 size={9} />
                      </button>
                    </div>
                    <div className="space-y-1 mb-1.5">
                      <div className="flex gap-1.5">
                        <input value={String(ch.title ?? '')} onChange={(e) => updateNestedItem(vi, ci, null, { title: e.target.value })}
                          className={cn(inputCls(true), 'flex-1')} placeholder="章标题" />
                        <input value={String(ch.summary ?? '')} onChange={(e) => updateNestedItem(vi, ci, null, { summary: e.target.value })}
                          className={cn(inputCls(true), 'flex-[2]')} placeholder="章摘要" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {scenes.map((sc, si) => (
                        <div key={si} className="rounded-md border border-border/60 bg-card/60 p-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="w-3 h-3 rounded flex-shrink-0 flex items-center justify-center text-[7px] font-bold text-background bg-foreground/25">{si + 1}</span>
                            <span className={cn('flex-1 text-[9px] truncate', String(sc.title ?? '') ? 'text-foreground/50' : 'text-foreground/20 italic')}>
                              {String(sc.title ?? '') || '未命名场景'}
                            </span>
                            <button onClick={() => removeNestedItem(vi, ci, si)}
                              className="w-4 h-4 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-foreground/15 hover:text-red-500/60" aria-label="删除场景">
                              <Trash2 size={9} />
                            </button>
                          </div>
                          <div className="space-y-1">
                            <div className="flex gap-1.5">
                              <input value={String(sc.title ?? '')} onChange={(e) => updateNestedItem(vi, ci, si, { title: e.target.value })}
                                className={cn(inputCls(true), 'flex-1')} placeholder="场景标题" />
                              <input value={String(sc.timeLabel ?? '')} onChange={(e) => updateNestedItem(vi, ci, si, { timeLabel: e.target.value })}
                                className={cn(inputCls(true), 'flex-1')} placeholder="时间标签" />
                            </div>
                            <input list={`sc-loc-${vi}-${ci}-${si}`} value={String(sc.location ?? '')}
                              onChange={(e) => updateNestedItem(vi, ci, si, { location: e.target.value })}
                              className={cn(inputCls(true), 'w-full')} placeholder="地点（从列表选择或手填）" />
                            <datalist id={`sc-loc-${vi}-${ci}-${si}`}>
                              {opts.locationNames.map((o) => <option key={o} value={o} />)}
                            </datalist>
                            <div className="flex gap-1.5">
                              <input value={Array.isArray(sc.characters) ? (sc.characters as string[]).join('、') : ''}
                                onChange={(e) => updateNestedItem(vi, ci, si, { characters: e.target.value.split(/[、,，]/).map((s) => s.trim()).filter(Boolean) })}
                                className={cn(inputCls(true), 'flex-1')} placeholder="角色（顿号分隔）" />
                              <input value={Array.isArray(sc.plotThreads) ? (sc.plotThreads as string[]).join('、') : ''}
                                onChange={(e) => updateNestedItem(vi, ci, si, { plotThreads: e.target.value.split(/[、,，]/).map((s) => s.trim()).filter(Boolean) })}
                                className={cn(inputCls(true), 'flex-1')} placeholder="情节线（顿号分隔）" />
                            </div>
                          </div>
                        </div>
                      ))}
                      <button onClick={() => addNestedItem(vi, ci)}
                        className="w-full h-6 rounded-md border border-dashed border-border text-[9px] text-foreground/30 hover:text-foreground/55 hover:border-foreground/25 bg-transparent cursor-pointer transition-colors flex items-center justify-center gap-1">
                        <Plus size={9} /> 新增场景
                      </button>
                    </div>
                  </div>
                );
              })}
              <button onClick={() => addNestedItem(vi, null)}
                className="w-full h-6 rounded-md border border-dashed border-border text-[9px] text-foreground/30 hover:text-foreground/55 hover:border-foreground/25 bg-transparent cursor-pointer transition-colors flex items-center justify-center gap-1">
                <Plus size={9} /> 新增章
              </button>
            </div>
          </div>
        );
      })}
      <button onClick={() => addNestedItem(items.length, null)}
        className="w-full h-8 rounded-lg border border-dashed border-border text-[10px] text-foreground/35 hover:text-foreground/60 hover:border-foreground/25 bg-transparent cursor-pointer transition-colors flex items-center justify-center gap-1">
        <Plus size={11} />
        新增卷
      </button>
    </div>
  );
}

/* ── Markdown 预览（```json 块淡化展示） ── */

function MarkdownPreview({ text }: { text: string }) {
  const parts = text.split(/(```json[\s\S]*?```)/g);
  return (
    <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/60 bg-card border border-border rounded-xl p-3.5 shadow-sm">
      {parts.map((p, i) => (
        <span key={i} className={p.startsWith('```json') ? 'opacity-25 text-foreground/30' : ''}>{p}</span>
      ))}
    </pre>
  );
}

/* ── Step 1-6 流程：空态 → 流式预览 → 确认表单 ── */

function StepFlow({ step, title }: { step: number; title: string }) {
  const { stepText, streaming, generating, saving, regenerateCandidates, review, enterReview, mode } = useInitializerStore();
  const text = stepText[step] ?? '';
  const hasText = !!text.trim();

  if (review) {
    return step === 4 ? <OutlineReviewForm /> : <StepReviewForm />;
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {!hasText && !streaming ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-foreground/[0.08] to-foreground/[0.02] border border-foreground/[0.06] flex items-center justify-center mb-3.5 shadow-inner">
            <Sparkles size={16} className="text-foreground/30" />
          </div>
          <p className="text-[12px] font-semibold text-foreground/60 mb-1">还没有{title}方案</p>
          <p className="text-[10px] text-foreground/30 max-w-[260px] leading-relaxed mb-4">
            {mode === 'append'
              ? `AI 将基于已有设定为书籍补充${title}素材，不会覆盖已有内容`
              : `点击下方按钮，AI 将根据前序设定生成一份完整的${title}方案`}
          </p>
          <button
            onClick={() => void regenerateCandidates()}
            disabled={saving || generating}
            className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[11px] font-medium bg-foreground text-background hover:opacity-90 active:scale-[0.98] transition-all border-none cursor-pointer disabled:opacity-50 shadow-md shadow-foreground/10"
          >
            {generating ? (
              <span className="w-3 h-3 border-2 border-background/40 border-t-background rounded-full animate-spin" />
            ) : (
              <RefreshCw size={11} />
            )}
            {generating ? '生成中...' : `AI 生成${title}`}
          </button>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between px-0.5">
            <span className="text-[10px] text-foreground/30 flex items-center gap-1.5">
              {streaming && (
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '120ms' }} />
                  <span className="w-1 h-1 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '240ms' }} />
                </span>
              )}
              {streaming ? '正在生成...' : '生成完成，点击"确认方案"进入表单微调'}
            </span>
            {!streaming && hasText && (
              <button
                onClick={enterReview}
                className="flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-medium bg-foreground/90 text-background border-none cursor-pointer hover:opacity-90 transition-opacity"
              >
                <ClipboardCheck size={10} />
                确认方案
              </button>
            )}
          </div>
          <MarkdownPreview text={text} />
        </>
      )}
    </div>
  );
}

/* ─── Step 4 独立流式预览（保留卷进度条） ─── */

function Step4Flow() {
  const { stepText, streaming, generating, saving, regenerateCandidates, review, enterReview, volumeProgress } = useInitializerStore();
  const volumes = useEntityStore((s) => s.volumes);
  const chapters = useEntityStore((s) => s.chapters);
  const [volCount, setVolCount] = useState(2);
  const [chPerVol, setChPerVol] = useState('5,5');

  const text = stepText[4] ?? '';
  const hasText = !!text.trim();
  const showConfig = !streaming && !hasText;

  if (review) return <OutlineReviewForm />;

  if (showConfig) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-[320px] space-y-4">
          <div className="text-center flex flex-col items-center gap-1.5">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-foreground/[0.08] to-foreground/[0.02] border border-foreground/[0.06] flex items-center justify-center">
              <Layers size={15} className="text-foreground/30" />
            </div>
            <span className="text-[11px] font-semibold text-foreground/55">设定大纲参数</span>
            <span className="text-[10px] text-foreground/30 max-w-[240px] leading-relaxed">按指定卷章数流式生成单份大纲，含卷摘要、章摘要、场景节点（时间/地点/角色/情节线）</span>
          </div>
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-3 shadow-sm">
            <div>
              <label className="text-[10px] text-foreground/35 block mb-1">卷数 (1-10)</label>
              <input type="number" min={1} max={10} value={volCount}
                onChange={(e) => setVolCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                className="w-full h-8 px-3 rounded-lg text-xs bg-background border border-border focus:outline-none focus:border-foreground/25" />
            </div>
            <div>
              <label className="text-[10px] text-foreground/35 block mb-1">每卷章数（逗号分隔）</label>
              <input value={chPerVol} onChange={(e) => setChPerVol(e.target.value)}
                placeholder="5,5" className="w-full h-8 px-3 rounded-lg text-xs bg-background border border-border focus:outline-none focus:border-foreground/25" />
            </div>
            <button onClick={() => void regenerateCandidates(`卷数=${volCount} 每卷章数=${chPerVol}`)} disabled={generating || saving}
              className="w-full h-9 rounded-lg text-xs bg-foreground text-background border-none cursor-pointer font-medium disabled:opacity-50 hover:opacity-90 active:scale-[0.99] transition-all shadow-md shadow-foreground/10">
              {generating ? '生成中...' : 'AI 生成大纲方案'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <div className="mb-2 flex items-center justify-between px-0.5">
        <span className="text-[10px] text-foreground/30">
          {streaming ? '正在按卷生成大纲...' : '生成完成，点击"确认方案"进入表单微调'}
        </span>
        {!streaming && hasText && (
          <button
            onClick={enterReview}
            className="flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-medium bg-foreground/90 text-background border-none cursor-pointer hover:opacity-90 transition-opacity"
          >
            <ClipboardCheck size={10} />
            确认方案
          </button>
        )}
      </div>

      {/* 按卷生成进度条（消费 volume_end 事件） */}
      {volumeProgress && volumeProgress.total > 1 && (
        <div className="mb-2.5 rounded-lg border border-border bg-card px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-foreground/40">卷生成进度</span>
            <span className="text-[10px] font-semibold text-foreground/60">
              {volumeProgress.done}/{volumeProgress.total}
            </span>
          </div>
          <div className="h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-foreground/60 transition-all duration-500"
              style={{ width: `${(volumeProgress.done / volumeProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <MarkdownPreview text={text} />

      {/* 已保存卷/章预览 */}
      {volumes.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[10px] font-semibold text-foreground/35 uppercase tracking-wider mb-2">已生成大纲</div>
          {volumes.map((vol) => {
            const volChapters = chapters.filter((ch) => ch.volumeId === vol.id).sort((a, b) => a.sortOrder - b.sortOrder);
            return (
              <div key={vol.id} className="mb-3 rounded-xl border border-border bg-card p-3">
                <div className="text-[13px] font-bold text-foreground/80">{vol.title}</div>
                {vol.summary && <div className="text-[10px] text-foreground/35 mb-1.5">{vol.summary}</div>}
                <div className="pt-1.5 space-y-1">
                  {volChapters.map((ch) => (
                    <div key={ch.id} className="flex items-start gap-2 pl-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-foreground/[0.12] mt-1.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-foreground/70">{ch.title}</div>
                        {ch.summary && <div className="text-[10px] text-foreground/35">{ch.summary}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Main Initializer Component ─── */

export function Initializer() {
  const {
    isOpen, currentStep, mode,
    close, nextStep, prevStep,
    regenerateCandidates, finish, confirmSave,
    saving, generating, streaming, error, clearError,
    review, backToPreview, stepText, savedSteps,
  } = useInitializerStore();

  const isLastStep = currentStep >= 6;
  const isFirstStep = currentStep <= 0;
  const hasGeneratedText = !!((stepText[currentStep] ?? '').trim());
  const stepSaved = savedSteps.has(currentStep);

  const handleNextStep = () => { void nextStep(); };
  const handleFinish = () => { void finish(); };
  const handleConfirm = () => { void confirmSave(); };
  const handleRegenerate = () => { void regenerateCandidates(); };

  // 主按钮逻辑：
  // - Step 0：下一步（保存创意设定）
  // - 表单确认模式：确定落库（引用校验失败报错停留）
  // - 已生成未确认：确认方案（进入表单）
  // - 已保存 / 未生成：下一步（跳过）
  const showPrimaryReview = review;
  const showPrimaryConfirmPlan = !review && currentStep >= 1 && hasGeneratedText && !stepSaved;
  const primaryDisabled = saving || generating || streaming;

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
        onClick={close}
      />

      <div
        className="fixed top-0 right-0 z-50 h-full w-[560px] bg-background/95 backdrop-blur-md border-l border-border shadow-2xl flex flex-col theme-surface"
        style={{ animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-foreground/80">创作设定</span>
              <span className="text-[9px] text-foreground/25 bg-foreground/[0.04] px-1.5 py-0.5 rounded">
                {currentStep + 1}/7
              </span>
            </div>
            <ModeBadge mode={mode} />
          </div>
          <button onClick={close}
            className="w-6 h-6 flex items-center justify-center rounded text-foreground/20 hover:text-foreground/50 bg-transparent border-none cursor-pointer transition-colors">
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Step indicator */}
        <StepIndicator current={currentStep} total={7} />

        {/* 前置校验警告 */}
        <WarningsBanner />

        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {currentStep === 0 && <StepCreativeSetting />}
          {currentStep === 1 && <StepFlow step={1} title="地点" />}
          {currentStep === 2 && <StepFlow step={2} title="角色" />}
          {currentStep === 3 && <StepFlow step={3} title="情节线" />}
          {currentStep === 4 && <Step4Flow />}
          {currentStep === 5 && <StepFlow step={5} title="事件" />}
          {currentStep === 6 && <StepFlow step={6} title="伏笔" />}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border flex-shrink-0">
          {error && (
            <div className="flex items-start gap-1.5 mb-2 px-2.5 py-2 rounded-lg bg-red-500/[0.07] border border-red-500/15">
              <span className="text-[10px] text-red-500/80 flex-1 whitespace-pre-wrap leading-relaxed">{error}</span>
              <button onClick={clearError} className="text-[10px] text-foreground/30 hover:text-foreground/50 bg-transparent border-none cursor-pointer flex-shrink-0">关闭</button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button onClick={handleRegenerate}
                disabled={saving || generating}
                className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[10px] text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.03] bg-transparent border border-border cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                {generating ? (
                  <span className="w-3 h-3 border-2 border-foreground/20 border-t-foreground/40 rounded-full animate-spin" />
                ) : (
                  <RefreshCw size={11} />
                )}
                {generating ? '生成中...' : review ? '重新生成' : '重新生成'}
              </button>
              {review && (
                <button onClick={backToPreview}
                  disabled={saving}
                  className="h-7 px-2.5 rounded-lg text-[10px] text-foreground/30 hover:text-foreground/50 hover:bg-foreground/[0.03] bg-transparent border border-border cursor-pointer disabled:opacity-30 transition-colors">
                  返回预览
                </button>
              )}
              <button onClick={close}
                disabled={saving}
                className="h-7 px-2.5 rounded-lg text-[10px] text-foreground/30 hover:text-foreground/50 hover:bg-foreground/[0.03] bg-transparent border border-border cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                跳过
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {!isFirstStep && (
                <button onClick={prevStep}
                  disabled={saving || generating || streaming}
                  className="flex items-center gap-1 h-7 px-3 rounded-lg text-[10px] text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.03] bg-transparent border border-border cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft size={12} />
                  上一步
                </button>
              )}
              {showPrimaryReview ? (
                <button onClick={handleConfirm}
                  disabled={primaryDisabled}
                  className="flex items-center gap-1 h-7 px-4 rounded-lg text-[10px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-foreground/10">
                  {saving ? (
                    <>
                      <span className="w-3 h-3 border-2 border-background/40 border-t-background rounded-full animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Check size={12} />
                      确定落库{isLastStep ? '并完成' : '并继续'}
                    </>
                  )}
                </button>
              ) : showPrimaryConfirmPlan ? (
                <button
                  onClick={() => { const st = useInitializerStore.getState(); st.enterReview(); }}
                  disabled={primaryDisabled}
                  className="flex items-center gap-1 h-7 px-4 rounded-lg text-[10px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-foreground/10">
                  <ClipboardCheck size={12} />
                  确认方案
                </button>
              ) : isLastStep ? (
                <button onClick={handleFinish}
                  disabled={primaryDisabled}
                  className="flex items-center gap-1 h-7 px-4 rounded-lg text-[10px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-foreground/10">
                  {saving ? (
                    <>
                      <span className="w-3 h-3 border-2 border-background/40 border-t-background rounded-full animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Check size={12} />
                      完成{mode === 'append' ? '追加' : '初始化'}
                    </>
                  )}
                </button>
              ) : (
                <button onClick={handleNextStep}
                  disabled={primaryDisabled}
                  className="flex items-center gap-1 h-7 px-4 rounded-lg text-[10px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-foreground/10">
                  下一步
                  <ChevronRight size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
