'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { type MediaTask, type GenerationContext, type ImageRequest, type VideoRequest } from '@/types';
import { useCreativeSettingStore, creativeSettingToContextLine, creativeSettingDimensionsToContext } from '@/features/projects';
import { useCharacterStore } from '@/features/characters';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { uid } from '@/lib/utils/id';
import { characterRoleLabel } from '@/shared/lib/agentRoles';
import { CharacterMaterialPanel } from './CharacterMaterialPanel';
import { ChapterAnimationPanel } from './ChapterAnimationPanel';
import { BadgeState } from './BadgeState';
import { ProjectStudioHeader } from './ProjectStudioHeader';
import type { Character } from '@/types';

export type StudioMode = 'character' | 'chapter';

const submitImage = async (..._args: unknown[]): Promise<MediaTask | undefined> => undefined;
const submitVideo = async (..._args: unknown[]): Promise<MediaTask | undefined> => undefined;
const fetchProjectPortfolio = async (..._args: unknown[]): Promise<MediaTask[]> => { throw new Error('not implemented'); };

export function ProjectStudio({ bookId, steps, mode, selectedCharIds, projectTitle }: { bookId: number; steps: { id: string; agent: string; content: string }[]; mode: StudioMode; selectedCharIds?: number[]; projectTitle?: string }) {
  const [isExpanded, setIsExpanded] = useState(mode === 'character');
  const [trailerChars, setTrailerChars] = useState<number[]>([]);
  const [portfolio, setPortfolio] = useState<MediaTask[]>([]);
  const addToPortfolio = (task: MediaTask) => setPortfolio((prev) => [...prev, task]);
  const updateInPortfolio = (id: string, updates: Partial<MediaTask>) => setPortfolio((prev) => prev.map((t) => t.id === id ? { ...t, ...updates } : t));
  const hasRunningTasks = portfolio.some((t) => t.status === 'pending' || t.status === 'processing');

  const taskCount = portfolio.filter((t) => t.status === 'pending' || t.status === 'processing').length;
  const characters = useCharacterStore(useShallow((s) => s.characters.filter((c: Character) => c.bookId === bookId)));
  const creativeSetting = useCreativeSettingStore((s) => s.settings[bookId]);

  const charRefsForChapter = useCallback((stepId: string): { ids: string[]; images: string[] } => {
     const step = steps.find((s) => s.id === stepId);
     const chosen = (selectedCharIds ?? [])
       .map((id) => characters.find((c) => c.id === id))
       .filter((c): c is Character => !!c);
     const pool = chosen.length ? chosen : characters;
     const matched = pool.filter((c) => step?.content && step.content.includes(c.name));
     const used = matched.length ? matched : pool;
     const images = used.flatMap((c) => (c.referenceImages ?? (c.referenceImage ? [c.referenceImage] : []))).filter((u): u is string => !!u);
     return {
       ids: used.map((c) => String(c.id)),
       images: Array.from(new Set(images)).slice(0, 5),
     };
   }, [steps, characters, selectedCharIds]);

  const outline = useMemo(
    () => steps.map((s) => s.content).filter(Boolean).join('\n\n').slice(0, 6000),
    [steps],
  );

  const chapterMap = useMemo(() => {
    const map = new Map<string, { index: number; content: string }>();
    steps.forEach((s, i) => { if (s.content) map.set(s.id, { index: i + 1, content: s.content }); });
    return map;
  }, [steps]);

  const projectChars = useCharacterStore(useShallow((s) => s.characters.filter((c: Character) => c.bookId === bookId)));
  const charNameById = useCallback((id: number) => projectChars.find((c) => c.id === id)?.name ?? String(id), [projectChars]);

  const buildContext = useCallback((source?: GenerationContext['source'], sourceRef?: string): GenerationContext => {
    const chapter = source === 'chapter' && sourceRef ? chapterMap.get(sourceRef) : undefined;
    const projectCharacters = characters.map((c) => ({
      name: c.name,
      role: c.roleType && c.roleType !== 'custom' ? characterRoleLabel(c.roleType) : undefined,
      description: c.description,
      status: c.status ?? '存活',
      relationships: c.relationshipChain?.length
        ? c.relationshipChain
            .filter((r) => r.target && r.relation.trim())
             .map((r) => ({ target: charNameById(Number(r.target)) || r.target, relation: r.relation.trim() }))
        : undefined,
    }));
    const sectionLine = creativeSettingDimensionsToContext(creativeSetting?.customDimensions, creativeSetting?.customDimensions?.map((s) => s.id) ?? []);
    const sections = sectionLine
      ? sectionLine.split('；').map((s) => {
          const idx = s.indexOf('：');
          return idx > -1 ? { title: s.slice(0, idx), content: s.slice(idx + 1) } : { title: '', content: s };
        })
      : undefined;
    return {
       project_id: bookId,
       book_title: projectTitle || creativeSetting?.worldview || String(bookId),
      summary: creativeSettingToContextLine(creativeSetting) || undefined,
      characters: projectCharacters,
      sections,
      outline: chapter ? chapter.content.slice(0, 3000) : outline,
      source,
      source_ref: sourceRef,
      brief: creativeSettingToContextLine(creativeSetting),
    };
  }, [bookId, characters, outline, creativeSetting, chapterMap, projectTitle, charNameById]);

  const reloadPortfolio = useCallback(async () => {
    try {
      const remote = await fetchProjectPortfolio(String(bookId));
      setPortfolio([...remote]);
      for (const it of remote) {
        if (it.status === 'completed' && it.result_url && it.source === 'character' && it.source_ref) {
           const char = useCharacterStore.getState().characters.find((c) => c.id === Number(it.source_ref));
          if (char && !(char.avatarUrl ?? '').includes(it.result_url)) {
             await useCharacterStore.getState().updateCharacter(Number(it.source_ref), { avatarUrl: it.result_url }).catch(() => {});
          }
        }
      }
    } catch { /* 后端未就绪时保留本地乐观记录 */ }
  }, [bookId, setPortfolio]);

  useEffect(() => {
    if (!isExpanded || !hasRunningTasks) return;
    const t = setTimeout(reloadPortfolio, 0);
    const interval = setInterval(reloadPortfolio, 8000);
    return () => { clearTimeout(t); clearInterval(interval); };
  }, [reloadPortfolio, isExpanded, hasRunningTasks]);

  const handleMedia = async (kind: MediaTask['kind'], p: ImageRequest | VideoRequest) => {
    const ctx = p.context as GenerationContext | undefined;
    const optimistic: MediaTask = {
       id: uid('opt'),
       prompt: p.prompt,
       status: 'pending',
       kind,
       project_id: String(bookId),
       source: ctx?.source,
       source_ref: ctx?.source_ref,
       chapter_id: (p as VideoRequest).chapter_id,
       character_ids: (p as VideoRequest).character_ids,
       createdAt: new Date().toISOString(),
    };
    const exists = portfolio.some((t) => t.id === optimistic.id);
    if (exists) updateInPortfolio(optimistic.id, optimistic);
    else addToPortfolio(optimistic);
    try {
      const task = kind === 'image' ? await submitImage(p) : await submitVideo(p);
      if (task) { updateInPortfolio(optimistic.id, { ...optimistic, ...task }); toast.success(kind === 'image' ? '图片任务已提交' : '视频任务已提交'); }
    } catch (e) {
      updateInPortfolio(optimistic.id, { ...optimistic, status: 'failed' });
      toast.error('提交失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
    if (kind === 'video') setTimeout(reloadPortfolio, 800);
  };

  const visiblePortfolio = useMemo(
    () => portfolio.filter((t) => (mode === 'character' ? t.source === 'character' : t.source === 'chapter' || (!t.source && t.kind === 'video'))),
    [portfolio, mode],
  );

  const setAvatar = (charId: number, url: string) => {
    useCharacterStore.setState((s) => ({
      characters: s.characters.map((c) => (c.id === charId ? { ...c, avatarUrl: url } : c)),
    }));
    useCharacterStore.getState().updateCharacter(charId, { avatarUrl: url }).catch(() => {});
    toast.success('已设为角色头像');
  };

  return (
    <Card className="glass-card mt-6">
      <ProjectStudioHeader
        mode={mode}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded((v) => !v)}
        taskCount={taskCount}
        hasRunningTasks={hasRunningTasks}
      />
      {isExpanded && (
        <CardContent>
          {mode === 'character' ? (
            <CharacterMaterialPanel
              characters={characters}
              projectId={bookId}
              buildContext={buildContext}
              onImage={(p) => handleMedia('image', p)}
            />
          ) : (
            <ChapterAnimationPanel
              characters={characters}
              projectId={bookId}
              steps={steps}
              trailerChars={trailerChars}
              buildContext={buildContext}
              charRefsForChapter={charRefsForChapter}
              onTrailerToggle={(id: number) =>
                setTrailerChars((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
              onVideo={(p) => handleMedia('video', p)}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}