'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/shared/lib/cn';
// 执行器译名与层级配色统一取自共享模块，避免各处译名分叉
import {
  LAYER_COLORS,
  LAYER_BADGE,
  LAYER_LABEL_STYLE,
  executorLabel,
  type ExecutorKind,
  type LayerKind,
} from '../executorMeta';

interface RoleNodeData {
  label: string;
  executor?: ExecutorKind;
  layer?: LayerKind;
}

export const RoleNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as RoleNodeData;
  const { label, executor = 'main', layer = 'execution' } = nodeData;

  return (
    <div
      className={cn(
        'relative min-w-[140px] max-w-[180px] rounded-xl border px-4 py-3 shadow-sm transition-all',
        LAYER_COLORS[layer] || LAYER_COLORS.execution,
        selected && 'ring-2 ring-foreground/30',
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-foreground/40 !border-2 !border-background !left-[-5px]"
      />
      <div className="text-[9px] font-medium mb-1 text-foreground/40">
        {LAYER_BADGE[layer]}
      </div>
      <div className="text-[13px] font-semibold text-foreground truncate leading-tight">
        {label}
      </div>
      <div className={cn('text-[9px] mt-0.5', LAYER_LABEL_STYLE[layer])}>
        {executorLabel(executor)}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-foreground/40 !border-2 !border-background !right-[-5px]"
      />
    </div>
  );
});

RoleNode.displayName = 'RoleNode';
