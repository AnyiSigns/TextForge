// src/app/(dashboard)/workflow/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Workflow as WorkflowIcon } from 'lucide-react';
import { listWorkflows, deleteWorkflow, type Workflow } from '@/features/workflow';
import { PageHeader } from '@/shared/components';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { WorkflowList } from '@/features/workflow';

type ViewMode = 'list' | 'grid';

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
        <PageHeader icon={WorkflowIcon} title="创作流程" description="把写作拆成多个步骤，自由组合成你的创作流程" />
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border/40 overflow-hidden">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setViewMode('list')}
            >
              <span className="text-xs">列表</span>
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setViewMode('grid')}
            >
              <span className="text-xs">卡片</span>
            </Button>
          </div>
          <Button onClick={() => router.push('/workflow/new')}>
            <Plus className="w-4 h-4 mr-2" /> 新建工作流
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <div className="relative max-w-sm flex-1">
          <Input
            placeholder="搜索流程名称..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-3"
          />
        </div>
      </div>

      <WorkflowList
        workflows={filtered}
        viewMode={viewMode}
        onDelete={handleDelete}
      />
    </div>
  );
}
