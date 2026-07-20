// src/app/(dashboard)/manuscript/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PenLine, Search, FolderKanban, FileText, ArrowRight, LayoutGrid, List } from 'lucide-react';
import { PageHeader } from '@/shared/components';
import { Spinner, EmptyState } from '@/shared/components';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/features/projects';
import { useManuscriptStore } from '@/features/manuscript';

type ViewMode = 'grid' | 'list';

export default function ManuscriptListPage() {
  const projects = useProjectStore((s) => s.projects);
  const load = useProjectStore((s) => s.load);
  const chapters = useManuscriptStore((s) => s.chapters);
  const loadChapters = useManuscriptStore((s) => s.load);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    load().catch(() => {}).finally(() => setIsLoading(false));
  }, [load]);

  useEffect(() => {
    // 载入所有项目的手稿章节数（简单起见逐个 load）
    Promise.all(projects.map((p) => loadChapters(p.id))).catch(() => {});
  }, [projects, loadChapters]);

  const countFor = (projectId: string) => chapters.filter((c) => c.projectId === projectId).length;

  const filtered = projects.filter((p) => p.title.includes(search));

  if (isLoading) return <Spinner label="正在加载手稿…" />;

  return (
    <div className="page-shell">
      <PageHeader
        icon={PenLine}
        title="手稿"
        description="作家亲自写作的章节编辑器：支持章节树、@角色 / #设定联想、AI 辅助扩写润色"
        actions={
          <div className="flex rounded-md border border-border/40 overflow-hidden">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setViewMode('grid')}
              aria-label="网格视图"
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setViewMode('list')}
              aria-label="列表视图"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        }
      />
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="搜索项目…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="还没有项目"
          description="手稿按项目组织，先在「项目管理」创建一个项目"
          action={<Button asChild size="sm"><Link href="/projects/new"><FileText className="w-4 h-4 mr-2" /> 新建项目</Link></Button>}
        />
      ) : viewMode === 'list' ? (
        <div className="space-y-2 stagger">
          {filtered.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-2 border border-border/40 rounded-lg bg-background/30">
              <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{p.title}</p>
                <p className="text-xs text-muted-foreground">
                  {countFor(p.id) > 0 ? `${countFor(p.id)} 个手稿章节` : '尚未开始写作'}
                </p>
              </div>
              <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                <Link href={`/manuscript/${p.id}`}>
                  打开写作 <ArrowRight className="w-4 h-4 ml-1.5" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4 stagger">
          {filtered.map((p) => (
            <Card key={p.id} className="glass-card hover:shadow-elegant-hover transition-shadow">
              <CardContent className="p-5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {countFor(p.id) > 0 ? `${countFor(p.id)} 个手稿章节` : '尚未开始写作'}
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link href={`/manuscript/${p.id}`}>
                    打开写作 <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
