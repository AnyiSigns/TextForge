// src/app/(dashboard)/projects/[id]/WorkbenchTab.tsx
// 项目工作台「工作台」标签页内容：上下文选择器、流水线图、步骤列表与生成控制区。
import { MainTextTargetDialog } from '@/features/projects';
import { useState } from 'react';
import { WorkflowGraph } from '@/features/projects';
import { StepCard } from '@/features/projects';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users,
  Layers,
  Check,
  Sparkles,
  Info,
  Wand2,
  PenLine,
  Pause,
  Play,
  Send,
  FileText,
  FileCog,
} from 'lucide-react';
import { EmptyState } from '@/shared/components';
import { useWorkbench } from '@/features/projects';
import { listOutlines, createOutline, updateOutline } from '@/features/projects';
import { loadOutline } from '@/lib/storage/backup';
import type { OutlineVolume } from '@/lib/storage/backup';
import type { Step } from '@/types';
import { toast } from 'sonner';

export function WorkbenchTab({
  wb,
  bookId,
  onNavigateToManuscript,
  onNavigateToCreativeSetting,
}: {
  wb: ReturnType<typeof useWorkbench>;
  bookId: string;
  onNavigateToManuscript?: () => void;
  onNavigateToCreativeSetting?: () => void;
}) {
  const [mainTextOpen, setMainTextOpen] = useState(false);
  const [mainText, setMainText] = useState('');
  const {
    creativeSetting,
    projectChars,
    seeded,
    setSeedOpen,
    isGraphOpen,
    setIsGraphOpen,
    isStreaming,
    isPaused,
    setIsPaused,
    pausedRef,
    steps,
    currentAgent,
    handleGenerate,
    handleCancel,
    selectedCharIds,
    selectedSectionIds,
    toggleChar,
    toggleSection,
    activeWorkflow,
    scrollRef,
    outlineVolumes,
    setOutlineVolumes,
  } = wb;

  const togglePause = () => {
    setIsPaused((p) => {
      const next = !p;
      pausedRef.current = next;
      return next;
    });
  };

  const handleSetAsMainText = async (step: Step) => {
    setMainText(step.content || '');
    const bid = Number(bookId);
    try {
      const items = await listOutlines(bid);
      if (items.length > 0) {
        const raw = items[0].data;
        const volumes: OutlineVolume[] = Array.isArray(raw) ? raw : ((raw as unknown as { data?: OutlineVolume[] })?.data ?? []);
        setOutlineVolumes(Array.isArray(volumes) ? volumes : []);
      } else {
        const local = await loadOutline(bookId);
        setOutlineVolumes(local);
      }
    } catch {
      // keep existing outlineVolumes
    }
    setMainTextOpen(true);
  };

  const handleMainTextConfirm = async (action: 'create_volume' | 'create_chapter' | 'overwrite_chapter', payload: { volumeId?: string; chapterId?: string; volumeTitle?: string; chapterTitle?: string }) => {
    const bid = Number(bookId);
    setOutlineVolumes((prev) => {
      const clone = JSON.parse(JSON.stringify(prev)) as OutlineVolume[];
      if (action === 'create_volume' && payload.volumeTitle) {
        const newVol: OutlineVolume = { id: `vol-${Date.now()}`, title: payload.volumeTitle, chapters: [], origin: 'init' };
        clone.push(newVol);
        return clone;
      }
      if ((action === 'create_chapter' || action === 'overwrite_chapter') && payload.volumeId && payload.chapterTitle) {
        const vol = clone.find(v => v.id === payload.volumeId);
        if (vol) {
          if (action === 'create_chapter') {
            vol.chapters.push({ id: `ch-${Date.now()}`, title: payload.chapterTitle, content: mainText, nodes: [], origin: 'init' });
          } else if (action === 'overwrite_chapter' && payload.chapterId) {
            const chap = vol.chapters.find(c => c.id === payload.chapterId);
            if (chap) { chap.content = mainText; }
          }
        }
      }
      return clone;
    });
    try {
      const existing = await listOutlines(bid);
      if (existing.length === 0) {
        if (action === 'create_volume' && payload.volumeTitle) {
          await createOutline(bid, [{
            id: `vol-${Date.now()}`,
            title: payload.volumeTitle,
            chapters: [],
            origin: 'init',
          } as OutlineVolume]);
        }
      } else {
      const current = existing[0].data || [];
      const rawArr: OutlineVolume[] | undefined = Array.isArray(current) ? current : (current as unknown as { data?: OutlineVolume[] })?.data;
      const source = Array.isArray(rawArr) ? rawArr : [];
      const clone = JSON.parse(JSON.stringify(source)) as OutlineVolume[];
        if (action === 'create_volume' && payload.volumeTitle) {
          const newVol: OutlineVolume = { id: `vol-${Date.now()}`, title: payload.volumeTitle, chapters: [], origin: 'init' };
          clone.push(newVol);
        } else if ((action === 'create_chapter' || action === 'overwrite_chapter') && payload.volumeId) {
          const vol = clone.find(v => v.id === payload.volumeId);
          if (vol) {
            if (action === 'create_chapter') {
              if (!payload.chapterTitle) { toast.error('请输入章节名'); return; }
              const title = `第${vol.chapters.length + 1}章·${payload.chapterTitle}`;
              vol.chapters.push({ id: `ch-${Date.now()}`, title, content: mainText, nodes: [], origin: 'init' });
            } else if (action === 'overwrite_chapter' && payload.chapterId) {
              const chap = vol.chapters.find(c => c.id === payload.chapterId);
              if (chap) {
                chap.content = mainText;
                if (payload.chapterTitle) {
                  chap.title = `第${vol.chapters.findIndex(c => c.id === payload.chapterId) + 1}章·${payload.chapterTitle}`;
                }
              }
            }
          }
        }
        await updateOutline(bid, existing[0].id, clone);
      }
      window.dispatchEvent(new CustomEvent('outline-seeded', { detail: { bookId } }));
      if (action !== 'create_volume') {
        toast.success('正文写入成功');
        setMainTextOpen(false);
      } else {
        toast.success('卷创建成功');
      }
    } catch {
      toast.error('写入失败');
    }
  };

  return (
    <>
      {/* 章节级上下文选择器：出场角色 + 相关设定维度 */}
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <Card className="glass-card">
          <CardContent className="pt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> 本章出场角色
            </p>
            {projectChars.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无角色，去「角色」标签创建。</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {projectChars.map((c) => {
                  const on = selectedCharIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleChar(c.id)}
                      className={`px-2.5 py-1 rounded-full text-xs border flex items-center gap-1 ${on ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}
                    >
                      {on && <Check className="w-3 h-3" />} {c.name}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="pt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> 本章相关设定维度
            </p>
            {(creativeSetting?.customDimensions ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                暂无自定义维度，去「创作设定」添加（势力/战力/阵营…）。
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {creativeSetting!.customDimensions!.map((sec) => {
                  const on = selectedSectionIds.includes(sec.id);
                  return (
                    <button
                      key={sec.id}
                      onClick={() => toggleSection(sec.id)}
                      className={`px-2.5 py-1 rounded-full text-xs border flex items-center gap-1 ${on ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}
                    >
                      {on && <Check className="w-3 h-3" />} {sec.title}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <WorkflowGraph
        steps={steps}
        currentAgent={currentAgent}
        isOpen={isGraphOpen}
        onToggle={() => setIsGraphOpen((o) => !o)}
        workflow={activeWorkflow}
        workflowName={activeWorkflow?.name}
      />

      {seeded && (steps.length > 0 || creativeSetting?.worldview || projectChars.length > 0) && (
        <div className="my-4 flex items-start gap-2 rounded-lg bg-primary/10 border border-primary/30 p-2.5 text-xs text-primary/90">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            你的世界观、角色和大纲已生成，可以直接编辑。建议<strong>先修改一两处</strong>
            （如世界观或主角名），让它更像你的作品，再生成正文。
          </span>
        </div>
      )}

      {/* 首次进入空态引导：一句话开局 + 手动引导 */}
      {steps.length === 0 && (
        <div className="my-4 space-y-4">
          <Card className="glass-card border-primary/40">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="w-4 h-4 text-primary" />
                一句话开局
              </div>
              <p className="text-xs text-muted-foreground">
                输入一句话（如「一艘拾荒船打捞星海记忆的科幻故事」），自动生成世界观、角色与大纲，再进入写作流程生成正文。
              </p>
              <Button size="sm" onClick={() => setSeedOpen(true)}>
                <Sparkles className="w-4 h-4 mr-1.5" /> 一句话开局
              </Button>
            </CardContent>
          </Card>

          <EmptyState
            icon={Wand2}
            title="或手动开始"
            description="            按引导四步走：①写创作设定 ②建角色 ③选写作流程生成 ④确认/续写。随时可去「手稿」自己写。"
            action={
              <div className="flex gap-2 justify-center flex-wrap">
                <Button size="sm" onClick={onNavigateToManuscript}>
                  <PenLine className="w-4 h-4 mr-1.5" /> 直接写第一章
                </Button>
                <Button size="sm" variant="outline" onClick={onNavigateToCreativeSetting}>
                  <FileCog className="w-4 h-4 mr-1.5" /> 写创作设定
                </Button>
                <Button size="sm" variant="default" onClick={handleGenerate}>
                  <Send className="w-4 h-4 mr-1.5" /> 开始生成
                </Button>
              </div>
            }
          />
        </div>
      )}

      <div className="mt-4 pr-4" ref={scrollRef}>
        <div className="space-y-4 pb-4">
          {steps.length === 0 && (
            <EmptyState icon={FileText} title="还没有内容" description="点击下方按钮开始生成小说" />
          )}
          {steps.map((step, index) => (
            <StepCard
              key={step.id}
              step={step}
              index={index}
              onSetAsMainText={handleSetAsMainText}
              onCancel={step.status === 'streaming' ? handleCancel : undefined}
              bookId={Number(bookId)}
            />
          ))}
        </div>
      </div>

      <MainTextTargetDialog
        open={mainTextOpen}
        onOpenChange={setMainTextOpen}
        volumes={outlineVolumes}
        mainText={mainText}
        onConfirm={handleMainTextConfirm}
      />

      <div className="border-t border-border/40 pt-4 mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isStreaming ? (
            <Button variant="outline" size="sm" onClick={togglePause}>
              {isPaused ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
              {isPaused ? '继续' : '暂停'}
            </Button>
          ) : (
            <>
              {steps.some((s) => s.status === 'waiting') ? (
                <Button size="sm" onClick={handleGenerate}>
                  <Send className="w-4 h-4 mr-2" /> 继续生成
                </Button>
              ) : steps.some((s) => s.status === 'completed') ? (
                <Button size="sm" onClick={handleGenerate}>
                  <Send className="w-4 h-4 mr-2" /> 续写下一章
                </Button>
              ) : null}
              {steps.some((s) => s.status === 'completed') && (
                <span className="text-xs text-muted-foreground">
                  正文已生成，可「确认继续」或去「手稿」自己改
                </span>
              )}
            </>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {steps.length} 步 · {steps.filter((s) => s.status === 'completed').length} 已完成
        </span>
      </div>
    </>
  );
}
