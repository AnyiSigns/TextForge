// src/components/workflow/WorkflowNodePanel.tsx
'use client';

import { AGENT_ROLES } from '@/shared/lib/agentRoles';

interface WorkflowNodePanelProps {
  onApplyRole: (roleId: string) => void;
}

export function WorkflowNodePanel({ onApplyRole }: WorkflowNodePanelProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">添加角色</p>
      <div className="space-y-1.5">
        {AGENT_ROLES.map((r) => (
          <button key={r.id} onClick={() => onApplyRole(r.id)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-accent/40"
            title={r.contextHint}>
            <span className="h-3 w-3 rounded-full shrink-0" style={{ background: r.color }} />
            <span className="flex-1 truncate">{r.name}</span>
            <span className="text-xs text-muted-foreground">{r.tier === 'cheap' ? '省' : '标'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
