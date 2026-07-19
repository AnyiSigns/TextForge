// src/components/shared/GenerationForm.tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectPicker, NO_PROJECT } from '@/components/shared/ProjectPicker';
import { Checkbox } from '@/components/ui/checkbox';
import { useShallow } from 'zustand/react/shallow';
import { useModelStore } from '@/lib/stores/modelStore';
import { cn } from '@/lib/utils';
import { chapterLabel } from '@/lib/utils/chapter';
import { Wand2, Clapperboard } from 'lucide-react';
import type { GenerationContext } from '@/types';

const IMAGE_STYLES = ['写实', '水彩', '水墨', '二次元', '像素', '油画', '3D 渲染'];
const IMAGE_SIZES = ['1024x1024', '1024x1792', '1792x1024', '512x512'];
const IMAGE_COUNTS = [1, 2, 4];
const ASPECTS = ['16:9', '9:16', '1:1', '4:3'];

// 视频风格模板（人话，作者只选不配参数）；每项映射到默认比例/时长 + 透传的 style 名
const VIDEO_STYLE_PRESETS: { value: string; label: string; aspect: string; duration: number }[] = [
  { value: 'guoman', label: '国漫番剧', aspect: '16:9', duration: 2 },
  { value: 'jp_anime', label: '日系番剧', aspect: '16:9', duration: 2 },
  { value: 'realistic', label: '写实短片', aspect: '16:9', duration: 3 },
  { value: 'vertical', label: '竖屏短视频', aspect: '9:16', duration: 0.5 },
];

export type GenKind = 'image' | 'video';
type Granularity = 'chapter' | 'full';
export type BatchMode = 'single' | 'batch';
type ImageUseCase = 'portrait' | 'chapter_art' | 'book_concept';
type VideoUseCase = 'chapter_anim' | 'trailer' | 'character_card';

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
  onProjectChange?: (projectId: string | null) => void;
  useCase?: ImageUseCase | VideoUseCase;
}) {
  const models = useModelStore(useShallow((s) =>
    s.models.filter((m) => m.category === 'vision' && (m.modalities ?? ['image']).includes(kind === 'video' ? 'video' : 'image'))
  ));
  const [modelId, setModelId] = useState('');
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [negative, setNegative] = useState('');
  const [style, setStyle] = useState(IMAGE_STYLES[0]);
  const [size, setSize] = useState(IMAGE_SIZES[0]);
  const [count, setCount] = useState(1);
  const MAX_DURATION_MIN = 5;
  const [duration, setDuration] = useState(0.5);
  const [aspect, setAspect] = useState(ASPECTS[0]);
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId);
  const [characterId, setCharacterId] = useState<string | null>(defaultCharacterId);
  const [chapterId, setChapterId] = useState<string | null>(defaultChapterId);
  const [stylePreset, setStylePreset] = useState<string>('guoman');
  const [isLoading, setIsLoading] = useState(false);
  const [granularity, setGranularity] = useState<Granularity>('chapter');
  const [selectedStepId, setSelectedStepId] = useState<string>('');
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [batchMode, setBatchMode] = useState<BatchMode>('single');
  const [negExpanded, setNegExpanded] = useState(false);
  const [localUseCase, setLocalUseCase] = useState<ImageUseCase | VideoUseCase>(kind === 'image' ? 'portrait' : 'chapter_anim');
  const useCase: ImageUseCase | VideoUseCase = forcedUseCase ?? localUseCase;

  const MAX_REFS = 8;
  const [refText, setRefText] = useState('');

  // 素材增强：把粘贴的多张图 URL（换行 / 逗号分隔）拆分、去重、校验，最多 MAX_REFS 张
  const parseRefs = (raw: string): { valid: string[]; error: string } => {
    const parts = raw
      .split(/[\n,，]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const valid: string[] = [];
    let bad = 0;
    for (const p of parts) {
      if (!/^https?:\/\/.+/i.test(p)) { bad += 1; continue; }
      const key = p.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      valid.push(p);
      if (valid.length >= MAX_REFS) break;
    }
    const error = bad > 0
      ? `${bad} 个不是有效图片链接（需以 http(s):// 开头），已忽略`
      : parts.length > MAX_REFS
        ? `最多 ${MAX_REFS} 张，超出部分已忽略`
        : '';
    return { valid, error };
  };
  const { valid: refImages, error: refError } = useMemo(() => parseRefs(refText), [refText]);

  const icon = kind === 'image' ? <Wand2 className="w-4 h-4 text-primary" /> : <Clapperboard className="w-4 h-4 text-primary" />;
  const title = kind === 'image' ? '生成图片' : '生成视频';

  // 当外部未提供 steps（如 AI 视频页）但已关联项目时，自动加载该项目章节用于"按章节生成"
  const [internalSteps, setInternalSteps] = useState<{ id: string; agent?: string; content?: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!steps && projectId && projectId !== NO_PROJECT) {
      import('@/lib/api/projects').then(({ fetchProjectDetail }) =>
        fetchProjectDetail(projectId)
          .then((s) => { if (!cancelled) setInternalSteps(s.map((x) => ({ id: x.id, agent: x.agent, content: x.content }))); })
          .catch(() => {})
      );
    } else if (!steps) {
      setInternalSteps([]);
    }
    return () => { cancelled = true; };
  }, [steps, projectId]);

  const effectiveSteps = steps ?? internalSteps;

  const selectedStep = useMemo(() => effectiveSteps?.find((s) => s.id === selectedStepId), [effectiveSteps, selectedStepId]);

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    try {
      const preset = kind === 'video' ? VIDEO_STYLE_PRESETS.find((p) => p.value === stylePreset) : undefined;
      const vAspect = preset?.aspect ?? aspect;
      const vDuration = preset?.duration ?? duration;
      const vStyle = preset?.label ?? style;
      const refs = [...new Set([...characterImages, ...refImages])].slice(0, MAX_REFS);
      const base = {
        prompt: prompt.trim(),
        negative_prompt: negative.trim() || undefined,
        model_id: modelId || undefined,
        project_id: projectId && projectId !== NO_PROJECT ? projectId : undefined,
        context,
      };

      // 图片：按用途组装，修 P0（不再把章节原文塞进立绘 prompt）
      if (kind === 'image') {
        if (useCase === 'portrait') {
          // 角色立绘：只传角色一致性信息（characterId + 角色参考图 + seed + 描述），不拼章节正文，也不混入素材增强图
          const payload = {
            ...base,
            style, size, count,
            ...(characterId ? { characterId, source: 'character' as const, source_ref: characterId } : {}),
          };
          await onSubmit(payload);
        } else if (useCase === 'chapter_art') {
          // 章节插图：章节原文 + 该章角色参考图
          const payload = {
            ...base, style, size, count,
            source_step: selectedStepId || undefined,
            reference_images: refs.length ? refs : undefined,
          };
          await onSubmit(payload);
        } else {
          // 全书概念图：世界观摘要 + 主要角色立绘，不传单章全文
          const payload = {
            ...base, style, size, count,
            reference_images: refs.length ? refs : undefined,
          };
          await onSubmit(payload);
        }
        setPrompt(''); setNegative('');
        return;
      }

      // 视频：按用途组装
      if (useCase === 'chapter_anim') {
        const finalPrompt = selectedStep?.content
          ? `【章节原文】\n${selectedStep.content.slice(0, 3000)}\n\n【生成请求】\n${prompt}`
          : prompt;
        const payload = {
          ...base, prompt: finalPrompt, duration: vDuration, aspect: vAspect, style: vStyle,
          source_step: selectedStepId || undefined,
          chapter_id: chapterId ?? undefined,
          character_ids: characterImages,
          reference_images: characterImages,
          storyboard: prompt.trim(),
        };
        await onSubmit(payload);
      } else if (useCase === 'trailer') {
        // 全书预告片：需勾选至少一个角色（由 characterImages 收集其立绘）
        const payload = {
          ...base, duration: vDuration, aspect: vAspect, style: vStyle,
          character_ids: characterImages,
          reference_images: characterImages,
          storyboard: prompt.trim(),
        };
        await onSubmit(payload);
      } else {
        // 角色卡动画：单角色
        const payload = {
          ...base, duration: vDuration, aspect: vAspect, style: vStyle,
          ...(characterId ? { characterId, source: 'character' as const, source_ref: characterId, reference_image: undefined } : {}),
          reference_images: refs.length ? refs : undefined,
          storyboard: prompt.trim(),
        };
        await onSubmit(payload);
      }
      setPrompt(''); setNegative('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="glass-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{icon} {title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(kind === 'image'
            ? ([
                { v: 'portrait' as const, label: '角色立绘' },
                { v: 'chapter_art' as const, label: '章节插图' },
                { v: 'book_concept' as const, label: '全书概念图' },
              ])
            : ([
                { v: 'chapter_anim' as const, label: '章节动画' },
                { v: 'trailer' as const, label: '全书预告片' },
                { v: 'character_card' as const, label: '角色卡动画' },
              ])
          ).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => { if (!forcedUseCase) setLocalUseCase(opt.v); }}
              disabled={!!forcedUseCase}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm border transition-all',
                (!forcedUseCase && useCase === opt.v) || forcedUseCase === opt.v
                  ? 'bg-primary/12 text-primary border-primary/30 ring-1 ring-primary/20'
                  : 'border-border text-muted-foreground hover:bg-accent/60',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Label>提示词</Label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={kind === 'image' ? '例如：一个穿着黑色风衣的剑客，站在雨中，赛博朋克风格' : '描述你想要的视频内容、镜头与风格'}
            rows={4}
          />
        </div>
        <button
          type="button"
          onClick={() => setNegExpanded(v => !v)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          {negExpanded ? '收起高级' : '高级选项（反向提示词）'}
          <span className={cn('transition-transform', negExpanded && 'rotate-90')}>›</span>
        </button>
        {negExpanded && (
          <div className="space-y-2">
            <Label>反向提示词（可选）</Label>
            <Input value={negative} onChange={(e) => setNegative(e.target.value)} placeholder={kind === 'image' ? '不希望出现的元素' : '不希望出现的内容'} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>模型</Label>
            {models.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border/50 px-3 py-2">
                尚未添加{kind === 'video' ? '视频' : '图片'}类模型，请到「设置 → 模型」中添加
              </p>
            ) : (
              <Select value={modelId} onValueChange={(v) => setModelId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder={`选择${kind === 'video' ? '视频' : '图片'}模型`} /></SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {kind === 'image' ? (
            <div className="space-y-2">
              <Label>风格</Label>
              <Select value={style} onValueChange={(v) => setStyle(v ?? '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IMAGE_STYLES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>比例</Label>
              <Select value={aspect} onValueChange={(v) => setAspect(v ?? '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASPECTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {kind === 'video' && (
          <div className="space-y-2">
            <Label>风格模板（一键套用，无需配参数）</Label>
            <div className="flex flex-wrap gap-2">
              {VIDEO_STYLE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => { setStylePreset(p.value); setAspect(p.aspect); setDuration(p.duration); }}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm border transition-all',
                    stylePreset === p.value
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
              <Select value={size} onValueChange={(v) => setSize(v ?? '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IMAGE_SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>时长（分钟）</Label>
              <input type="range" min={0.5} max={MAX_DURATION_MIN} step={0.5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full accent-primary" />
              <p className="text-xs text-muted-foreground">
                {duration} 分钟 · {duration < 1 ? '适合短视频片段 / 表情包动图' : duration <= 2 ? '适合单场景镜头 / 社交平台短视频' : duration <= 4 ? '适合多镜头叙事 / 情节片段' : '适合完整短片 / 长镜头叙事'}
              </p>
            </div>
          )}
          {kind === 'image' && (
            <div className="space-y-2">
              <Label>数量</Label>
              <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IMAGE_COUNTS.map((c) => <SelectItem key={c} value={String(c)}>{c} 张</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <hr className="ink-divider" />

        <div className="space-y-2">
          <Label>生成粒度</Label>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Select value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="选择粒度">{(v: string) => (v === 'chapter' ? '按章节（推荐）' : v === 'full' ? '整本书' : '选择粒度')}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chapter">按章节（推荐）</SelectItem>
                  <SelectItem value="full">整本书</SelectItem>
                </SelectContent>
              </Select>
              {granularity === 'chapter' && effectiveSteps && effectiveSteps.length > 0 && (
                <>
                  <Select value={selectedStepId} onValueChange={(v) => {
                    setSelectedStepId(v ?? '');
                    setSelectedStepIds(v ? [v] : []);
                  }}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="选择章节">{(v: string) => {
                        const idx = effectiveSteps.findIndex((s) => s.id === v);
                        return idx >= 0 ? chapterLabel(effectiveSteps[idx].agent, idx, effectiveSteps[idx].content).full : '选择章节';
                      }}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {effectiveSteps.map((s, i) => {
                        const { full, short } = chapterLabel(s.agent, i, s.content);
                        return (
                          <SelectItem key={s.id} value={s.id} title={full}>{short}</SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => setBatchMode(m => m === 'single' ? 'batch' : 'single')}>
                    {batchMode === 'single' ? '批量' : '单选'}
                  </Button>
                </>
              )}
            </div>
            {batchMode === 'batch' && granularity === 'chapter' && effectiveSteps && effectiveSteps.length > 0 && (
              <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto border border-border/40 rounded-lg p-2">
                {effectiveSteps.map((s, i) => {
                  const { full, short } = chapterLabel(s.agent, i, s.content);
                  return (
                    <div key={s.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedStepIds.includes(s.id)}
                        onCheckedChange={(c) => setSelectedStepIds(ids => c ? [...ids, s.id] : ids.filter(id => id !== s.id))}
                      />
                      <span className="text-xs truncate" title={full}>{short}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {granularity === 'chapter' && (selectedStep || selectedStepIds.length > 0) && effectiveSteps && (
              <p className="text-xs text-muted-foreground truncate">
                将基于 {batchMode === 'batch'
                  ? `${selectedStepIds.length} 个章节`
                  : `「${chapterLabel(effectiveSteps.find((s) => s.id === selectedStepId)?.agent, effectiveSteps.findIndex((s) => s.id === selectedStepId), effectiveSteps.find((s) => s.id === selectedStepId)?.content).full}」`} 内容生成
              </p>
            )}
          </div>
        </div>

            {chapterOptions.length > 0 && (
              <div className="space-y-2">
                <Label>基于章节（可选）</Label>
                <Select value={chapterId ?? '__none__'} onValueChange={(v) => setChapterId(v === '__none__' ? null : v)}>
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
              value={projectId}
              onChange={(v) => { setProjectId(v); onProjectChange?.(v); }}
              label="关联项目（可选）"
            />

        {kind === 'image' && projectCharacters && projectCharacters.length > 0 && (
          <div className="space-y-2">
            <Label>生成到角色（可选）</Label>
            <Select value={characterId ?? '__none__'} onValueChange={(v) => setCharacterId(v === '__none__' ? null : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择项目内角色，生成图将加入其图库">{(v: string) => {
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
            <p className="text-xs text-muted-foreground/80">指定后，生成完成的图片会自动加入该角色的详情图库</p>
          </div>
        )}

        <div className="space-y-2">
          <Label>素材增强（可选，最多 {MAX_REFS} 张）</Label>
          <Textarea
            value={refText}
            onChange={(e) => setRefText(e.target.value)}
            placeholder="粘贴参考图链接，每行一个或用逗号分隔；将作为参考图提升细节一致性"
            rows={2}
            className="text-sm"
          />
          {refImages.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {refImages.map((u) => (
                <span key={u} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/12 text-primary border border-primary/25 max-w-[12rem] truncate">
                  {u.replace(/^https?:\/\//, '').slice(0, 28)}
                </span>
              ))}
            </div>
          )}
          {refError && <p className="text-[11px] text-amber-500">{refError}</p>}
          <p className="text-xs text-muted-foreground/80">与所选角色的参考图自动合并，去重后最多取 {MAX_REFS} 张。</p>
        </div>

        <Button onClick={handleSubmit} disabled={isLoading || (kind === 'video' && useCase === 'trailer' && characterImages.length === 0)} className={cn('w-full')}>
          {isLoading ? '提交中...' : (submitLabel ?? (kind === 'image' ? '生成图片' : '提交任务'))}
        </Button>
      </CardContent>
    </Card>
  );
}
