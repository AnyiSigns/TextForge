// src/app/(dashboard)/workflow/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Workflow as WorkflowIcon, Trash2, Pencil, Users, Play } from 'lucide-react';
import { listWorkflowsWithBuiltin, deleteWorkflow, countWorkflowUsages, runWorkflow, type Workflow, type WorkflowRunStep } from '@/features/workflow';
import { PageHeader } from '@/shared/components';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/shared/components';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function WorkflowPage() {
  const router = useRouter();
  const [list, setList] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [runTarget, setRunTarget] = useState<Workflow | null>(null);
  const [runInput, setRunInput] = useState('');
  const [runSteps, setRunSteps] = useState<WorkflowRunStep[]>([]);
  const [runState, setRunState] = useState<'idle' | 'running' | 'done'>('idle');

  useEffect(() => {
    listWorkflowsWithBuiltin().then((wfs) => { setList(wfs); setLoading(false); }).catch(() => setLoading(false));
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

  const startRun = async (wf: Workflow) => {
    setRunTarget(wf);
    setRunInput('');
    setRunSteps([]);
    setRunState('idle');
  };

  const doRun = async () => {
    if (!runTarget) return;
    setRunState('running');
    setRunSteps([]);
    try {
      const steps = await runWorkflow(runTarget.id, runInput, {
        simulateDelay: true,
        onStep: (_nid, _label, out, sys) => setRunSteps((prev) => [...prev, { nodeId: _nid, label: _label, output: out, status: 'done', systemPrompt: sys }]),
      });
      setRunSteps(steps);
      setRunState('done');
    } catch (e) {
      toast.error('试跑失败', { description: e instanceof Error ? e.message : '未知错误' });
      setRunState('idle');
    }
  };

  if (loading) return <PageHeader icon={WorkflowIcon} title="创作流程" description="把写书拆成可复用的步骤组合" />;

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between">
        <PageHeader icon={WorkflowIcon} title="创作流程" description="把写书拆成可复用的步骤组合（后端未就绪时为本地 mock）" />
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
                    <p className="text-xs text-muted-foreground truncate">{wf.description || `共 ${wf.nodes.length} 个步骤`}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">{wf.nodes.length} 步骤</span>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Users className="w-3 h-3" /> 已应用到 {countWorkflowUsages(wf.id)} 个项目
                </p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => router.push(`/workflow/${wf.id}`)}>
                    <Pencil className="w-4 h-4 mr-1.5" /> 编辑
                  </Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => startRun(wf)}>
                    <Play className="w-4 h-4" />
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

      <Dialog open={!!runTarget} onOpenChange={(o) => { if (!o) setRunTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>试跑：{runTarget?.name}</DialogTitle>
            <DialogDescription>
              按工作流节点顺序本地模拟执行（不写入项目），用于调试步骤串联与 RAG/工具注入效果。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={runInput}
              onChange={(e) => setRunInput(e.target.value)}
              placeholder="输入起始文本（可选，留空则用项目上下文）"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={doRun} disabled={runState === 'running'}>
                <Play className="w-4 h-4 mr-1.5" /> {runState === 'running' ? '运行中…' : '开始试跑'}
              </Button>
              {runState === 'done' && (
                <Button size="sm" variant="outline" onClick={() => setRunState('idle')}>重置</Button>
              )}
            </div>
            {runSteps.length > 0 && (
              <div className="space-y-2 max-h-72 overflow-y-auto rounded-lg border border-border/40 p-2">
                {runSteps.map((s, i) => (
                  <div key={i} className="text-sm">
                    <p className="font-medium text-primary">{i + 1}. {s.label}</p>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap mt-0.5">{s.output}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
