'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { GenerationForm } from '@/components/shared/GenerationForm';
import { submitImage, fetchImageResults, describeGenError, type MediaTask, type ImageRequest } from '@/lib/api/generation';
import { toast } from 'sonner';
import { Image as ImageIcon, Link as LinkIcon, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/shared/states';
import { ProcessNav } from '@/components/projects/ProcessNav';
import { PortfolioGallery } from '@/components/projects/PortfolioGallery';
import { Images, LayoutGrid, Download } from 'lucide-react';
import { downloadSingleImage, downloadImagesZip } from '@/lib/storage/imageExport';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { useBriefStore, briefToContextLine } from '@/lib/stores/briefStore';
import type { GenerationContext } from '@/types';

export default function AssetsPage() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<MediaTask[]>([]);
  const [tab, setTab] = useState('images');
  const [projectId, setProjectId] = useState<string | null>(null);
  const { characters } = useCharacterStore();
  const brief = useBriefStore((s) => (projectId ? s.briefs[projectId] : undefined));
  const genContext: GenerationContext | undefined = projectId
    ? { project_id: projectId, summary: briefToContextLine(brief) || undefined, outline: brief?.worldview || brief?.tone || undefined }
    : undefined;
  // 角色页「生成立绘」深链：?character=ID&project=PID → 预选角色并自动拼提示词
  const deepCharacterId = searchParams.get('character');
  const deepProjectId = searchParams.get('project');
  const deepChapterId = searchParams.get('chapter');
  const deepCharacter = deepCharacterId ? characters.find((c) => c.id === deepCharacterId) : undefined;
  const defaultCharacterId = deepCharacter?.id ?? null;
  const defaultProjectId = deepProjectId ?? deepCharacter?.projectId ?? null;
  // 工作台「章节插图」深链：?project=PID&chapter=STEPID → 预选章节插图用例
  const defaultUseCase = deepChapterId ? 'chapter_art' : undefined;
  const defaultChapterId = deepChapterId ?? null;
  const defaultPrompt = deepCharacter
    ? `${deepCharacter.name}，${deepCharacter.description || ''}。角色立绘，全身像，清晰五官，风格统一。`.slice(0, 1000)
    : '';

  const characterImages = deepCharacter
    ? (deepCharacter.referenceImages ?? (deepCharacter.referenceImage ? [deepCharacter.referenceImage] : [])).slice(0, 5)
    : [];

  // 项目内角色：下拉与选项统一使用同一份（深链时也与底层 matching 用的 characters 同源，避免口径分裂）
  const projectCharacters = projectId
    ? characters.filter((c) => (c.projectId ?? null) === projectId)
    : [];

  useEffect(() => {
    const load = async () => {
      try {
        const list = await fetchImageResults(projectId ?? undefined);
        setItems(list);
        // 生成完成的图片自动写回角色图库（后端未回写时本地兜底）
        const { addCharacterImage } = useCharacterStore.getState();
        for (const it of list) {
          if (it.status !== 'completed' || !it.result_url) continue;
          if (it.source === 'character' && it.source_ref) {
            const char = useCharacterStore.getState().characters.find((c) => c.id === it.source_ref);
            if (char && !(char.images ?? []).includes(it.result_url)) {
              await addCharacterImage(it.source_ref, it.result_url).catch(() => {});
            }
          } else if (it.source === 'chapter' && it.character_ids && it.character_ids.length) {
            // 章节插图：自动加入该章出场角色的角色素材
            for (const cid of it.character_ids) {
              const char = useCharacterStore.getState().characters.find((c) => c.id === cid);
              if (char && !(char.images ?? []).includes(it.result_url)) {
                await addCharacterImage(cid, it.result_url).catch(() => {});
              }
            }
          }
        }
      } catch { /* ignore */ }
    };
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [projectId]);

  const handleGenerate = async (p: ImageRequest) => {
    try {
      // 角色一致性：按提交的角色 id 取该角色自身锁定的多张参考图/种子（避免深链角色与表单所选角色错配）
      const selChar = p.characterId ? characters.find((c) => c.id === p.characterId) : undefined;
      const refImages = selChar ? (selChar.referenceImages ?? (selChar.referenceImage ? [selChar.referenceImage] : [])).slice(0, 5) : undefined;
      const payload: ImageRequest = {
        ...p,
        ...(refImages?.length ? { reference_images: refImages } : {}),
        ...(selChar?.imageSeed != null ? { seed: selChar.imageSeed } : {}),
      };
      await submitImage(payload);
      toast.success('生成成功，已加入队列');
      if (payload.project_id) setProjectId(payload.project_id);
    } catch (error: unknown) {
      toast.error('提交失败', { description: describeGenError(error) });
    }
  };

  return (
    <div className="page-shell">
      <PageHeader icon={ImageIcon} title="AI 绘画" description="输入描述，选择模型与风格生成图片" />

      <ProcessNav
        tabs={[
          { value: 'images', label: '图片', icon: Images },
          { value: 'all', label: '综合作品集', icon: LayoutGrid },
        ]}
        value={tab}
        onValueChange={setTab}
      >
        {tab === 'images' && (
          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6 items-start">
            <GenerationForm
              key={`${defaultCharacterId ?? ''}-${defaultChapterId ?? ''}`}
              kind="image"
              defaultProjectId={defaultProjectId}
              defaultCharacterId={defaultCharacterId}
              defaultChapterId={defaultChapterId}
              useCase={defaultUseCase}
              defaultPrompt={defaultPrompt}
              context={genContext}
              characterImages={characterImages}
              projectCharacters={projectCharacters}
              characters={projectId ? characters.filter((c) => (c.projectId ?? null) === projectId) : []}
              onProjectChange={setProjectId}
              onSubmit={handleGenerate}
            />

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ImageIcon className="w-4 h-4 text-primary" /> 生成记录</CardTitle>
                {items.some((it) => it.status === 'completed' && it.result_url) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={async () => {
                      const urls = items.filter((it) => it.status === 'completed' && it.result_url).map((it) => it.result_url!);
                      try {
                        const { ok, failed } = await downloadImagesZip(urls, 'AI绘画素材', 'image');
                        if (failed > 0) toast.success(`已导出 ${ok} 张（${failed} 张跨域受限，已存来源链接）`);
                        else toast.success(`已导出 ${ok} 张图片`);
                      } catch {
                        toast.error('导出失败');
                      }
                    }}
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" /> 导出全部图片（{items.filter((it) => it.status === 'completed' && it.result_url).length}）
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <EmptyState
                    icon={ImageIcon}
                    title="还没有生成记录"
                    description="在左侧填写描述生成你的第一张 AI 图片"
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-3 stagger">
                    {items.map((it) => (
                      <div key={it.id} className="rounded-xl border border-border/40 overflow-hidden bg-background/40">
                        <div className="aspect-square bg-gradient-to-br from-primary/10 to-accent/30 grid place-items-center">
                          {it.status === 'processing' || it.status === 'pending' ? (
                            <div className="text-center text-muted-foreground">
                              <Loader2 className="w-6 h-6 mx-auto mb-1 animate-spin opacity-60" />
                              <span className="text-xs">生成中</span>
                            </div>
                          ) : it.status === 'failed' ? (
                            <span className="text-xs text-destructive">失败</span>
              ) : it.result_url ? (
                            <div className="relative w-full h-full">
                              <Image src={it.result_url} alt={it.prompt} fill className="object-cover" />
                            </div>
                          ) : (
                          <ImageIcon className="w-6 h-6 opacity-40" />
                        )}
                        </div>
                        <div className="p-2.5">
                          <p className="text-xs truncate">{it.prompt}</p>
                          {it.result_url && (
                            <div className="flex items-center gap-2 mt-1">
                              <a href={it.result_url} target="_blank" rel="noopener noreferrer" className={cn('text-xs text-primary hover:underline flex items-center gap-1')}>
                                <LinkIcon className="w-3 h-3" /> 查看原图
                              </a>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await downloadSingleImage(it.result_url!, `${it.prompt.slice(0, 20) || '图片'}-${it.id.slice(0, 6)}.png`);
                                    toast.success('已开始下载图片');
                                  } catch {
                                    toast.error('下载失败');
                                  }
                                }}
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" /> 下载
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
        {tab === 'all' && <PortfolioGallery />}
      </ProcessNav>
    </div>
  );
}
