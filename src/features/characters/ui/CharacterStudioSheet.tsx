'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Sparkles, Lock, Unlock, Pin, FileText, ListTree, Download } from 'lucide-react';
import Image from 'next/image';
import { Character } from '@/types';
import { useCharacterStore } from '../stores/characterStore';
import { dispatchInsertStep, type InsertTarget } from '@/lib/events/projectEvents';
import { fetchProjectDetail, saveStepEdit } from '@/features/projects';
import { loadOutline, saveOutline, type OutlineVolume } from '@/lib/storage/backup';
import { downloadImagesZip } from '@/lib/storage/imageExport';
import { useProjectStore } from '@/features/projects';
import { GenerationForm } from '@/shared/components';
import { submitImage } from '@/lib/api/generation';
import { toast } from 'sonner';

// 角色「生成立绘 / 素材管理」面板：卡片与列表行共用，避免两处重复实现。
export function CharacterStudioSheet({
  character,
  open,
  onOpenChange,
}: {
  character: Character;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);
  const addCharacterImage = useCharacterStore((s) => s.addCharacterImage);
  const images = character.images ?? [];
  const [askInsert, setAskInsert] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [chapters, setChapters] = useState<{ id: string; title: string }[]>([]);
  const [outline, setOutline] = useState<OutlineVolume[]>([]);

  const prepareInsert = (img: string) => {
    setAskInsert(img);
    const pid = character.projectId;
    if (!pid) return;
    fetchProjectDetail(pid)
      .then((steps) =>
        setChapters(
          steps
            .filter((s) => s.agent === 'writer' || /^#\s/.test(s.content || ''))
            .map((s) => ({
              id: s.id,
              title: s.content?.match(/^#\s*(.+)$/m)?.[1]?.trim() || 'untitled',
            })),
        ),
      )
      .catch(() => setChapters([]));
    loadOutline(pid)
      .then((vols) => setOutline(vols))
      .catch(() => setOutline([]));
  };

  const exportAllPortraits = async () => {
    const urls = character.images ?? [];
    if (urls.length === 0) {
      toast.error('该角色暂无可导出的立绘');
      return;
    }
    try {
      const { ok, failed } = await downloadImagesZip(urls, `${character.name}-立绘`, character.name);
      if (failed > 0) toast.success(`已导出 ${ok} 张（${failed} 张跨域受限，已存来源链接）`);
      else toast.success(`已导出 ${ok} 张立绘`);
    } catch {
      toast.error('导出失败，请重试');
    }
  };

  const doInsert = async (img: string, target: InsertTarget | undefined) => {
    const content = `![${character.name}](${img})`;
    const pid = character.projectId ?? '';
    setAskInsert(null);
    try {
      if (target?.kind === 'chapter') {
        const steps = await fetchProjectDetail(pid);
        const next = steps.map((s) => {
          if (s.id !== target.stepId) return s;
          const tail = s.content && !s.content.endsWith('\n') ? '\n' : '';
          return { ...s, content: `${s.content || ''}${tail}${content}`, status: 'completed' as const };
        });
        await saveStepEdit(pid, target.stepId, next.find((s) => s.id === target.stepId)!.content);
        await useProjectStore.getState().saveDraft(pid, next);
        toast.success('已插入章节正文');
        return;
      }
      if (target?.kind === 'outline') {
        const vols = await loadOutline(pid);
        const next: OutlineVolume[] = vols.map((v) => {
          if (v.id !== target.volumeId) return v;
          return {
            ...v,
            chapters: v.chapters.map((c) => {
              if (c.id !== target.chapterId) return c;
              return {
                ...c,
                nodes: c.nodes.map((n) => {
                  if (n.id !== target.nodeId) return n;
                  const tail = n.content && !n.content.endsWith('\n') ? '\n' : '';
                  return { ...n, content: `${n.content || ''}${tail}${content}` };
                }),
              };
            }),
          };
        });
        await saveOutline(pid, next);
        toast.success('已插入大纲节点');
        return;
      }
      const steps = await fetchProjectDetail(pid);
      const step = { id: `step-${Date.now()}`, agent: `${character.name} image`, content, status: 'completed' as const };
      const next = [...steps, step];
      await useProjectStore.getState().saveDraft(pid, next);
      dispatchInsertStep({ projectId: pid, title: `${character.name} image`, content });
      toast.success('已发送到工作台');
    } catch {
      toast.error('插入失败');
    }
  };

  const outlineNodes = outline.flatMap((v) =>
    v.chapters.flatMap((c) =>
      c.nodes.map((n) => ({ volumeId: v.id, chapterId: c.id, nodeId: n.id, label: `${v.title} / ${c.title} / ${n.title}` })),
    ),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="glass-sheet w-full sm:max-w-[22rem] overflow-y-auto rounded-l-3xl">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/30">
          <SheetTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> {character.name} · 生成立绘 / 素材</SheetTitle>
          <SheetDescription>设置参考图保证生成立绘一致；也可把图插入正文或大纲，或在右下角直接生成。</SheetDescription>
        </SheetHeader>
        <div className="mt-5 px-5 space-y-5">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">参考图</p>
            {images.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {images.slice(0, 9).map((img, i) => {
                  const isRef = (character.referenceImages ?? []).includes(img);
                  return (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border/40 group">
                      <Image src={img} alt={`${character.name} ${i + 1}`} fill unoptimized className="object-cover" />
                      {isRef && (
                        <span className="absolute top-0.5 left-0.5 text-[9px] px-1 rounded-full bg-primary text-primary-foreground">ref</span>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          title={isRef ? '取消参考图' : '设为参考图'}
                          onClick={() => {
                            const current = (character.referenceImages ?? []).filter(Boolean);
                            const next = current.includes(img)
                              ? current.filter((u) => u !== img)
                              : [...current, img].slice(0, 5);
                            updateCharacter(character.id, { referenceImages: next, referenceImage: next[0] ?? null }).catch(() => {});
                            toast.success(isRef ? '已移出参考图' : '已加入参考图');
                          }}
                          className="w-6 h-6 grid place-items-center rounded-full bg-black text-white"
                        >
                          {isRef ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        </button>
                        <button
                          type="button"
                          title="插入到正文/大纲"
                          onClick={() => { prepareInsert(img); }}
                          className="w-6 h-6 grid place-items-center rounded-full bg-white/90 text-foreground"
                        >
                          <Pin className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border/50 px-3 py-3">
                暂无可图片。先点「生成立绘」生成几张，再回来设一张为参考图。
              </p>
            )}
            {character.referenceImages && character.referenceImages.length > 0 ? (
              <p className="text-[11px] text-primary flex items-center gap-1">
                <Lock className="w-3 h-3" /> 已锁定 {character.referenceImages.length} 张参考图，生成立绘会尽量保持一致；可再次点击取消。
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">未设参考图：生图每次外观可能不同。点图中黑底白锁可设为参考图（最多 5 张）。</p>
            )}
          </div>

          {askInsert !== null && (
            <div className="space-y-3 rounded-xl border border-border/40 bg-background/40 p-3">
              <p className="text-sm font-medium flex items-center gap-1.5"><Pin className="w-4 h-4 text-primary" /> 把这张图插入到哪？</p>
              <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                {character.projectId ? (
                  <>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" /> 插入到章节正文
                      </p>
                        <div className="space-y-1">
                          {chapters.length === 0 && <p className="text-xs text-muted-foreground">暂无章节</p>}
                        {chapters.map((c) => (
                          <Button key={c.id} variant="outline" size="sm" className="w-full justify-start" onClick={() => doInsert(askInsert, { kind: 'chapter', stepId: c.id })}>
                            {c.title}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                        <ListTree className="w-3.5 h-3.5" /> 插入到大纲节点
                      </p>
                        <div className="space-y-1">
                          {outlineNodes.length === 0 && <p className="text-xs text-muted-foreground">暂无大纲</p>}
                        {outlineNodes.map((n) => (
                          <Button key={n.nodeId} variant="outline" size="sm" className="w-full justify-start" onClick={() => doInsert(askInsert, { kind: 'outline', volumeId: n.volumeId, chapterId: n.chapterId, nodeId: n.nodeId })}>
                            {n.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">该角色未关联到项目，只能发送到工作台。</p>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="ghost" className="flex-1" onClick={() => doInsert(askInsert, undefined)}>发到工作台</Button>
                <Button variant="outline" className="flex-1" onClick={() => setAskInsert(null)}>取消</Button>
              </div>
            </div>
          )}

          <div className="pt-4 mt-1 px-5 -mx-5 border-t border-border/30 space-y-2">
            <Button className="w-full" onClick={() => setShowGenerate(true)}>
              <Sparkles className="w-4 h-4 mr-2" /> 生成立绘
            </Button>
            <Button variant="outline" className="w-full" onClick={exportAllPortraits} disabled={(character.images ?? []).length === 0}>
              <Download className="w-4 h-4 mr-2" /> 导出全部立绘（{(character.images ?? []).length}）
            </Button>
          </div>
        </div>

        {showGenerate && (
          <div className="absolute inset-0 z-20 bg-background/95 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-primary" /> 生成 {character.name} 的立绘</p>
              <Button variant="ghost" size="sm" onClick={() => setShowGenerate(false)}>关闭</Button>
            </div>
            <GenerationForm
              kind="image"
              defaultCharacterId={character.id}
              defaultProjectId={character.projectId}
              characterImages={character.referenceImages?.length ? character.referenceImages.slice(0, 5) : []}
              submitLabel="生成并加入图库"
              onSubmit={async (payload) => {
                try {
                  const task = await submitImage({
                    prompt: payload.prompt,
                    negative_prompt: payload.negative_prompt,
                    style: payload.style,
                    size: payload.size,
                    count: payload.count,
                    model_id: payload.model_id,
                    project_id: payload.project_id,
                    characterId: character.id,
                    reference_images: character.referenceImages?.length ? character.referenceImages.slice(0, 5) : undefined,
                  });
                  const url = task?.result_url || `https://picsum.photos/seed/${character.id}-${Date.now()}/512`;
                  await addCharacterImage(character.id, url);
                  toast.success('已生成并加入角色图库');
                  setShowGenerate(false);
                } catch {
                  toast.error('生成失败，请检查模型或后端连接');
                }
              }}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
