// src/components/workflow/WorkflowCanvas.tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, Play, SendToBack, Trash2, ArrowDown, Loader2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { Workflow } from '@/lib/api/workflow';
import { KIND_META } from './workflowMeta';
import { AGENT_ROLES } from '@/lib/workflow/agentRoles';

interface WorkflowCanvasProps {
  wf: Workflow;
  selected: string | null;
  running: boolean;
  writingProject: boolean;
  results: Record<string, string>;
  projects: { id: string; title: string }[];
  targetProject: string;
  onName: (v: string) => void;
  onSelect: (id: string) => void;
  onRemoveNode: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
  onSave: () => void;
  onRun: () => void;
  onTargetProject: (v: string) => void;
  onRunToProject: () => void;
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  const {
    wf, selected, running, writingProject, results, projects, targetProject,
    onName, onSelect, onRemoveNode, onReorder, onSave, onRun, onTargetProject, onRunToProject,
  } = props;
  const [dragId, setDragId] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);

  return (
    <Card className="glass-card">
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center justify-between">
          <Input value={wf.name} onChange={(e) => onName(e.target.value)} className="font-medium max-w-xs" />
          <div className="flex gap-2 flex-wrap items-center">
            <Button size="sm" variant="outline" onClick={onSave}><Save className="w-4 h-4 mr-1.5" /> 保存</Button>
            <Button size="sm" onClick={onRun} disabled={running}><Play className="w-4 h-4 mr-1.5" /> {running ? '运行中' : '运行'}</Button>
            <div className="flex items-center gap-1.5 ml-1">
              <SelectProject value={targetProject} onChange={onTargetProject} projects={projects} />
              <Button size="sm" variant="secondary" onClick={onRunToProject} disabled={writingProject || !targetProject}>
                {writingProject ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <SendToBack className="w-4 h-4 mr-1.5" />}
                写入项目
              </Button>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground mt-2">
          这是「全局模板」：保存后可在任意项目的「工作台 → 创作流水线」中选用，做到多模板应用。
        </p>

        <AnimatePresence initial={false}>
          {wf.nodes.map((node, i) => {
            const m = KIND_META[node.kind];
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
                    {results[node.id] ? ' · 已运行' : ''}
                  </p>
                </div>
                {results[node.id] && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setExpandedResult(expandedResult === node.id ? null : node.id); }}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-600 hover:bg-green-500/25"
                    title="查看输出"
                  >已运行</button>
                )}
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); onRemoveNode(node.id); }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
                {i < wf.nodes.length - 1 && <ArrowDown className="w-4 h-4 text-muted-foreground/40 absolute" />}
                {expandedResult === node.id && results[node.id] && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="absolute left-3 right-3 top-full mt-1 z-10 rounded-lg border border-border/60 bg-popover/95 backdrop-blur shadow-elegant p-3 text-xs whitespace-pre-wrap break-words max-h-48 overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="font-medium text-muted-foreground mb-1">{node.label} · 运行输出</p>
                    {results[node.id]}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {wf.nodes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">从左侧添加步骤开始编排</p>
        )}

        {Object.keys(results).length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">运行结果（{Object.keys(results).length} 步）</p>
            <div className="rounded-xl border border-border/50 overflow-hidden divide-y divide-border/40">
              {wf.nodes.map((node) => results[node.id] && (
                <div key={node.id} className="text-sm">
                  <button
                    type="button"
                    onClick={() => setExpandedResult(expandedResult === node.id ? null : node.id)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent/30"
                  >
                    <span className="font-medium truncate">{node.label}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{expandedResult === node.id ? '收起' : '展开'}</span>
                  </button>
                  {expandedResult === node.id && (
                    <pre className="px-3 pb-3 text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-56 overflow-y-auto">{results[node.id]}</pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SelectProject({
  value,
  onChange,
  projects,
}: {
  value: string;
  onChange: (v: string) => void;
  projects: { id: string; title: string }[];
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? '')}>
      <SelectTrigger className="w-[160px] h-7 text-xs"><SelectValue placeholder="选目标项目">{(v: string) => projects.find((p) => p.id === v)?.title ?? v}</SelectValue></SelectTrigger>
      <SelectContent>
        {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
