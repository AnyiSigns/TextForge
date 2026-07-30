// src/features/user-agent/ui/ThinkingPanel.tsx
// Agent 思考阶段面板：显示工具调用链路、计划、进度

'use client';

import { useState } from 'react';
import {
  Bot,
  Zap,
  Loader2,
  XCircle,
  Terminal,
  MessageSquare,
  BookOpen,
  Users,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { 
   Badge 
 } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AgentPhase, ToolCallLog, Plan } from '@/features/user-agent/types/agent';
import type { CrossChapterContext } from '@/types';
import { PlanCard } from './PlanCard';
import { ToolCallCard } from './ToolCallCard';

interface ThinkingPanelProps {
  phase: string | null;
  currentToolCalls?: ToolCallLog[];
  currentPlan?: Plan;
  crossChapterContext?: CrossChapterContext;
  progress?: {
    currentStep: number;
    totalSteps: number;
    completedChars: number;
    totalChars: number;
    estimatedRemainingSeconds: number;
  };
  onCancel: () => void;
  onPlanApprove?: (planId: string) => void;
  onPlanModify?: (planId: string, updatedPlan: Partial<Plan>) => void;
  onPlanReject?: (planId: string, reason: string) => void;
}

export function ThinkingPanel({
  phase,
  currentToolCalls = [],
  currentPlan,
  crossChapterContext,
  progress,
  onCancel,
  onPlanApprove,
  onPlanModify,
  onPlanReject
}: ThinkingPanelProps) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  
  if (phase === 'idle') return null;
  
  const getPhaseLabel = (p: string | null) => {
    switch (p) {
      case 'thinking': return '思考中...';
      case 'plan': return '制定计划';
      case 'act': return '执行中';
      case 'reflect': return '自我反思';
      case 'done': return '完成';
      default: return p ?? '';
    }
  };
  
  const getPhaseIcon = (p: string | null) => {
    switch (p) {
      case 'thinking': return <Bot className="h-3 w-3" />;
      case 'plan': return <MessageSquare className="h-3 w-3" />;
      case 'act': return <Zap className="h-3 w-3" />;
      case 'reflect': return <Terminal className="h-3 w-3" />;
      default: return <Loader2 className="h-3 w-3 animate-spin" />;
    }
  };
  
  return (
    <Card className="w-full border-blue-500/30 bg-blue-500/5 dark:border-blue-900/30 dark:bg-blue-900/10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn(
              'h-2 w-2 rounded-full',
              phase === 'thinking' && 'bg-blue-500 animate-pulse',
              phase === 'plan' && 'bg-green-500',
              phase === 'act' && 'bg-yellow-500',
              phase === 'reflect' && 'bg-purple-500',
              phase === 'done' && 'bg-green-500'
            )} />
            <div>
              <CardTitle className="text-sm font-medium">
                {getPhaseLabel(phase)}
                {phase !== 'idle' && <Loader2 className="h-3 w-3 ml-1 animate-spin" />}
              </CardTitle>
              <p className="text-[10px] text-muted-foreground">
                {phase === 'thinking' && '正在分析任务，拆解步骤...'}
                {phase === 'plan' && '正在生成执行计划...'}
                {phase === 'act' && '正在执行计划步骤...'}
                {phase === 'reflect' && '正在自我校验结果...'}
              </p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 text-xs"
            onClick={onCancel}
            aria-label="取消当前任务"
          >
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3 pt-0">
        {crossChapterContext && (
          <div className="space-y-2 rounded-xl border border-border/40 bg-background/50 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <BookOpen className="h-3.5 w-3.5" />
              跨章上下文预览
            </div>
            {crossChapterContext.previousChapterSummary && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">上一章摘要</p>
                <p className="text-xs leading-relaxed">{crossChapterContext.previousChapterSummary}</p>
              </div>
            )}
            {crossChapterContext.characterStateChanges.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">角色状态变化</p>
                <div className="space-y-0.5">
                  {crossChapterContext.characterStateChanges.map((change, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-medium">{change.characterName}</span>
                      <span className="text-muted-foreground">{change.field}</span>
                      <span className="text-muted-foreground/60">{change.from} → {change.to}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {crossChapterContext.foreshadowingProgress.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">伏笔进度</p>
                <div className="space-y-0.5">
                  {crossChapterContext.foreshadowingProgress.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-2 text-xs">
                      <Sparkles className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{entry.description}</span>
                      <Badge variant="outline" className="ml-auto text-[9px]">
                        {entry.status === 'setup' ? '已设' : entry.status === 'developing' ? '发展中' : '已收'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {progress && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>步骤 {progress.currentStep} / {progress.totalSteps}</span>
              <span>{Math.round((progress.currentStep / progress.totalSteps) * 100)}%</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${(progress.currentStep / progress.totalSteps) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-muted-foreground">
              <span>已生成 {progress.completedChars.toLocaleString()} 字</span>
              <span>预计剩余 {progress.estimatedRemainingSeconds}s</span>
            </div>
          </div>
        )}
        
        {currentPlan && (
          <PlanCard
            plan={currentPlan}
            onApprove={onPlanApprove}
            onModify={onPlanModify}
            onReject={onPlanReject}
          />
        )}
        
        {currentToolCalls.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Terminal className="h-3 w-3" />
              <span>工具调用链路</span>
              <Badge variant="secondary" className="ml-auto">{currentToolCalls.length}</Badge>
            </div>
            
            {currentToolCalls.map((toolCall) => (
              <ToolCallCard
                key={toolCall.id}
                toolCall={toolCall}
                isExpanded={expandedTools.has(toolCall.id)}
                onToggle={() => setExpandedTools(prev => {
                  const next = new Set(prev);
                  if (next.has(toolCall.id)) next.delete(toolCall.id);
                  else next.add(toolCall.id);
                  return next;
                })}
              />
            ))}
          </div>
        )}
        
        {currentToolCalls.length === 0 && !currentPlan && phase === 'thinking' && (
          <div className="flex flex-col items-center py-4 text-center text-muted-foreground/60">
            <Loader2 className="h-6 w-6 animate-spin mb-2" />
            <p className="text-sm">正在分析任务...</p>
            <p className="text-[10px]">正在拆解步骤，生成计划...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}