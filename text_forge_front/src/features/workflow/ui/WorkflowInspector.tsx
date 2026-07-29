'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Checkbox } from '@/shared/ui/checkbox';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { cn } from '@/lib/utils';
import { AGENT_ROLES } from '@/shared/lib/agentRoles';
import { RagConfigPopover } from './RagConfigPopover';
import type { Workflow, WorkflowNode } from '@/features/workflow';
import { CONTEXT_FIELD_GROUPS, DEFAULT_CONTEXT_FIELDS, type ContextFieldKey } from '@/features/workflow';

const ALWAYS_ON_KEYS = new Set<ContextFieldKey>(DEFAULT_CONTEXT_FIELDS);

interface WorkflowInspectorProps {
  wf: Workflow;
  selectedNode: WorkflowNode | null;
  personalDocs: { id: string; name: string; uploaderName?: string }[];
  onPatchNode: (id: string, patch: Partial<WorkflowNode>) => void;
}

export function WorkflowInspector(props: WorkflowInspectorProps) {
  const { selectedNode, personalDocs, onPatchNode } = props;
  const [contextOpen, setContextOpen] = useState(false);
  const [personalOpen, setPersonalOpen] = useState(false);
  const [publicOpen, setPublicOpen] = useState(false);

  const toggleContextField = (key: ContextFieldKey) => {
    if (ALWAYS_ON_KEYS.has(key) || !selectedNode) return;
    const cur = selectedNode.contextFields || [];
    const next = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
    onPatchNode(selectedNode.id, { contextFields: next });
  };

  const isFieldOn = (key: ContextFieldKey) => {
    if (ALWAYS_ON_KEYS.has(key)) return true;
    return (selectedNode?.contextFields || []).includes(key);
  };

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
  const activeTools = selectedNode.toolIds || [];
  const hasWeb = activeTools.includes('web');
  const hasPersonalRag = activeTools.includes('rag:personal');
  const hasPublicRag = activeTools.includes('rag:public');

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

        <div className="space-y-2">
          <Label className="text-xs">配置</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs w-full justify-between"
              onClick={() => setContextOpen(true)}
            >
              <span>注入上下文</span>
              <span className="text-[10px] text-muted-foreground">
                {(selectedNode.contextFields?.length ?? 0) > 0 ? `已选${selectedNode.contextFields!.length}项` : '默认'}
              </span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs w-full justify-between"
              onClick={() => setPersonalOpen(true)}
            >
              <span>个人文档</span>
              <span className="text-[10px] text-muted-foreground">{hasPersonalRag ? '已启用' : '未启用'}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs w-full justify-between"
              onClick={() => setPublicOpen(true)}
            >
              <span>公共文档</span>
              <span className="text-[10px] text-muted-foreground">{hasPublicRag ? '已启用' : '未启用'}</span>
            </Button>
            <div
              className={cn('flex items-center gap-2 rounded-lg border px-3 py-1.5 cursor-pointer transition-colors', hasWeb ? 'bg-primary/10 border-primary' : 'border-border/60')}
              onClick={() => {
                const next = hasWeb ? (selectedNode.toolIds || []).filter((t) => t !== 'web') : [...new Set([...(selectedNode.toolIds || []), 'web'])];
                onPatchNode(selectedNode.id, { toolIds: next });
              }}
            >
              <Checkbox checked={hasWeb} readOnly />
              <span className="text-xs">联网查</span>
            </div>
          </div>
        </div>

        <Dialog open={contextOpen} onOpenChange={setContextOpen}>
          <DialogContent className="glass-panel">
            <DialogHeader>
              <DialogTitle>注入上下文</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {CONTEXT_FIELD_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground">{group.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.fields.map((f) => {
                      const on = isFieldOn(f.key);
                      if (on && f.alwaysOn) {
                        return (
                          <span key={f.key} className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                            {f.label}
                            <span className="text-[10px]">•</span>
                          </span>
                        );
                      }
                      return (
                        <label key={f.key} className={cn('flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] cursor-pointer', on ? 'bg-primary/10 border-primary' : 'border-border hover:bg-accent/40')}>
                          <Checkbox checked={on} onCheckedChange={() => toggleContextField(f.key)} />
                          <span>{f.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={personalOpen} onOpenChange={setPersonalOpen}>
          <DialogContent className="glass-panel">
            <DialogHeader>
              <DialogTitle>个人资料检索</DialogTitle>
            </DialogHeader>
            <RagConfigPopover
              filter={selectedNode.ragFilter}
              docOptions={personalDocs}
              inline
              onChange={(f) => onPatchNode(selectedNode.id, { ragFilter: f, toolIds: [...new Set([...(selectedNode.toolIds || []), 'rag:personal'])] })}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={publicOpen} onOpenChange={setPublicOpen}>
          <DialogContent className="glass-panel">
            <DialogHeader>
              <DialogTitle>公共库检索范围</DialogTitle>
            </DialogHeader>
            <RagConfigPopover
              filter={selectedNode.ragFilter}
              docOptions={[]}
              inline
              onChange={(f) => onPatchNode(selectedNode.id, { ragFilter: f, toolIds: [...new Set([...(selectedNode.toolIds || []), 'rag:public'])] })}
            />
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
