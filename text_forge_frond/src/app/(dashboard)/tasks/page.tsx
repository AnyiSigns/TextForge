// src/app/(dashboard)/tasks/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/PageHeader';
import { GenerationForm } from '@/components/shared/GenerationForm';
import { submitVideo, fetchVideoTasks, describeGenError, type MediaTask, type VideoRequest } from '@/lib/api/generation';
import { fetchProjectDetail } from '@/lib/api/projects';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/shared/states';
import { ProcessNav } from '@/components/projects/ProcessNav';
import { PortfolioGallery } from '@/components/projects/PortfolioGallery';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { useBriefStore, briefToContextLine } from '@/lib/stores/briefStore';
import type { GenerationContext } from '@/types';
import { Video, Clapperboard, Film, Link as LinkIcon, LayoutGrid, BookOpen, Download } from 'lucide-react';
import { downloadSingleImage, downloadImagesZip } from '@/lib/storage/imageExport';

export default function TasksPage() {
  const [tasks, setTasks] = useState<MediaTask[]>([]);
  const [tab, setTab] = useState('videos');
  const [chapterOptions, setChapterOptions] = useState<{ id: string; label: string }[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const { characters } = useCharacterStore();
  const brief = useBriefStore((s) => (activeProjectId ? s.briefs[activeProjectId] : undefined));
  const genContext: GenerationContext | undefined = activeProjectId
    ? { project_id: activeProjectId, summary: briefToContextLine(brief) || undefined, outline: brief?.worldview || brief?.tone || undefined }
    : undefined;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // 当关联项目变化：加载该项目的章节作为"从章节生成"选项，并收集其角色立绘（3.1 资产树）
  useEffect(() => {
    let cancelled = false;
    if (!activeProjectId) { setChapterOptions([]); return; }
    (async () => {
      try {
        const steps = await fetchProjectDetail(activeProjectId);
        if (cancelled) return;
        const opts = steps
          .filter((s) => s.agent === 'writer' || s.nodeId === 'writer')
          .map((s, i) => ({ id: s.id, label: `第${i + 1}章 · ${(s.content.match(/^#\s*(.+)$/m)?.[1] || '未命名').slice(0, 16)}` }));
        setChapterOptions(opts);
      } catch { /* mock 期可能为空，忽略 */ }
    })();
    return () => { cancelled = true; };
  }, [activeProjectId]);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setTasks(await fetchVideoTasks());
      } catch { /* ignore */ }
    };
    fetchTasks();
    
    const hasActiveTasks = tasks.some(t => t.status === 'pending' || t.status === 'processing');
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (hasActiveTasks) {
      intervalRef.current = setInterval(fetchTasks, 2000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [tasks]);

  const handleGenerate = async (p: VideoRequest) => {
    if (!p.prompt?.trim()) return;
    try {
      await submitVideo(p);
      toast.success('任务已提交');
      const data = await fetchVideoTasks();
      setTasks(data);
    } catch (error: unknown) {
      toast.error('提交失败', { description: describeGenError(error) });
    }
  };

  const getStatusBadge = (status: MediaTask['status']) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="text-xs">等待</Badge>;
      case 'processing': return <Badge variant="secondary" className="text-xs">处理中</Badge>;
      case 'completed': return <Badge variant="default" className="text-xs">完成</Badge>;
      case 'failed': return <Badge variant="destructive" className="text-xs">失败</Badge>;
    }
  };

  return (
    <div className="page-shell">
      <PageHeader icon={Video} title="AI 视频" description="输入描述，选择模型与参数生成 AI 视频" />

      <ProcessNav
        tabs={[
          { value: 'videos', label: '视频', icon: Video },
          { value: 'all', label: '综合作品集', icon: LayoutGrid },
        ]}
        value={tab}
        onValueChange={setTab}
      >
        {tab === 'videos' && (
          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6 items-start">
            <GenerationForm
              key={activeProjectId ?? 'none'}
              kind="video"
              defaultProjectId={activeProjectId}
              chapterOptions={chapterOptions}
              characters={activeProjectId ? characters.filter((c) => (c.projectId ?? null) === activeProjectId) : []}
              context={genContext}
              onProjectChange={setActiveProjectId}
              onSubmit={handleGenerate}
            />

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Film className="w-4 h-4 text-primary" /> 任务列表</CardTitle>
                {tasks.some((t) => t.status === 'completed' && t.result_url) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={async () => {
                      const urls = tasks.filter((t) => t.status === 'completed' && t.result_url).map((t) => t.result_url!);
                      try {
                        const { ok, failed } = await downloadImagesZip(urls, 'AI视频素材', 'video');
                        if (failed > 0) toast.success(`已导出 ${ok} 个（${failed} 个跨域受限，已存来源链接）`);
                        else toast.success(`已导出 ${ok} 个视频`);
                      } catch {
                        toast.error('导出失败');
                      }
                    }}
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" /> 导出全部视频（{tasks.filter((t) => t.status === 'completed' && t.result_url).length}）
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {tasks.length === 0 ? (
                  <EmptyState
                    icon={Clapperboard}
                    title="暂无任务"
                    description="在左侧填写描述生成你的第一个 AI 视频"
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger">
                    {tasks.map((task) => (
                      <div key={task.id} className={cn(
                        'group relative rounded-xl border border-border/40 overflow-hidden bg-background/40 transition-all hover:border-primary/30',
                      )}>
                        <div className="aspect-video bg-gradient-to-br from-primary/10 to-accent/30 grid place-items-center">
                          {task.status === 'completed' && task.result_url ? (
                            <video src={task.result_url} className="w-full h-full object-cover" controls />
                          ) : (
                            <div className="text-center text-muted-foreground">
                              <Film className="w-6 h-6 mx-auto mb-1 opacity-50" />
                              <span className="text-xs">{task.status === 'processing' ? `进度 ${task.progress ?? 0}%` : '待生成'}</span>
                            </div>
                          )}
                        </div>
                        <div className="p-2.5 space-y-1.5">
                          <p className="text-xs truncate">{task.prompt}</p>
                          {/* 3.3 回链：视频来自某章节时显示并可跳回工作台对应项目 */}
                          {task.chapter_id && task.project_id && (
                            <Link
                              href={`/projects/${task.project_id}`}
                              className="inline-flex items-center gap-1 text-[11px] text-primary/80 hover:text-primary hover:underline"
                            >
                              <BookOpen className="w-3 h-3" /> 来自本章 · 回到项目
                            </Link>
                          )}
                          <div className="flex items-center justify-between">
                            {getStatusBadge(task.status)}
                            {task.status === 'completed' && task.result_url && (
                              <div className="flex items-center gap-2">
                                <a href={task.result_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                                  <LinkIcon className="w-3 h-3" /> 查看
                                </a>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await downloadSingleImage(task.result_url!, `${task.prompt.slice(0, 20) || '视频'}-${task.id.slice(0, 6)}.mp4`);
                                      toast.success('已开始下载视频');
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