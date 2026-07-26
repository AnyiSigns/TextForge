// src/components/workflow/WorkflowCanvas.tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, Trash2, ArrowDown, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Workflow } from '@/features/workflow';
import { KIND_META } from './workflowMeta';
import { AGENT_ROLES } from '@/shared/lib/agentRoles';

interface WorkflowCanvasProps {
  wf: Workflow;
  selected: string | null;
  onName: (v: string) => void;
  onSelect: (id: string) => void;
  onRemoveNode: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onSave: () => void;
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  const {
    wf, selected, onName, onSelect, onRemoveNode, onReorder, onSave,
  } = props;
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center justify-between">
          <Input value={wf.name} onChange={(e) => onName(e.target.value)} className="font-medium max-w-xs" />
          <div className="flex gap-2 flex-wrap items-center">
            <Button size="sm" variant="outline" onClick={onSave}><Save className="w-4 h-4 mr-1.5" /> 保存</Button>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground mt-2">
          这是「全局模板」：保存后可在任意项目的「工作台 → 创作流水线」中选用，做到多模板应用。
        </p>

        <AnimatePresence initial={false}>
          {wf.nodes.map((node, i) => {
            const m = KIND_META[node.kind] ?? KIND_META.agent;
            const Icon = m.icon;
            const roleColor = node.kind === 'agent'
              ? (AGENT_ROLES.find((r) => r.name === node.label)?.color ?? m.color)
              : m.color;
            return (
              <motion.div
                key={node.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                draggable
                onDragStart={() => { setDragId(node.id); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId) onReorder(dragId, node.id); setDragId(null); }}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors relative',
                  selected === node.id ? 'border-primary/40 bg-primary/5' : 'border-border/50 hover:bg-accent/30'
                )}
                onClick={() => onSelect(node.id)}
              >
                <span className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground shrink-0" title="拖拽排序"
                  onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                  <GripVertical className="w-4 h-4" />
                </span>
                <span className="grid place-items-center w-9 h-9 rounded-lg shrink-0" style={{ background: `${roleColor}1a`, color: roleColor }}>
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{node.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.label}
                    {node.toolIds?.length ? ` · ${node.toolIds.join('/')}` : ''}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); onRemoveNode(node.id); }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
                {i < wf.nodes.length - 1 && <ArrowDown className="w-4 h-4 text-muted-foreground/40 absolute" />}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {wf.nodes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">从左侧添加步骤开始编排</p>
        )}
      </CardContent>
    </Card>
  );
}
