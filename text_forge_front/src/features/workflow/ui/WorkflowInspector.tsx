'use client';

import { Card, CardContent } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { AGENT_ROLES } from '@/shared/lib/agentRoles';
import type { Workflow, WorkflowNode } from '@/features/workflow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

interface WorkflowInspectorProps {
  wf: Workflow;
  selectedNode: WorkflowNode | null;
  onPatchNode: (id: string, patch: Partial<WorkflowNode>) => void;
}

export function WorkflowInspector(props: WorkflowInspectorProps) {
  const { selectedNode, onPatchNode } = props;

  if (!selectedNode) {
    return (
      <Card className="glass-card">
        <CardContent className="space-y-4 py-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">属性</p>
          <p className="text-sm text-muted-foreground">选择一个步骤编辑</p>
        </CardContent>
      </Card>
    );
  }

  const roleColor = AGENT_ROLES.find((r) => r.name === selectedNode.label)?.color ?? '#6b7280';

  return (
    <Card className="glass-card">
      <CardContent className="space-y-4 py-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: roleColor }} />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">属性</p>
        </div>

        <div className="space-y-1">
          <Label>名称</Label>
          <Input value={selectedNode.label} onChange={(e) => onPatchNode(selectedNode.id, { label: e.target.value })} />
        </div>

        <div className="space-y-1">
          <Label>系统提示词</Label>
          <textarea
            value={selectedNode.systemPrompt || ''}
            onChange={(e) => onPatchNode(selectedNode.id, { systemPrompt: e.target.value })}
            rows={5}
            className="w-full rounded-xl border border-border bg-background/50 p-3 text-sm resize-none"
            placeholder="例如：根据项目设定生成本章标题与大纲要点"
          />
        </div>

        <div className="space-y-1">
          <Label>执行器</Label>
          <Select
            value={selectedNode.executor || 'auto'}
            onValueChange={(v) => onPatchNode(selectedNode.id, { executor: v === 'auto' ? undefined : (v as 'main' | 'audit' | 'tool') })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="自动" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">自动（默认）</SelectItem>
              <SelectItem value="main">主生成</SelectItem>
              <SelectItem value="audit">审核</SelectItem>
              <SelectItem value="tool">检索</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">上游依赖</Label>
          <p className="text-[10px] text-muted-foreground">勾选会为本节点提供输入的步骤，支持多选</p>
          <div className="space-y-1">
            {props.wf.nodes.filter((n) => n.id !== selectedNode.id).map((n) => {
              const checked = (selectedNode.upstreams || []).includes(n.id);
              return (
                <label key={n.id} className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs cursor-pointer hover:bg-accent/40">
                  <input type="checkbox" checked={checked} onChange={(e) => {
                    const next = e.target.checked
                      ? [...(selectedNode.upstreams || []).filter((id) => id !== n.id), n.id]
                      : (selectedNode.upstreams || []).filter((id) => id !== n.id);
                    onPatchNode(selectedNode.id, { upstreams: next });
                  }} />
                  <span>{n.label || n.id}</span>
                </label>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
