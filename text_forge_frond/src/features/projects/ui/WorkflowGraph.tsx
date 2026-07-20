'use client';

import { Button } from '@/components/ui/button';
import { ChevronUp, ChevronDown, ClipboardList, Globe, User, ListTree, PenLine, SearchCheck, Clapperboard } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Step } from '@/types';
import type { Workflow } from '@/lib/api/workflow';
import { BUILTIN_AGENT_LABELS } from '@/lib/workflow/agentRoles';

// 内置 7-Agent 流水线映射（与 BUILTIN_NOVEL_PIPELINE 节点对齐），作为缺省展示。
// label 复用 lib 层 BUILTIN_AGENT_LABELS，避免与 lib/chapter.ts 重复定义。
const AGENTS: { id: string; label: string; color: string; icon: LucideIcon }[] = [
  { id: 'planner',   label: BUILTIN_AGENT_LABELS.planner,   color: '#9333ea', icon: ClipboardList },
  { id: 'world',     label: BUILTIN_AGENT_LABELS.world,     color: '#2563eb', icon: Globe },
  { id: 'character', label: BUILTIN_AGENT_LABELS.character, color: '#ea580c', icon: User },
  { id: 'outline',   label: BUILTIN_AGENT_LABELS.outline,   color: '#0891b2', icon: ListTree },
  { id: 'writer',    label: BUILTIN_AGENT_LABELS.writer,    color: '#16a34a', icon: PenLine },
  { id: 'reviewer',  label: BUILTIN_AGENT_LABELS.reviewer,  color: '#ca8a04', icon: SearchCheck },
  { id: 'editor',    label: BUILTIN_AGENT_LABELS.editor,    color: '#dc2626', icon: Clapperboard },
];

interface Props {
  steps: Step[];
  currentAgent: string | null;
  isOpen: boolean;
  onToggle: () => void;
  /** 当前绑定的创作流水线；提供时按节点动态渲染，否则回退内置 7-Agent */
  workflow?: Workflow | null;
  workflowName?: string;
}

export function WorkflowGraph({ steps, currentAgent, isOpen, onToggle, workflow, workflowName }: Props) {
  // 取工作流的 agent 节点（保持拓扑顺序）；无则回退内置
  const agents = workflow
    ? workflow.nodes.filter((n) => n.kind === 'agent').map((n) => {
        const fallback = AGENTS.find((a) => a.id === n.id);
        const Icon = fallback?.icon ?? ClipboardList;
        return {
          id: n.id,
          label: n.label,
          color: fallback?.color ?? '#6b7280',
          icon: Icon,
        };
      })
    : AGENTS;

  return (
    <div className="border border-border/40 rounded-lg bg-card/50 backdrop-blur-sm overflow-hidden min-w-0">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/5 transition"
        onClick={onToggle}
      >
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">创作流水线</span>
          {workflowName && (
            <span className="text-xs text-muted-foreground bg-primary/10 px-2 py-0.5 rounded-full truncate max-w-[160px]">
              {workflowName}
            </span>
          )}
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {steps.filter(s => s.status === 'completed').length} / {steps.length} 步
          </span>
        </div>
        <Button variant="ghost" size="sm">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden px-4 pb-4"
          >
            <div className="flex items-center gap-3 py-2 overflow-x-auto">
              {agents.map((agent) => {
                const step = steps.find(s => s.agent === agent.id || s.nodeId === agent.id);
                const status = step?.status || 'pending';
                const isActive = currentAgent === agent.id;
                const Icon = agent.icon;
                return (
                  <div key={agent.id} className="flex flex-col items-center gap-1 min-w-[60px]">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center transition-all',
                        status === 'completed' && 'ring-2 ring-green-500 ring-offset-2 text-green-600',
                        status === 'streaming' && 'animate-pulse ring-2 ring-blue-500 ring-offset-2 text-blue-600',
                        status === 'waiting'   && 'ring-2 ring-yellow-500 ring-offset-2 animate-bounce text-yellow-600',
                        status === 'pending'   && 'opacity-40',
                      )}
                      style={{
                        background: isActive ? agent.color : 'transparent',
                        border: `2px solid ${agent.color}`,
                        color: isActive ? '#fff' : agent.color,
                      }}
                    >
                      <Icon className="w-5 h-5" strokeWidth={1.8} />
                    </div>
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">
                      {agent.label}
                    </span>
                  </div>
                );
              })}
            </div>
            {!workflow && (
              <p className="text-[11px] text-muted-foreground mt-1">未绑定自定义流水线，使用内置 7-Agent 默认流程。</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { AGENTS };
