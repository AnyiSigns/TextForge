// src/components/workflow/WorkflowInspector.tsx
'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KIND_META } from './workflowMeta';
import { RAG_SCOPE_LABEL } from '@/shared/lib/agentRoles';
import { RagConfigPopover } from './RagConfigPopover';
import type { Workflow, WorkflowNode } from '@/features/workflow';

interface WorkflowInspectorProps {
  wf: Workflow;
  selectedNode: WorkflowNode | null;
  personalDocs: { id: string; name: string; uploaderName?: string }[];
  nodeHasPersonalRag: boolean;
  onPatchNode: (id: string, patch: Partial<WorkflowNode>) => void;
  onToggleDep: (id: string, dep: string) => void;
}

const RAG_TOOLS = ['rag:personal', 'rag:public', 'rag:both', 'web'] as const;

export function WorkflowInspector(props: WorkflowInspectorProps) {
  const { wf, selectedNode, personalDocs, nodeHasPersonalRag, onPatchNode, onToggleDep } = props;

  return (
    <Card className="glass-card">
      <CardContent className="space-y-4 py-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">属性</p>
        {!selectedNode ? (
          <p className="text-sm text-muted-foreground">选择一个步骤编辑</p>
        ) : (
          <>
            <div className="space-y-1">
              <Label>名称</Label>
              <Input value={selectedNode.label} onChange={(e) => onPatchNode(selectedNode.id, { label: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>类型</Label>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Cpu className="w-4 h-4" /> {KIND_META[selectedNode.kind].label}
              </div>
            </div>
            {selectedNode.kind === 'agent' && (
              <>
                <div className="space-y-1">
                  <Label>系统提示词 / 角色设定</Label>
                  <textarea
                    value={selectedNode.systemPrompt || ''}
                    onChange={(e) => onPatchNode(selectedNode.id, { systemPrompt: e.target.value })}
                    rows={5}
                    className="w-full rounded-xl border border-border bg-background/50 p-3 text-sm resize-none"
                    placeholder="例如：根据项目设定生成本章标题与大纲要点"
                  />
                </div>
                <div className="space-y-1">
                  <Label>挂载工具（按需，省 token 不要全开）</Label>
                  <div className="flex flex-wrap gap-2">
                    {RAG_TOOLS.map((t) => {
                      const on = (selectedNode.toolIds || []).includes(t);
                      return (
                        <button key={t} type="button" onClick={() => {
                          const cur = selectedNode.toolIds || [];
                          onPatchNode(selectedNode.id, { toolIds: on ? cur.filter((x) => x !== t) : [...cur, t] });
                        }}
                          className={cn('px-2 py-1 rounded-full text-xs border', on ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>
                          {RAG_SCOPE_LABEL[t] ?? t}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">个人库=在本机检索，资料与检索都在你本地；公共库=由服务端检索。</p>
                </div>

                {nodeHasPersonalRag && (
                  <div className="space-y-1 pt-1">
                    <Label>个人库检索设置</Label>
                    <RagConfigPopover
                      filter={selectedNode.ragFilter}
                      docOptions={personalDocs}
                      onChange={(f) => onPatchNode(selectedNode.id, { ragFilter: f })}
                    />
                  </div>
                )}
              </>
            )}
            {selectedNode.kind !== 'input' && (
              <div className="space-y-2">
                <Label>上游步骤</Label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {wf.nodes.filter((n) => n.id !== selectedNode.id).map((n) => (
                    <label key={n.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={(selectedNode.dependsOn || []).includes(n.id)}
                        onChange={() => onToggleDep(selectedNode.id, n.id)}
                      />
                      <span className="truncate">{n.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
