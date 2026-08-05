'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/shared/lib/cn';

interface RoleNodeData {
  label: string;
  executor?: 'main' | 'audit' | 'auto';
  layer?: 'decision' | 'execution' | 'audit';
}

const LAYER_COLORS: Record<string, string> = {
  decision: 'bg-[#1c1b1a]/[0.06] border-[#1c1b1a]/[0.12]',
  execution: 'bg-[#1c1b1a]/[0.10] border-[#1c1b1a]/[0.18]',
  audit: 'bg-[#1c1b1a]/[0.15] border-[#1c1b1a]/[0.25]',
};

const LAYER_BADGE: Record<string, string> = {
  decision: '🧠 决策层',
  execution: '✍️ 执行层',
  audit: '🔍 审计层',
};

const LAYER_LABEL_STYLE: Record<string, string> = {
  decision: 'text-[#1c1b1a]/40',
  execution: 'text-[#1c1b1a]/50',
  audit: 'text-[#1c1b1a]/60',
};

export const RoleNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as RoleNodeData;
  const { label, executor = 'main', layer = 'execution' } = nodeData;

  return (
    <div
      className={cn(
        'relative min-w-[140px] max-w-[180px] rounded-xl border px-4 py-3 shadow-sm transition-all',
        LAYER_COLORS[layer] || LAYER_COLORS.execution,
        selected && 'ring-2 ring-[#1c1b1a]/30',
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-[#1c1b1a]/40 !border-2 !border-[#f4f3f0] !left-[-5px]"
      />
      <div className="text-[9px] font-medium mb-1" style={{ color: '#1c1b1a', opacity: 0.4 }}>
        {LAYER_BADGE[layer]}
      </div>
      <div className="text-[13px] font-semibold text-[#1c1b1a] truncate leading-tight">
        {label}
      </div>
      <div className={cn('text-[9px] mt-0.5', LAYER_LABEL_STYLE[layer])}>
        {executor === 'audit' ? '审计模型' : '主模型'}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-[#1c1b1a]/40 !border-2 !border-[#f4f3f0] !right-[-5px]"
      />
    </div>
  );
});

RoleNode.displayName = 'RoleNode';
