// src/features/workflow/ui/WorkflowList.tsx
'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Play, Plus, Trash2 } from 'lucide-react';
import type { Workflow, WorkflowTemplate } from '@/features/workflow';
import { getWorkflow, saveWorkflow } from '@/features/workflow';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { Badge } from '@/shared/ui/badge';
import { toast } from 'sonner';

interface WorkflowListProps {
  workflows: Workflow[];
  viewMode: 'list' | 'grid';
  onFiltered?: (filtered: Workflow[]) => void;
  onDelete: (id: string) => void;
}

export function WorkflowList({ workflows, viewMode, onDelete }: WorkflowListProps) {
  const router = useRouter();
  const templates = useMemo(() => (workflows ?? []).filter((w) => w.builtin) as WorkflowTemplate[], [workflows]);
  const customs = useMemo(() => (workflows ?? []).filter((w) => !w.builtin), [workflows]);

  const handleUseTemplate = async (template: WorkflowTemplate) => {
    try {
      const fresh = await getWorkflow(template.id);
      if (!fresh) { toast.error('无法读取模板'); return; }
      const newId = `wf-${Date.now()}`;
      const now = new Date().toISOString();
      const seqRef = { current: 100 };
      const nid = () => `n${Date.now()}-${seqRef.current++}`;
      const idMap = new Map<string, string>();
      const nodes = fresh.nodes.map((n) => { const newId2 = nid(); idMap.set(n.id, newId2); return { ...n, id: newId2 }; });
      const edges = fresh.edges.map((e) => ({ ...e, from: idMap.get(e.from) ?? e.from, to: idMap.get(e.to) ?? e.to }));
      const created: Workflow = { ...fresh, id: newId, name: `${fresh.name}（副本）`, description: fresh.description ?? '', nodes, edges, createdAt: now, updatedAt: now };
      await saveWorkflow(created);
      toast.success('已创建工作流');
      router.replace(`/workflow/${created.id}`);
    } catch (e) {
      toast.error('创建失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">内置模板</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => (
            <Card key={t.id} className="glass-card hover:shadow-elegant-hover transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-primary" />
                  <p className="font-medium text-sm truncate">{t.name}</p>
                  <Badge variant="secondary" className="ml-auto text-[10px]">模板</Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{t.description || '一站式模板，点击即可使用'}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{(t.nodes ?? []).length} 步骤</span>
                  <Button size="sm" className="h-7 text-xs" onClick={() => handleUseTemplate(t)}>
                    <Play className="w-3 h-3 mr-1" /> 使用此模板
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {templates.length === 0 && (
            <Card className="glass-card"><CardContent><p className="text-xs text-muted-foreground py-2">暂无内置模板</p></CardContent></Card>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">我的工作流</h2>
        {customs.length === 0 ? (
          <Card className="glass-card"><CardContent><p className="text-xs text-muted-foreground py-2">还没有自定义工作流</p></CardContent></Card>
        ) : viewMode === 'list' ? (
          <div className="space-y-2 stagger">
            {customs.map((wf) => (
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
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => router.push(`/workflow/${wf.id}`)}><Play className="w-3 h-3 mr-1" />运行</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => router.push(`/workflow/${wf.id}`)}>编辑</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => { if (confirm('确定删除该工作流？')) onDelete(wf.id); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4 stagger">
            {customs.map((wf) => (
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
                      <Play className="w-4 h-4 mr-1.5" /> 运行
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => router.push(`/workflow/${wf.id}`)}>
                      编辑
                    </Button>
                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => { if (confirm('确定删除该工作流？')) onDelete(wf.id); }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
