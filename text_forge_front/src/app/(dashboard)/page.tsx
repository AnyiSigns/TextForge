'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/stores/authStore';
import { useBookStore } from '@/features/projects';
import { useCharacterStore } from '@/features/characters';
import { getManuscriptChapters } from '@/lib/storage/indexedDB';
import { fetchVideoTasks, type MediaTask } from '@/lib/api/generation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, LayoutDashboard, Target, Users, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/shared/components';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({ books: 0, characters: 0, totalWords: 0, completedWords: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const books = useBookStore((s) => s.books);
  const loadBooks = useBookStore((s) => s.load);
  const characters = useCharacterStore((s) => s.characters);
  const loadCharacters = useCharacterStore((s) => s.load);
  const [mediaTasks, setMediaTasks] = useState<MediaTask[]>([]);
  const [chapterCounts, setChapterCounts] = useState<Record<string, { total: number; written: number }>>({});

  const totalWordGoal = useMemo(() => books.reduce((acc, b) => acc + (b.totalWordGoal ?? 0), 0), [books]);
  const dailyGoal = useMemo(() => books.reduce((acc, b) => acc + (b.currentWordCount ?? 0), 0), [books]);

  useEffect(() => {
    fetchVideoTasks().then(setMediaTasks).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        await Promise.all([loadBooks(), loadCharacters()]);
        if (cancelled) return;
      } catch (err: unknown) {
        if (cancelled) return;
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e.message || '加载失败');
        toast.error('加载仪表盘数据失败', { description: e.message });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [loadBooks, loadCharacters]);

  useEffect(() => {
    if (books.length === 0) return;
    let cancelled = false;
    (async () => {
      const counts: Record<string, { total: number; written: number }> = {};
      await Promise.all(
        books.map(async (p) => {
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
  }, [books]);

  useEffect(() => {
    setStats({
      books: books.length,
      characters: characters.length,
      totalWords: dailyGoal,
      completedWords: dailyGoal,
    });
  }, [books.length, characters.length, dailyGoal]);

  const statCards = [
    { icon: BookOpen, label: '书籍数', value: String(stats.books), color: 'text-blue-500' },
    { icon: Users, label: '角色数', value: String(stats.characters), color: 'text-purple-500' },
    { icon: Target, label: '目标字数', value: totalWordGoal > 0 ? `${totalWordGoal.toLocaleString()} 字` : '-', color: 'text-green-500' },
  ];

  const progressCards = [
    { icon: BarChart3, label: '总字数', value: stats.totalWords > 0 ? `${stats.totalWords.toLocaleString()} 字` : '-', color: 'text-indigo-500' },
    { icon: BarChart3, label: '当前字数', value: dailyGoal > 0 ? `${dailyGoal.toLocaleString()} 字` : '-', color: 'text-pink-500' },
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
            {books.length === 0 ? (
              <p className="text-sm text-muted-foreground">还没有书。点右下角「新建项目」开始你的第一部作品吧。</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {books.map((p) => {
                  const count = chapterCounts[p.id] ?? { total: 0, written: 0 };
                  const imgs = characters.filter((c) => c.bookId === p.id).reduce((acc, c) => acc + (c.avatarUrl ? 1 : 0), 0);
                  const vids = mediaTasks.filter((t) => t.project_id === String(p.id)).length;
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
          {books.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">最近项目</p>
              <div className="flex flex-wrap gap-2">
                {books.slice(0, 4).map((p) => (
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