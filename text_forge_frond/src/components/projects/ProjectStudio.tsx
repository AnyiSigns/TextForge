// src/components/projects/ProjectStudio.tsx
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  submitImage, submitVideo, fetchProjectPortfolio, type MediaTask, type GenerationContext, type ImageRequest, type VideoRequest,
} from '@/lib/api/generation';
import { useModelStore } from '@/lib/stores/modelStore';
import { useBriefStore, briefToContextLine } from '@/lib/stores/briefStore';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { usePortfolioStore } from '@/lib/stores/portfolioStore';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { Image as ImageIcon, Video, Sparkles, Link as LinkIcon, Loader2, User, BookOpen, ChevronDown, Clapperboard, Info } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { chapterLabel } from '@/lib/utils/chapter';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/states';
import type { Character } from '@/types';

type StudioMode = 'character' | 'chapter';

export function ProjectStudio({ projectId, steps, mode, selectedCharIds }: { projectId: string; steps: { id: string; agent: string; content: string }[]; mode: StudioMode; selectedCharIds?: string[] }) {
  const [isExpanded, setIsExpanded] = useState(mode === 'character');
  // 项目预告片：本地维护选用的角色（带入其立绘作为视频参考图）
  const [trailerChars, setTrailerChars] = useState<string[]>([]);
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const setPortfolio = usePortfolioStore((s) => s.setPortfolio);
  const hasRunningTasks = portfolio.some((t) => t.status === 'pending' || t.status === 'processing');

  const taskCount = portfolio.filter((t) => t.status === 'pending' || t.status === 'processing').length;
  const characters = useCharacterStore(useShallow((s) => s.characters.filter((c: Character) => (c.projectId ?? null) === projectId)));
  const brief = useBriefStore((s) => s.briefs[projectId]);

  const imageModels = useModelStore(useShallow((s) => s.models.filter((m) => m.category === 'vision' && (m.modalities ?? ['image']).includes('image'))));
  const videoModels = useModelStore(useShallow((s) => s.models.filter((m) => m.category === 'vision' && (m.modalities ?? []).includes('video'))));

  // 章节 -> 出场角色立绘：优先用工作台已选的本章出场角色，兜底按章节正文里出现过的角色名匹配
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

  // 提交时插入一条乐观记录，轮询拿到后端回写后按 id 合并替换
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
      // 角色源图片生成完成后自动写回对应角色的图库（本地兜底）
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
    const t = setTimeout(reloadPortfolio, 0);
    const interval = setInterval(reloadPortfolio, 8000);
    return () => { clearTimeout(t); clearInterval(interval); };
  }, [reloadPortfolio]);

  const makeOptimistic = (kind: MediaTask['kind'], p: ImageRequest | VideoRequest): MediaTask => {
    const ctx = p.context as GenerationContext | undefined;
    return {
      id: `opt-${crypto.randomUUID()}`,
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

  // 当前 tab 只展示对应来源的作品（角色素材 tab 仅看角色图，章节动画 tab 仅看章节视频）
  const visiblePortfolio = useMemo(
    () => portfolio.filter((t) => (mode === 'character' ? t.source === 'character' : t.source === 'chapter' || (!t.source && t.kind === 'video'))),
    [portfolio, mode],
  );

  return (
    <Card className="glass-card mt-6">
      <CardHeader className="cursor-pointer select-none" onClick={() => setIsExpanded((v) => !v)}>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {mode === 'character' ? <ImageIcon className="w-4 h-4 text-primary" /> : <Clapperboard className="w-4 h-4 text-primary" />}
            {mode === 'character' ? '角色素材（可选）' : '章节动画（可选）'}
            {hasRunningTasks && (
              <Badge variant="secondary" className="gap-1 text-xs animate-pulse">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                {taskCount} 任务进行中
              </Badge>
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
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">角色形象</p>
              {characters.length === 0 ? (
                <p className="text-sm text-muted-foreground">该项目暂无关联角色，去「角色」标签创建后再来生成立绘。</p>
              ) : (
                <div className="space-y-2">
                  {characters.map((c: Character) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/40 bg-background/40">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.description || '无设定'}</p>
                        {c.referenceImage && (
                          <p className="text-[11px] text-primary mt-0.5 flex items-center gap-1">
                            <ImageIcon className="w-3 h-3" /> 已锁定参考图，生图将保持一致
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!imageModels.length}
                        onClick={() => handleImage({
                          prompt: `根据角色设定生成形象：${c.name}。${c.description || ''}`,
                          project_id: projectId,
                          context: buildContext('character', c.id),
                          characterId: c.id,
                          ...(c.referenceImage ? { reference_image: c.referenceImage } : {}),
                          ...(c.imageSeed != null ? { seed: c.imageSeed } : {}),
                        })}
                      >
                        <ImageIcon className="w-4 h-4 mr-1.5" /> 生图
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* 整项目预告片：需引导选择重要角色立绘，否则角色样貌不连贯 */}
              <div className="rounded-xl border border-dashed border-primary/25 bg-primary/5 p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Clapperboard className="w-3.5 h-3.5" /> 项目预告片
                </p>
                <p className="text-sm text-muted-foreground">
                  用整本书的世界观与角色，生成一支宣传预告片。为保证片中角色样貌连贯，请先选择出场的重要角色（将带入其立绘作为参考图）。
                </p>
                {characters.length === 0 ? (
                  <p className="text-xs text-muted-foreground">该项目暂无角色，去「角色」标签创建并生成立绘后再生成预告片。</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {characters.map((c) => {
                        const on = trailerChars.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            onClick={() => {
                              setTrailerChars((prev) => (on ? prev.filter((id) => id !== c.id) : [...prev, c.id]));
                              toast.message(on ? `已取消选用 ${c.name}` : `已选用 ${c.name} 的立绘作为参考`);
                            }}
                            className={cn(
                              'px-2.5 py-1 rounded-full text-xs border flex items-center gap-1',
                              on ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50',
                            )}
                          >
                            {on && <User className="w-3 h-3" />}
                            {c.name}
                            {c.referenceImage ? <ImageIcon className="w-3 h-3 text-emerald-500" /> : <Info className="w-3 h-3 text-amber-500" />}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        disabled={!videoModels.length || trailerChars.length === 0}
                        onClick={() => {
                          const chosen = trailerChars.map((id) => characters.find((c) => c.id === id)).filter((c): c is Character => !!c);
                          const refs = chosen.map((c) => c.referenceImage).filter((u): u is string => !!u);
                          if (chosen.length === 0) { toast.error('请先选择重要角色'); return; }
                          if (refs.length === 0) { toast.error('所选角色还没有立绘，请先去「角色素材」生成立绘'); return; }
                          handleVideo({
                            prompt: `根据整部小说的世界观、角色与剧情，生成一支宣传预告片，风格统一、节奏紧凑。`,
                            project_id: projectId,
                            context: buildContext('chapter'),
                            chapter_id: undefined,
                            character_ids: chosen.map((c) => c.id),
                            reference_images: refs,
                          });
                        }}
                      >
                        <Clapperboard className="w-4 h-4 mr-1.5" /> 生成预告片
                      </Button>
                      {trailerChars.some((id) => !characters.find((c) => c.id === id)?.referenceImage) && (
                        <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <Info className="w-3.5 h-3.5" /> 有角色尚未生成立绘，片中其样貌可能不稳定
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* 章节片段 → 视频 快捷生成（带入该章出场角色立绘+介绍，保证连贯） */}
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">章节片段</p>
                {steps.filter((s) => s.content).length === 0 ? (
                  <p className="text-sm text-muted-foreground">先生成正文后，可把章节片段做成动画视频。</p>
                ) : (
                  <div className="space-y-2">
                    {steps.filter((s) => s.content).slice(0, 4).map((s, i) => {
                      const refs = charRefsForChapter(s.id);
                      return (
                        <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/40 bg-background/40">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{chapterLabel(s.agent, i, s.content).short}</p>
                            <p className="text-xs text-muted-foreground truncate">{s.content.slice(0, 40)}…</p>
                            {refs.ids.length > 0 && (
                              <p className="text-[11px] text-primary mt-0.5 flex items-center gap-1">
                                <User className="w-3 h-3" /> 将带入 {refs.ids.length} 个角色{refs.images.length < refs.ids.length ? '（部分缺立绘，样貌可能不稳）' : '的立绘与介绍'}
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!videoModels.length}
                            onClick={() => handleVideo({
                              prompt: `根据以下小说片段生成短视频分镜动画：${s.content.slice(0, 300)}`,
                              project_id: projectId,
                              context: buildContext('chapter', s.id),
                              chapter_id: s.id,
                              character_ids: refs.ids,
                              reference_images: refs.images,
                            })}
                          >
                            <Video className="w-4 h-4 mr-1.5" /> 生成视频
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 作品集（按来源过滤） */}
          <div className="space-y-3 mt-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">作品集</p>
            {visiblePortfolio.length === 0 ? (
              <EmptyState icon={Sparkles} title="暂无作品" description={mode === 'character' ? '本项目的角色立绘将在此展示' : '本项目的章节动画将在此展示'} />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 stagger">
                {visiblePortfolio.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border/40 overflow-hidden bg-background/40">
                    <div className={cn('bg-gradient-to-br from-primary/20 to-accent/40 dark:from-primary/30 dark:to-accent/50 grid place-items-center', item.kind === 'video' ? 'aspect-video' : 'aspect-square')}>
                      {item.status === 'completed' && item.result_url ? (
                        item.kind === 'video' ? (
                          <video src={item.result_url} className="w-full h-full object-cover" controls />
                        ) : (
                          <div className="relative w-full h-full">
                            <Image src={item.result_url} alt={item.prompt} fill className="object-cover" />
                          </div>
                        )
                      ) : item.status === 'failed' ? (
                        <span className="text-xs text-destructive">失败</span>
                      ) : (
                        <div className="text-center text-muted-foreground">
                          {item.kind === 'video' ? <Video className="w-6 h-6 mx-auto mb-1 opacity-40" /> : <Loader2 className="w-6 h-6 mx-auto mb-1 animate-spin opacity-60" />}
                          <span className="text-xs">{item.status === 'processing' ? `进度 ${item.progress ?? 0}%` : '待生成'}</span>
                        </div>
                      )}
                    </div>
                    <div className="p-2.5 space-y-1.5">
                      <p className="text-xs truncate">{item.prompt}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={item.status === 'completed' ? 'default' : item.status === 'failed' ? 'destructive' : 'secondary'}>
                          {item.kind === 'video' ? '视频' : '图片'}
                        </Badge>
                        {item.source === 'character' && (
                          <Badge variant="outline" className="gap-1"><User className="w-3 h-3" /> 角色</Badge>
                        )}
                        {item.source === 'chapter' && item.source_ref && (() => {
                          const ch = chapterMap.get(item.source_ref);
                          const idx = ch ? ch.index : null;
                          return idx ? <Badge variant="outline" className="gap-1"><BookOpen className="w-3 h-3" /> {chapterLabel(undefined, idx - 1, ch?.content).short}</Badge> : <Badge variant="outline" className="gap-1"><BookOpen className="w-3 h-3" /> 章节</Badge>;
                        })()}
                        {item.status === 'completed' && item.result_url && (
                          <a href={item.result_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                            <LinkIcon className="w-3 h-3" /> 查看
                          </a>
                        )}
                        {item.source === 'character' && item.status === 'completed' && item.result_url && (() => {
                          const char = characters.find((c) => c.id === item.source_ref);
                          return char ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs"
                              onClick={() => {
                                useCharacterStore.setState((s) => ({
                                  characters: s.characters.map((c) => (c.id === char.id ? { ...c, avatar: item.result_url } : c)),
                                }));
                                toast.success('已设为角色头像（本地）');
                              }}
                            >
                              设为头像
                            </Button>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
