// src/components/shared/GenerationFormSections.tsx
// GenerationForm 的子区块拆分：用例子标签与生成粒度区块，纯视图，所有状态来自 useGenerationForm。
import type { Dispatch, SetStateAction } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { chapterLabel } from '@/lib/utils/chapter';
import type { GenKind, GenUseCase } from '@/lib/hooks/useGenerationForm';

type FormHandle = {
  useCase: GenUseCase;
  setLocalUseCase: (v: GenUseCase) => void;
  granularity: 'chapter' | 'full';
  setGranularity: (v: 'chapter' | 'full') => void;
  /** 章节插图只支持按章节，不显示「整本书」选项 */
  chapterArtOnlyChapter?: boolean;
  effectiveSteps?: { id: string; agent?: string; content?: string }[];
  selectedStepId: string;
  setSelectedStepId: (v: string) => void;
  setSelectedStepIds: Dispatch<SetStateAction<string[]>>;
  selectedStepIds: string[];
  batchMode: 'single' | 'batch';
  setBatchMode: Dispatch<SetStateAction<'single' | 'batch'>>;
  selectedStep?: { id: string; agent?: string; content?: string };
};

const USE_CASE_OPTIONS: Record<GenKind, { v: GenUseCase; label: string }[]> = {
  image: [
    { v: 'portrait', label: '角色立绘' },
    { v: 'chapter_art', label: '章节插图' },
  ],
  video: [
    { v: 'chapter_anim', label: '章节动画' },
    { v: 'trailer', label: '全书预告片' },
    { v: 'character_card', label: '角色卡动画' },
  ],
};

export function UseCaseTabs({ kind, forcedUseCase, f }: { kind: GenKind; forcedUseCase?: GenUseCase; f: FormHandle }) {
  const options = USE_CASE_OPTIONS[kind];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.v}
          type="button"
          onClick={() => { if (!forcedUseCase) f.setLocalUseCase(opt.v); }}
          disabled={!!forcedUseCase}
          className={cn(
            'px-3 py-1.5 rounded-full text-sm border transition-all',
            (!forcedUseCase && f.useCase === opt.v) || forcedUseCase === opt.v
              ? 'bg-primary/12 text-primary border-primary/30 ring-1 ring-primary/20'
              : 'border-border text-muted-foreground hover:bg-accent/60',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function GranularitySection({ f }: { f: FormHandle }) {
  const onlyChapter = f.chapterArtOnlyChapter;
  return (
    <div className="space-y-2">
      <Label>生成粒度</Label>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Select value={f.granularity} onValueChange={(v) => f.setGranularity(v as 'chapter' | 'full')}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="选择粒度">{(v: string) => (v === 'chapter' ? '按章节（推荐）' : v === 'full' ? '整本书' : '选择粒度')}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="chapter">按章节（推荐）</SelectItem>
              {!onlyChapter && <SelectItem value="full">整本书</SelectItem>}
            </SelectContent>
          </Select>
          {f.granularity === 'chapter' && f.effectiveSteps && f.effectiveSteps.length > 0 && (
            <>
              <Select value={f.selectedStepId} onValueChange={(v) => {
                f.setSelectedStepId(v ?? '');
                f.setSelectedStepIds(v ? [v] : []);
              }}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="选择章节">{(v: string) => {
                    const idx = f.effectiveSteps!.findIndex((s) => s.id === v);
                    return idx >= 0 ? chapterLabel(f.effectiveSteps![idx].agent, idx, f.effectiveSteps![idx].content).full : '选择章节';
                  }}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {f.effectiveSteps!.map((s, i) => {
                    const { full, short } = chapterLabel(s.agent, i, s.content);
                    return (
                      <SelectItem key={s.id} value={s.id} title={full}>{short}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => f.setBatchMode(m => m === 'single' ? 'batch' : 'single')}>
                {f.batchMode === 'single' ? '批量' : '单选'}
              </Button>
            </>
          )}
        </div>
        {f.batchMode === 'batch' && f.granularity === 'chapter' && f.effectiveSteps && f.effectiveSteps.length > 0 && (
          <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto border border-border/40 rounded-lg p-2">
            {f.effectiveSteps.map((s, i) => {
              const { full, short } = chapterLabel(s.agent, i, s.content);
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={f.selectedStepIds.includes(s.id)}
                    onCheckedChange={(c) => f.setSelectedStepIds(ids => c ? [...ids, s.id] : ids.filter(id => id !== s.id))}
                  />
                  <span className="text-xs truncate" title={full}>{short}</span>
                </div>
              );
            })}
          </div>
        )}
        {f.granularity === 'chapter' && (f.selectedStep || f.selectedStepIds.length > 0) && f.effectiveSteps && (
          <p className="text-xs text-muted-foreground truncate">
            将基于 {f.batchMode === 'batch'
              ? `${f.selectedStepIds.length} 个章节`
              : `「${chapterLabel(f.effectiveSteps.find((s) => s.id === f.selectedStepId)?.agent, f.effectiveSteps.findIndex((s) => s.id === f.selectedStepId), f.effectiveSteps.find((s) => s.id === f.selectedStepId)?.content).full}」`} 内容生成
          </p>
        )}
      </div>
    </div>
  );
}
