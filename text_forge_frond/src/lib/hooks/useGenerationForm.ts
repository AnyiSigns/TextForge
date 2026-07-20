// src/lib/hooks/useGenerationForm.ts
// GenerationForm 的表单逻辑层：承载全部受控 state、派生值与提交组装，
// 让 GenerationForm 组件退化为纯视图（页面=布局 / hooks=逻辑 分层）。
import { useState, useMemo, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useModelStore } from '@/lib/stores/modelStore';
import { NO_PROJECT } from '@/components/shared/ProjectPicker';
import type { GenerationContext } from '@/types';

const IMAGE_STYLES = ['写实', '水彩', '水墨', '二次元', '像素', '油画', '3D 渲染'];
const IMAGE_SIZES = ['1024x1024', '1024x1792', '1792x1024', '512x512'];
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
type ImageUseCase = 'portrait' | 'chapter_art';
type VideoUseCase = 'chapter_anim' | 'trailer' | 'character_card';
export type GenUseCase = ImageUseCase | VideoUseCase;

export interface GenerationFormOptions {
  kind: GenKind;
  defaultPrompt?: string;
  defaultProjectId?: string | null;
  defaultCharacterId?: string | null;
  defaultChapterId?: string | null;
  context?: GenerationContext;
  steps?: { id: string; agent?: string; content?: string }[];
  forcedUseCase?: GenUseCase;
  /** 项目内角色列表（章节插图按章节自动匹配出场角色参考图用） */
  characters?: { id: string; name: string; referenceImages?: string[] | null; referenceImage?: string | null }[];
}

export interface GenerationSubmitPayload {
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
}

export function useGenerationForm(opts: GenerationFormOptions) {
  const { kind, defaultPrompt = '', defaultProjectId = null, defaultCharacterId = null, defaultChapterId = null, context, steps, forcedUseCase, characters } = opts;

  const models = useModelStore(useShallow((s) =>
    s.models.filter((m) => m.category === 'vision' && (m.modalities ?? ['image']).includes(kind === 'video' ? 'video' : 'image'))
  ));
  const [modelId, setModelId] = useState('');
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [negative, setNegative] = useState('');
  const [style, setStyle] = useState(IMAGE_STYLES[0]);
  const [size, setSize] = useState(IMAGE_SIZES[0]);
  const [count, setCount] = useState(1);
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
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [negExpanded, setNegExpanded] = useState(false);
  const [localUseCase, setLocalUseCase] = useState<GenUseCase>(kind === 'image' ? 'portrait' : 'chapter_anim');
  const useCase: GenUseCase = forcedUseCase ?? localUseCase;
  const MAX_DURATION_MIN = useCase === 'character_card' ? 15 : 5;

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

  // 章节插图只支持按章节：切换用例或进入时强制 granularity 为 chapter
  useEffect(() => {
    if (useCase === 'chapter_art' && granularity !== 'chapter') setGranularity('chapter');
  }, [useCase, granularity, setGranularity]);

  const handleSubmit = async (onSubmit: (payload: GenerationSubmitPayload) => void | Promise<void>, characterImages: string[] = []) => {
    if (!prompt.trim()) return;
    setIsLoading(true);
    try {
      const preset = kind === 'video' ? VIDEO_STYLE_PRESETS.find((p) => p.value === stylePreset) : undefined;
      const vAspect = preset?.aspect ?? aspect;
      const vDuration = preset?.duration ?? duration;
      const vStyle = preset?.label ?? style;
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
          // 角色立绘：只传角色一致性信息（characterId + 多张参考图 + seed + 描述），不拼章节正文，也不混入素材增强图
          const payload = {
            ...base,
            style, size, count,
            ...(characterId ? { characterId, source: 'character' as const, source_ref: characterId } : {}),
            ...(characterImages.length ? { reference_images: characterImages.slice(0, 5) } : {}),
          };
          await onSubmit(payload);
        } else if (useCase === 'chapter_art') {
          // 章节插图：选章节后自动匹配该章出场角色并带入其参考图（≤5 张），同时传入章节内容供生成
          const step = selectedStep ?? (chapterId ? effectiveSteps?.find((s) => s.id === chapterId) : undefined);
          const stepContent = step?.content;
          const pool = characters ?? [];
          const matched = stepContent
            ? pool.filter((c) => c.name && stepContent.includes(c.name))
            : [];
          const charRefs = matched
            .flatMap((c) => (c.referenceImages ?? (c.referenceImage ? [c.referenceImage] : [])))
            .filter((u): u is string => !!u);
          const refImages = Array.from(new Set(charRefs)).slice(0, 5);
          const chapterText = stepContent ? `\n\n【章节内容】\n${stepContent.slice(0, 2000)}` : '';
          const payload = {
            ...base,
            prompt: `${prompt.trim()}${chapterText}`,
            style, size, count,
            source: 'chapter' as const,
            source_step: (step?.id ?? selectedStepId) || undefined,
            ...(matched.length ? { character_ids: matched.map((c) => c.id) } : {}),
            ...(refImages.length ? { reference_images: refImages } : {}),
          };
          await onSubmit(payload);
        }
        setPrompt(''); setNegative('');
        return;
      }

      // 视频：按用途组装
      if (useCase === 'chapter_anim') {
        // 选章节后自动匹配该章出场角色并带入其参考图（≤5 张），同时传入章节内容供生成
        const step = effectiveSteps?.find((s) => s.id === chapterId) ?? selectedStep;
        const stepContent = step?.content;
        const pool = characters ?? [];
        const matched = stepContent
          ? pool.filter((c) => c.name && stepContent.includes(c.name))
          : [];
        const refImages = Array.from(new Set(
          matched.flatMap((c) => (c.referenceImages ?? (c.referenceImage ? [c.referenceImage] : []))).filter((u): u is string => !!u),
        )).slice(0, 5);
        const finalPrompt = stepContent
          ? `【章节原文】\n${stepContent.slice(0, 3000)}\n\n【生成请求】\n${prompt}`
          : prompt;
        const payload = {
          ...base, prompt: finalPrompt, duration: vDuration, aspect: vAspect, style: vStyle,
          source_step: step?.id ?? chapterId ?? undefined,
          chapter_id: chapterId ?? undefined,
          ...(matched.length ? { character_ids: matched.map((c) => c.id) } : {}),
          reference_images: refImages.length ? refImages : undefined,
          storyboard: prompt.trim(),
        };
        await onSubmit(payload);
      } else if (useCase === 'trailer') {
        // 全书预告片：关联项目后自动传大纲，用户自选出场角色，带入其参考图（≤5），无素材增强
        const pool = characters ?? [];
        const chosen = pool.filter((c) => selectedCharIds.includes(c.id));
        const charRefs = chosen
          .flatMap((c) => (c.referenceImages ?? (c.referenceImage ? [c.referenceImage] : [])))
          .filter((u): u is string => !!u);
        const refImages = Array.from(new Set(charRefs)).slice(0, 5);
        const outline = effectiveSteps?.map((s) => s.content).filter(Boolean).join('\n\n').slice(0, 3000) ?? '';
        const finalPrompt = outline ? `【大纲】\n${outline}\n\n【生成请求】\n${prompt}` : prompt;
        const payload = {
          ...base, prompt: finalPrompt, duration: vDuration, aspect: vAspect, style: vStyle,
          ...(chosen.length ? { character_ids: chosen.map((c) => c.id) } : {}),
          ...(refImages.length ? { reference_images: refImages } : {}),
          storyboard: prompt.trim(),
        };
        await onSubmit(payload);
      } else {
        // 角色卡动画：选角色后自动带入其参考图（≤5 张），无基于章节、无素材增强
        const selChar = characterId ? (characters ?? []).find((c) => c.id === characterId) : undefined;
        const charRefs = selChar
          ? (selChar.referenceImages ?? (selChar.referenceImage ? [selChar.referenceImage] : [])).filter((u): u is string => !!u)
          : [];
        const payload = {
          ...base, prompt, duration: vDuration, aspect: vAspect, style: vStyle,
          ...(characterId ? { characterId, source: 'character' as const, source_ref: characterId } : {}),
          ...(charRefs.length ? { reference_images: charRefs.slice(0, 5) } : {}),
          storyboard: prompt.trim(),
        };
        await onSubmit(payload);
      }
      setPrompt(''); setNegative('');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    // 常量 / 派生
    MAX_DURATION_MIN,
    MAX_REFS,
    kind,
    useCase,
    models,
    effectiveSteps,
    selectedStep,
    refImages,
    refError,
    // state
    modelId, setModelId,
    prompt, setPrompt,
    negative, setNegative,
    style, setStyle,
    size, setSize,
    count, setCount,
    duration, setDuration,
    aspect, setAspect,
    projectId, setProjectId,
    characterId, setCharacterId,
    chapterId, setChapterId,
    stylePreset, setStylePreset,
    isLoading,
    granularity, setGranularity,
    chapterArtOnlyChapter: useCase === 'chapter_art',
    selectedStepId, setSelectedStepId,
    selectedStepIds, setSelectedStepIds,
    selectedCharIds, setSelectedCharIds,
    batchMode, setBatchMode,
    negExpanded, setNegExpanded,
    localUseCase, setLocalUseCase,
    refText, setRefText,
    // handlers
    handleSubmit,
  };
}
