// src/components/projects/ProjectStudio.tsx
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  submitImage, submitVideo, fetchProjectPortfolio, type MediaTask, type GenerationContext, type ImageRequest, type VideoRequest,
} from '@/lib/api/generation';
import { useModelStore } from '@/lib/stores/modelStore';
import { useBriefStore, briefToContextLine } from '@/lib/stores/briefStore';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { usePortfolioStore } from '@/lib/stores/portfolioStore';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { Image as ImageIcon, Clapperboard, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uid } from '@/lib/utils/id';
import { CharacterMaterialPanel } from './CharacterMaterialPanel';
import { ChapterAnimationPanel } from './ChapterAnimationPanel';
import { PortfolioGrid } from './PortfolioGrid';
import type { Character } from '@/types';

type StudioMode = 'character' | 'chapter';

export function ProjectStudio({ projectId, steps, mode, selectedCharIds }: { projectId: string; steps: { id: string; agent: string; content: string }[]; mode: StudioMode; selectedCharIds?: string[] }) {
  const [isExpanded, setIsExpanded] = useState(mode === 'character');
  const [trailerChars, setTrailerChars] = useState<string[]>([]);
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const setPortfolio = usePortfolioStore((s) => s.setPortfolio);
  const hasRunningTasks = portfolio.some((t) => t.status === 'pending' || t.status === 'processing');

  const taskCount = portfolio.filter((t) => t.status === 'pending' || t.status === 'processing').length;
  const characters = useCharacterStore(useShallow((s) => s.characters.filter((c: Character) => (c.projectId ?? null) === projectId)));
  const brief = useBriefStore((s) => s.briefs[projectId]);

  const imageModels = useModelStore(useShallow((s) => s.models.filter((m) => m.category === 'vision' && (m.modalities ?? ['image']).includes('image'))));
  const videoModels = useModelStore(useShallow((s) => s.models.filter((m) => m.category === 'vision' && (m.modalities ?? []).includes('video'))));

  const charRefsForChapter = useCallback((stepId: string): { ids: string[]; images: string[] } => {
    const step = steps.find((s) => s.id === stepId);
    const chosen = (selectedCharIds ?? [])
      .map((id) => characters.find((c) => c.id === id))
      .filter((c): c is Character => !!c);
    const pool = chosen.length ? chosen : characters;
    const matched = pool.filter((c) => step?.content && step.content.includes(c.name));
    const used = matched.length ? matched : pool;
    return {
      ids: used.map((c) => c.id),
      images: used.map((c) => c.referenceImage).filter((u): u is string => !!u),
    };
  }, [steps, characters, selectedCharIds]);

  const outline = useMemo(
    () => steps.map((s) => s.content).filter(Boolean).join('\n\n'),
    [steps],
  );

  const chapterMap = useMemo(() => {
    const map = new Map<string, { index: number; content: string }>();
    steps.forEach((s, i) => { if (s.content) map.set(s.id, { index: i + 1, content: s.content }); });
    return map;
  }, [steps]);

  const buildContext = useCallback((source?: GenerationContext['source'], sourceRef?: string): GenerationContext => {
    const chapter = source === 'chapter' && sourceRef ? chapterMap.get(sourceRef) : undefined;
    const projectCharacters = characters.map((c) => ({ name: c.name, description: c.description, status: c.status ?? '存活' }));
    return {
      project_id: projectId,
      project_title: projectId,
      summary: '',
      characters: projectCharacters,
      outline: chapter ? chapter.content.slice(0, 3000) : outline,
      source,
      source_ref: sourceRef,
      brief: briefToContextLine(brief),
    };
  }, [projectId, characters, outline, brief, chapterMap]);

  const upsertOptimistic = useCallback((task: MediaTask) => {
    const updateInPortfolio = usePortfolioStore.getState().updateInPortfolio;
    const exists = usePortfolioStore.getState().portfolio.some((t) => t.id === task.id);
    if (exists) updateInPortfolio(task.id, task);
    else usePortfolioStore.getState().addToPortfolio(task);
  }, []);

  const reloadPortfolio = useCallback(async () => {
    try {
      const remote = await fetchProjectPortfolio(projectId);
      setPortfolio([...remote]);
      for (const it of remote) {
        if (it.status === 'completed' && it.result_url && it.source === 'character' && it.source_ref) {
          const char = useCharacterStore.getState().characters.find((c) => c.id === it.source_ref);
          if (char && !(char.images ?? []).includes(it.result_url)) {
            await useCharacterStore.getState().addCharacterImage(it.source_ref, it.result_url).catch(() => {});
          }
        }
      }
    } catch { /* 后端未就绪时保留本地乐观记录 */ }
  }, [projectId, setPortfolio]);

  useEffect(() => {
    if (!isExpanded || !hasRunningTasks) return;
    const t = setTimeout(reloadPortfolio, 0);
    const interval = setInterval(reloadPortfolio, 8000);
    return () => { clearTimeout(t); clearInterval(interval); };
  }, [reloadPortfolio, isExpanded, hasRunningTasks]);

  const makeOptimistic = (kind: MediaTask['kind'], p: ImageRequest | VideoRequest): MediaTask => {
    const ctx = p.context as GenerationContext | undefined;
    return {
      id: uid('opt'),
      prompt: p.prompt,
      status: 'pending',
      kind,
      project_id: projectId,
      source: ctx?.source,
      source_ref: ctx?.source_ref,
      chapter_id: (p as VideoRequest).chapter_id,
      character_ids: (p as VideoRequest).character_ids,
      createdAt: new Date().toISOString(),
    };
  };

  const handleImage = async (p: ImageRequest) => {
    const optimistic = makeOptimistic('image', p);
    upsertOptimistic(optimistic);
    try {
      const task = await submitImage(p);
      if (task) upsertOptimistic({ ...optimistic, ...task });
      toast.success('图片任务已提交');
    } catch (e) {
      upsertOptimistic({ ...optimistic, status: 'failed' });
      toast.error('提交失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  const handleVideo = async (p: VideoRequest) => {
    const optimistic = makeOptimistic('video', p);
    upsertOptimistic(optimistic);
    try {
      const task = await submitVideo(p);
      if (task) upsertOptimistic({ ...optimistic, ...task });
      toast.success('视频任务已提交');
    } catch (e) {
      upsertOptimistic({ ...optimistic, status: 'failed' });
      toast.error('提交失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
    setTimeout(reloadPortfolio, 800);
  };

  const visiblePortfolio = useMemo(
    () => portfolio.filter((t) => (mode === 'character' ? t.source === 'character' : t.source === 'chapter' || (!t.source && t.kind === 'video'))),
    [portfolio, mode],
  );

  const setAvatar = (charId: string, url: string) => {
    useCharacterStore.setState((s) => ({
      characters: s.characters.map((c) => (c.id === charId ? { ...c, avatar: url } : c)),
    }));
    toast.success('已设为角色头像（本地）');
  };

  return (
    <Card className="glass-card mt-6">
      <CardHeader className="cursor-pointer select-none" onClick={() => setIsExpanded((v) => !v)}>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {mode === 'character' ? <ImageIcon className="w-4 h-4 text-primary" /> : <Clapperboard className="w-4 h-4 text-primary" />}
            {mode === 'character' ? '角色素材（可选）' : '章节动画（可选）'}
            {hasRunningTasks && (
              <BadgeState taskCount={taskCount} />
            )}
          </span>
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          {mode === 'character'
            ? '为角色生成立绘形象；已锁定的参考图会保持多图一致。也可到顶部「AI 绘画」页做更精细的生成。'
            : '把章节片段做成 AI 动画视频；生成时会带入该章出场角色的立绘与介绍，保证角色样貌连贯。'}
        </p>
      </CardHeader>
      {isExpanded && (
        <CardContent>
          {mode === 'character' ? (
            <CharacterMaterialPanel
              characters={characters}
              projectId={projectId}
              imageModelsCount={imageModels.length}
              buildContext={buildContext}
              onImage={handleImage}
            />
          ) : (
            <ChapterAnimationPanel
              characters={characters}
              projectId={projectId}
              steps={steps}
              videoModelsCount={videoModels.length}
              trailerChars={trailerChars}
              buildContext={buildContext}
              charRefsForChapter={charRefsForChapter}
              onTrailerToggle={(id) =>
                setTrailerChars((prev) => (trailerChars.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
              onVideo={handleVideo}
            />
          )}

          <div className="space-y-3 mt-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">作品集</p>
            <PortfolioGrid
              items={visiblePortfolio}
              mode={mode}
              chapterMap={chapterMap}
              onSetAvatar={setAvatar}
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function BadgeState({ taskCount }: { taskCount: number }) {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
      <span className="ml-1.5 text-xs">{taskCount} 任务进行中</span>
    </span>
  );
}
