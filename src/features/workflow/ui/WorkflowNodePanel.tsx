// src/components/workflow/WorkflowNodePanel.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Plus, Bot } from 'lucide-react';
import { AGENT_ROLES } from '@/shared/lib/agentRoles';
import type { WorkflowNodeKind } from '@/features/workflow';

const KIND_META: Record<WorkflowNodeKind, { label: string }> = {
  input: { label: '输入' },
  agent: { label: 'Agent' },
  tool: { label: '工具' },
  output: { label: '输出' },
};

interface WorkflowNodePanelProps {
  pickingRole: boolean;
  onAddNode: (kind: WorkflowNodeKind) => void;
  onApplyDefaultTeam: () => void;
  onApplyRole: (roleId: string) => void;
}

export function WorkflowNodePanel(props: WorkflowNodePanelProps) {
  const { pickingRole, onAddNode, onApplyDefaultTeam, onApplyRole } = props;

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">步骤</p>
      <div className="space-y-2">
        {(Object.keys(KIND_META) as WorkflowNodeKind[]).map((k) => (
          <Button key={k} variant="outline" size="sm" className="w-full justify-start glass-surface" onClick={() => onAddNode(k)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {KIND_META[k].label}
          </Button>
        ))}
        <Button size="sm" className="w-full justify-start mt-2" variant="secondary" onClick={onApplyDefaultTeam}>
          <Bot className="w-3.5 h-3.5 mr-1.5" /> 一键用默认 Agent 团队
        </Button>

        {pickingRole && (
          <div className="mt-2 space-y-1.5 rounded-xl border border-border/60 p-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">选择 Agent 工种</p>
            {AGENT_ROLES.map((r) => (
              <button key={r.id} onClick={() => onApplyRole(r.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-accent/40"
                title={r.contextHint}>
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                <span className="flex-1 truncate">{r.name}</span>
                <span className="text-[10px] text-muted-foreground">{r.tier === 'cheap' ? '省' : '标'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
