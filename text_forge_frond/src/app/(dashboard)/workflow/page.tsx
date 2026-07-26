// src/app/(dashboard)/workflow/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Workflow as WorkflowIcon, Trash2, Pencil, LayoutGrid, List, Search } from 'lucide-react';
import { listWorkflows, deleteWorkflow, type Workflow } from '@/features/workflow';
import { PageHeader } from '@/shared/components';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/shared/components';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type ViewMode = 'grid' | 'list';

export default function WorkflowPage() {
  const router = useRouter();
  const [list, setList] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    listWorkflows().then((wfs) => { setList(wfs); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filtered = list.filter((wf) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      wf.name.toLowerCase().includes(term) ||
      (wf.description ?? '').toLowerCase().includes(term)
    );
  });

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该工作流？')) return;
    try {
      await deleteWorkflow(id);
      setList((l) => l.filter((w) => w.id !== id));
      toast.success('已删除');
    } catch (e) {
      toast.error('删除失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  if (loading) return <PageHeader icon={WorkflowIcon} title="创作流程" description="把写作拆成多个步骤，自由组合成你的创作流程" />;

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between">
        <PageHeader icon={WorkflowIcon} title="创作流程" description="把写作拆成多个步骤，自由组合成你的创作流程（云端服务未连接时使用本地演示数据）" />
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border/40 overflow-hidden">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setViewMode('list')}
            >
              <List className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
          </div>
          <Button onClick={() => router.push('/workflow/new')}>
            <Plus className="w-4 h-4 mr-2" /> 新建工作流
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索流程名称..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {list.length === 0 ? (
        <Card className="glass-card mt-4"><CardContent><EmptyState icon={WorkflowIcon} title="还没有创作流程" description="创建你的第一个步骤组合" /></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card className="glass-card mt-4"><CardContent><EmptyState icon={WorkflowIcon} title="没有匹配的流程" description="试试别的关键词" /></CardContent></Card>
      ) : (
        <>
          {viewMode === 'list' ? (
            <div className="space-y-2 stagger mt-4">
              {filtered.map((wf) => (
                <div key={wf.id} className="flex items-center gap-2 p-2 border border-border/40 rounded-lg bg-background/30 hover:bg-accent/20 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate flex items-center gap-1.5">
                      {wf.name}
                      {wf.builtin && <Badge variant="secondary" className="text-[10px]">内置</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{wf.description || `共 ${(wf.nodes ?? []).length} 个步骤`}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">{(wf.nodes ?? []).length} 步骤</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => router.push(`/workflow/${wf.id}`)}>
                      <Pencil className="w-4 h-4 mr-1.5" /> 编辑
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(wf.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4 stagger mt-4">
              {filtered.map((wf) => (
                <Card key={wf.id} className="glass-card hover:shadow-elegant-hover transition-shadow">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate flex items-center gap-1.5">
                          {wf.name}
                          {wf.builtin && <Badge variant="secondary" className="text-[10px]">内置</Badge>}
                        </p>
                         <p className="text-xs text-muted-foreground truncate">{wf.description || `共 ${(wf.nodes ?? []).length} 个步骤`}</p>
                      </div>
                       <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">{(wf.nodes ?? []).length} 步骤</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => router.push(`/workflow/${wf.id}`)}>
                        <Pencil className="w-4 h-4 mr-1.5" /> 编辑
                      </Button>
                      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(wf.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
