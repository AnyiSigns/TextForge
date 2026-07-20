// src/components/projects/ChapterAnimationPanel.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Clapperboard, Video, User, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { chapterLabel } from '@/lib/utils/chapter';
import { toast } from 'sonner';
import type { Character } from '@/types';
import type { VideoRequest } from '@/lib/api/generation';
import type { GenerationContext } from '@/types';

interface ChapterAnimationPanelProps {
  characters: Character[];
  projectId: string;
  steps: { id: string; agent: string; content: string }[];
  videoModelsCount: number;
  trailerChars: string[];
  buildContext: (source?: GenerationContext['source'], sourceRef?: string) => GenerationContext;
  charRefsForChapter: (stepId: string) => { ids: string[]; images: string[] };
  onTrailerToggle: (id: string) => void;
  onVideo: (p: VideoRequest) => void;
}

export function ChapterAnimationPanel(props: ChapterAnimationPanelProps) {
  const {
    characters, projectId, steps, videoModelsCount, trailerChars,
    buildContext, charRefsForChapter, onTrailerToggle, onVideo,
  } = props;

  const chosen = trailerChars.map((id) => characters.find((c) => c.id === id)).filter((c): c is Character => !!c);
  const refs = Array.from(new Set(chosen.flatMap((c) => (c.referenceImages ?? (c.referenceImage ? [c.referenceImage] : []))).filter((u): u is string => !!u))).slice(0, 5);

  const handleTrailer = () => {
    if (chosen.length === 0) { toast.error('请先选择重要角色'); return; }
    if (refs.length === 0) { toast.error('所选角色还没有立绘，请先去「角色素材」生成立绘'); return; }
    onVideo({
      prompt: `根据整部小说的世界观、角色与剧情，生成一支宣传预告片，风格统一、节奏紧凑。`,
      project_id: projectId,
      context: buildContext('chapter'),
      chapter_id: undefined,
      character_ids: chosen.map((c) => c.id),
      reference_images: refs,
    });
  };

  return (
    <div className="space-y-4">
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
                    onClick={() => onTrailerToggle(c.id)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs border flex items-center gap-1',
                      on ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50',
                    )}
                  >
                    {on && <User className="w-3 h-3" />}
                    {c.name}
                    {c.referenceImages?.length || c.referenceImage ? <Video className="w-3 h-3 text-emerald-500" /> : <Info className="w-3 h-3 text-amber-500" />}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={!videoModelsCount || trailerChars.length === 0}
                onClick={handleTrailer}
              >
                <Clapperboard className="w-4 h-4 mr-1.5" /> 生成预告片
              </Button>
                {trailerChars.some((id) => {
                  const c = characters.find((x) => x.id === id);
                  return !(c?.referenceImages?.length || c?.referenceImage);
                }) && (
                <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5" /> 有角色尚未生成立绘，片中其样貌可能不稳定
                </span>
              )}
            </div>
          </>
        )}
      </div>

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
                    disabled={!videoModelsCount}
                    onClick={() => onVideo({
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
  );
}
