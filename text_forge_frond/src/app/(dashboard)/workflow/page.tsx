// src/app/(dashboard)/workflow/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Workflow as WorkflowIcon, Trash2, Pencil, Users } from 'lucide-react';
import { listWorkflows, deleteWorkflow, countWorkflowUsages, type Workflow } from '@/features/workflow';
import { PageHeader } from '@/shared/components';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/shared/components';
import { toast } from 'sonner';

export default function WorkflowPage() {
  const router = useRouter();
  const [list, setList] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listWorkflows().then((wfs) => { setList(wfs); setLoading(false); }).catch(() => setLoading(false));
  }, []);

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
        <Button onClick={() => router.push('/workflow/new')}>
          <Plus className="w-4 h-4 mr-2" /> 新建工作流
        </Button>
      </div>

      {list.length === 0 ? (
        <Card className="glass-card"><CardContent><EmptyState icon={WorkflowIcon} title="还没有创作流程" description="创建你的第一个步骤组合" /></CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4 stagger">
          {list.map((wf) => (
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
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Users className="w-3 h-3" /> 已应用到 {countWorkflowUsages(wf.id)} 个项目
                </p>
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
    </div>
  );
}
