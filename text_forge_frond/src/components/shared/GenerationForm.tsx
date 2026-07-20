// src/components/shared/GenerationForm.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectPicker } from '@/components/shared/ProjectPicker';
import { cn } from '@/lib/utils';
import { Wand2, Clapperboard, User } from 'lucide-react';
import { useGenerationForm, type GenKind, type GenUseCase } from '@/lib/hooks/useGenerationForm';
import { UseCaseTabs, GranularitySection } from './GenerationFormSections';
import type { GenerationContext } from '@/types';

export function GenerationForm({
  kind,
  defaultPrompt = '',
  defaultProjectId = null,
  defaultCharacterId = null,
  defaultChapterId = null,
  chapterOptions = [],
  characterImages = [],
  context,
  onSubmit,
  submitLabel,
  steps,
  projectCharacters,
  characters,
  onProjectChange,
  useCase: forcedUseCase,
}: {
  kind: GenKind;
  defaultPrompt?: string;
  defaultProjectId?: string | null;
  defaultCharacterId?: string | null;
  defaultChapterId?: string | null;
  chapterOptions?: { id: string; label: string }[];
  characterImages?: string[];
  context?: GenerationContext;
  onSubmit: (payload: {
    prompt: string;
    negative_prompt?: string;
    style?: string;
    size?: string;
    count?: number;
    duration?: number;
    aspect?: string;
    model_id?: string;
    project_id?: string;
    context?: GenerationContext;
    source_step?: string;
    chapter_id?: string;
    character_ids?: string[];
    reference_images?: string[];
    storyboard?: string;
    source?: 'character' | 'chapter';
    source_ref?: string;
  }) => void | Promise<void>;
  submitLabel?: string;
  steps?: { id: string; agent?: string; content?: string }[];
  projectCharacters?: { id: string; name: string }[];
  characters?: { id: string; name: string; referenceImages?: string[] | null; referenceImage?: string | null }[];
  onProjectChange?: (projectId: string | null) => void;
  useCase?: GenUseCase;
}) {
  const f = useGenerationForm({ kind, defaultPrompt, defaultProjectId, defaultCharacterId, defaultChapterId, context, steps, forcedUseCase, characters });
  const icon = kind === 'image' ? <Wand2 className="w-4 h-4 text-primary" /> : <Clapperboard className="w-4 h-4 text-primary" />;
  const title = kind === 'image' ? '生成图片' : '生成视频';

  return (
    <Card className="glass-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{icon} {title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <UseCaseTabs kind={kind} forcedUseCase={forcedUseCase} f={f} />

        <div className="space-y-2">
          <Label>提示词</Label>
          <Textarea
            value={f.prompt}
            onChange={(e) => f.setPrompt(e.target.value)}
            placeholder={kind === 'image' ? '例如：一个穿着黑色风衣的剑客，站在雨中，赛博朋克风格' : '描述你想要的视频内容、镜头与风格'}
            rows={4}
          />
        </div>
        <button
          type="button"
          onClick={() => f.setNegExpanded(v => !v)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          {f.negExpanded ? '收起高级' : '高级选项（反向提示词）'}
          <span className={cn('transition-transform', f.negExpanded && 'rotate-90')}>›</span>
        </button>
        {f.negExpanded && (
          <div className="space-y-2">
            <Label>反向提示词（可选）</Label>
            <Input value={f.negative} onChange={(e) => f.setNegative(e.target.value)} placeholder={kind === 'image' ? '不希望出现的元素' : '不希望出现的内容'} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>模型</Label>
            {f.models.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border/50 px-3 py-2">
                尚未添加{kind === 'video' ? '视频' : '图片'}类模型，请到「设置 → 模型」中添加
              </p>
            ) : (
              <Select value={f.modelId} onValueChange={(v) => f.setModelId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder={`选择${kind === 'video' ? '视频' : '图片'}模型`} /></SelectTrigger>
                <SelectContent>
                  {f.models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {kind === 'image' ? (
            <div className="space-y-2">
              <Label>风格</Label>
              <Select value={f.style} onValueChange={(v) => f.setStyle(v ?? '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['写实', '水彩', '水墨', '二次元', '像素', '油画', '3D 渲染'] as const).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>比例</Label>
              <Select value={f.aspect} onValueChange={(v) => f.setAspect(v ?? '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['16:9', '9:16', '1:1', '4:3'] as const).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {kind === 'video' && (
          <div className="space-y-2">
            <Label>风格模板（一键套用，无需配参数）</Label>
            <div className="flex flex-wrap gap-2">
              {([
                { value: 'guoman', label: '国漫番剧', aspect: '16:9', duration: 2 },
                { value: 'jp_anime', label: '日系番剧', aspect: '16:9', duration: 2 },
                { value: 'realistic', label: '写实短片', aspect: '16:9', duration: 3 },
                { value: 'vertical', label: '竖屏短视频', aspect: '9:16', duration: 0.5 },
              ]).map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => { f.setStylePreset(p.value); f.setAspect(p.aspect); f.setDuration(p.duration); }}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm border transition-all',
                    f.stylePreset === p.value
                      ? 'bg-primary/12 text-primary border-primary/30 ring-1 ring-primary/20'
                      : 'border-border text-muted-foreground hover:bg-accent/60',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground/80">选定模板会自动设置画面比例与时长，你也可在下方手动微调。</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {kind === 'image' ? (
            <div className="space-y-2">
              <Label>尺寸</Label>
              <Select value={f.size} onValueChange={(v) => f.setSize(v ?? '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['1024x1024', '1024x1792', '1792x1024', '512x512'] as const).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>时长（分钟）</Label>
              <input type="range" min={0.5} max={f.MAX_DURATION_MIN} step={0.5} value={f.duration} onChange={(e) => f.setDuration(Number(e.target.value))} className="w-full accent-primary" />
              <p className="text-xs text-muted-foreground">
                {f.duration} 分钟 · {f.duration < 1 ? '适合短视频片段 / 表情包动图' : f.duration <= 2 ? '适合单场景镜头 / 社交平台短视频' : f.duration <= 4 ? '适合多镜头叙事 / 情节片段' : '适合完整短片 / 长镜头叙事'}
              </p>
            </div>
          )}
          {kind === 'image' && (
            <div className="space-y-2">
              <Label>数量</Label>
              <Select value={String(f.count)} onValueChange={(v) => f.setCount(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {([1, 2, 4] as const).map((c) => <SelectItem key={c} value={String(c)}>{c} 张</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <hr className="ink-divider" />

        {kind === 'image' && f.useCase !== 'portrait' && <GranularitySection f={f} />}

            {kind === 'video' && f.useCase === 'chapter_anim' && chapterOptions.length > 0 && (
              <div className="space-y-2">
                <Label>基于章节（可选）</Label>
                <Select value={f.chapterId ?? '__none__'} onValueChange={(v) => f.setChapterId(v === '__none__' ? null : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选一章，用其情节与角色图生成视频">{(v: string) => {
                      if (v === '__none__') return '不指定章节';
                      return chapterOptions.find((c) => c.id === v)?.label ?? '选择章节';
                    }}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">不指定章节</SelectItem>
                    {chapterOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground/80">选定后，系统会取该章关联的角色立绘作为视频角色参考，保证形象一致。</p>
              </div>
            )}

            <ProjectPicker
              value={f.projectId}
              onChange={(v) => { f.setProjectId(v); onProjectChange?.(v); }}
              label="关联项目（可选）"
            />

        {((kind === 'image' && projectCharacters && projectCharacters.length > 0 && f.useCase !== 'chapter_art') || (kind === 'video' && projectCharacters && projectCharacters.length > 0 && f.useCase === 'character_card')) && (
          <div className="space-y-2">
            <Label>角色（可选，自动带入其参考图）</Label>
            <Select value={f.characterId ?? '__none__'} onValueChange={(v) => f.setCharacterId(v === '__none__' ? null : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择项目内角色，生图将自动带入其参考图">{(v: string) => {
                  if (v === '__none__') return '不指定角色';
                  return projectCharacters.find((c) => c.id === v)?.name ?? '选择角色';
                }}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">不指定角色</SelectItem>
                {projectCharacters.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground/80">指定后，生成完成的图片会自动加入该角色的详情图库；并自动带入该角色已锁定的参考图（最多 5 张）保证多图一致。</p>
          </div>
        )}

        {(kind === 'image' && (f.useCase === 'portrait' || f.useCase === 'chapter_art')) || (kind === 'video' && (f.useCase === 'chapter_anim' || f.useCase === 'trailer' || f.useCase === 'character_card')) ? (
          <p className="text-xs text-muted-foreground/80">
            {f.useCase === 'portrait'
              ? '角色立绘将自动带入所选角色的参考图（最多 5 张），无需在此粘贴素材增强图。'
              : f.useCase === 'chapter_art'
                ? '章节插图将自动带入该章出场角色的参考图（最多 5 张），无需在此粘贴素材增强图。'
                : f.useCase === 'chapter_anim'
                  ? '章节动画将自动带入该章出场角色的参考图（最多 5 张），无需在此粘贴素材增强图。'
                  : f.useCase === 'trailer'
                    ? '全书预告片将自动带入所选出场角色的参考图（最多 5 张）与项目大纲，无需粘贴素材增强图。'
                    : '角色卡动画将自动带入所选角色的参考图（最多 5 张），无需在此粘贴素材增强图。'}
          </p>
        ) : (
          <div className="space-y-2">
            <Label>素材增强（可选，最多 {f.MAX_REFS} 张）</Label>
            <Textarea
              value={f.refText}
              onChange={(e) => f.setRefText(e.target.value)}
              placeholder="粘贴参考图链接，每行一个或用逗号分隔；将作为参考图提升细节一致性"
              rows={2}
              className="text-sm"
            />
            {f.refImages.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {f.refImages.map((u) => (
                  <span key={u} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/12 text-primary border border-primary/25 max-w-[12rem] truncate">
                    {u.replace(/^https?:\/\//, '').slice(0, 28)}
                  </span>
                ))}
              </div>
            )}
            {f.refError && <p className="text-[11px] text-amber-500">{f.refError}</p>}
            <p className="text-xs text-muted-foreground/80">与所选角色的参考图自动合并，去重后最多取 {f.MAX_REFS} 张。</p>
          </div>
        )}

        {kind === 'video' && f.useCase === 'trailer' && projectCharacters && projectCharacters.length > 0 && (
          <div className="space-y-2">
            <Label>出场角色（多选，自动带入其参考图）</Label>
            <div className="flex flex-wrap gap-2">
              {projectCharacters.map((c) => {
                const on = f.selectedCharIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => f.setSelectedCharIds(on ? f.selectedCharIds.filter((id) => id !== c.id) : [...f.selectedCharIds, c.id])}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs border flex items-center gap-1',
                      on ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50',
                    )}
                  >
                    {on && <User className="w-3 h-3" />}
                    {c.name}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground/80">勾选出场的重要角色，生成预告片时会带入其参考图（最多 5 张）与项目大纲保证形象连贯。</p>
          </div>
        )}

        <Button onClick={() => f.handleSubmit(onSubmit, characterImages)} disabled={f.isLoading || (kind === 'video' && f.useCase === 'trailer' && f.selectedCharIds.length === 0)} className={cn('w-full')}>
          {f.isLoading ? '提交中...' : (submitLabel ?? (kind === 'image' ? '生成图片' : '提交任务'))}
        </Button>
      </CardContent>
    </Card>
  );
}
