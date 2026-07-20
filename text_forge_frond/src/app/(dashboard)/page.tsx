'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/stores/authStore';
import { useBriefStore } from '@/features/projects';
import { useProjectStore } from '@/features/projects';
import { useCharacterStore } from '@/features/characters';
import { getManuscriptChapters } from '@/lib/storage/indexedDB';
import { fetchVideoTasks, type MediaTask } from '@/lib/api/generation';
import apiClient from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Clock, LayoutDashboard, Target, Users, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({ projects: 0, characters: 0, active: 0, totalWords: 0, completedWords: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const projects = useProjectStore((s) => s.projects);
  const loadProjects = useProjectStore((s) => s.load);
  const briefs = useBriefStore((s) => s.briefs);
  const characters = useCharacterStore((s) => s.characters);
  const [mediaTasks, setMediaTasks] = useState<MediaTask[]>([]);
  // 各项目真实手稿章节数（直接读 IndexedDB，避免 manuscriptStore 仅缓存单项目导致统计恒为 0）
  const [chapterCounts, setChapterCounts] = useState<Record<string, { total: number; written: number }>>({});

  const totalWordGoal = Object.values(briefs).reduce((acc, b) => acc + (b.wordCountGoal ?? 0), 0);
  const dailyGoal = Object.values(briefs).reduce((acc, b) => acc + (b.dailyWordCountGoal ?? 0), 0);

  useEffect(() => {
    fetchVideoTasks().then(setMediaTasks).catch(() => {});
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // 真实统计各项目手稿章节数（含空章节也计入"已建"），修复仪表盘恒显 0 章
  useEffect(() => {
    if (projects.length === 0) return;
    let cancelled = false;
    (async () => {
      const counts: Record<string, { total: number; written: number }> = {};
      await Promise.all(
        projects.map(async (p) => {
          try {
            const chs = await getManuscriptChapters(p.id);
            counts[p.id] = {
              total: chs.length,
              written: chs.filter((c) => c.content?.trim()).length,
            };
          } catch {
            counts[p.id] = { total: 0, written: 0 };
          }
        }),
      );
      if (!cancelled) setChapterCounts(counts);
    })();
    return () => { cancelled = true; };
  }, [projects]);

  useEffect(() => {
    let cancelled = false;
    const fetchStats = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [projectsRes, charactersRes] = await Promise.all([
          apiClient.get('/api/projects'),
          apiClient.get('/api/characters'),
        ]);
        if (cancelled) return;
        const projects = projectsRes.data.projects || [];
        const characters = charactersRes.data.characters || [];
        const totalWords = projects.reduce((acc: number, p: { wordCount?: number }) => acc + (p.wordCount || 0), 0);
        setStats({
          projects: projects.length,
          characters: characters.length,
          active: projects.filter((p: { status: string }) => p.status === 'generating').length,
          totalWords,
          completedWords: totalWords,
        });
      } catch (err: unknown) {
        if (cancelled) return;
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e.message || '加载失败');
        toast.error('加载仪表盘数据失败', { description: e.message });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchStats();
    return () => { cancelled = true; };
  }, []);

  const statCards = [
    { icon: BookOpen, label: '项目数', value: String(stats.projects), color: 'text-blue-500' },
    { icon: Users, label: '角色数', value: String(stats.characters), color: 'text-purple-500' },
    { icon: Clock, label: '进行中', value: String(stats.active), color: 'text-orange-500' },
    { icon: Target, label: '目标字数', value: totalWordGoal > 0 ? `${totalWordGoal.toLocaleString()} 字` : '-', color: 'text-green-500' },
  ];

  const progressCards = [
    { icon: BarChart3, label: '总字数', value: stats.totalWords > 0 ? `${stats.totalWords.toLocaleString()} 字` : '-', color: 'text-indigo-500' },
    { icon: BarChart3, label: '今日目标', value: dailyGoal > 0 ? `${dailyGoal.toLocaleString()} 字` : '-', color: 'text-pink-500' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="仪表盘"
        description={`欢迎回来，${user?.username || '用户'}！`}
      />

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? '-' : stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {progressCards.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? '-' : stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>我的书进展</CardTitle>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有书。点右下角「新建项目」开始你的第一部作品吧。</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {projects.map((p) => {
                const count = chapterCounts[p.id] ?? { total: 0, written: 0 };
                const imgs = characters.filter((c) => c.projectId === p.id).reduce((acc, c) => acc + (c.images?.length ?? 0), 0);
                const vids = mediaTasks.filter((t) => t.project_id === p.id).length;
                return (
                  <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-background/40 px-4 py-3 hover:border-primary/30 transition-colors">
                    <div className="min-w-0">
                      <p className="font-medium truncate">《{p.title}》</p>
                      <p className="text-xs text-muted-foreground">已建 {count.total} 章 · 已写 {count.written} 章 · 角色图 {imgs} 张 · 视频 {vids} 段</p>
                    </div>
                    <BookOpen className="w-4 h-4 text-primary shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>快速开始</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3">
            <Button asChild>
              <Link href="/projects/new"><BookOpen className="w-4 h-4 mr-2" /> 新建项目</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/characters"><Users className="w-4 h-4 mr-2" /> 角色列表</Link>
            </Button>
          </div>
          {projects.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">最近项目</p>
              <div className="flex flex-wrap gap-2">
                {projects.slice(0, 4).map((p) => (
                  <Button key={p.id} asChild size="sm" variant="ghost">
                    <Link href={`/projects/${p.id}`}>{p.title}</Link>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}