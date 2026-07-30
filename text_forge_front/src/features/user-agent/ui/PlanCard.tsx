// src/features/user-agent/ui/PlanCard.tsx
// Agent 计划卡片：结构化步骤展示，可编辑/审批/追加

'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Plan, PlanStep } from '@/features/user-agent/types/agent';

interface PlanCardProps {
  plan: Plan;
  onApprove?: (planId: string) => void;
  onModify?: (planId: string, updatedPlan: Partial<Plan>) => void;
  onReject?: (planId: string, reason: string) => void;
}

export function PlanCard({
  plan,
  onApprove,
  onModify,
  onReject,
}: PlanCardProps) {
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const startEdit = (step: PlanStep) => {
    setEditingStepId(step.id);
    setEditText(step.description);
  };

  const saveEdit = () => {
    if (editingStepId && onModify) {
      onModify(plan.id, {
        steps: plan.steps.map((s) =>
          s.id === editingStepId ? { ...s, description: editText } : s
        ),
      });
    }
    setEditingStepId(null);
    setEditText('');
  };

  return (
    <Card className="border-green-500/30 bg-green-500/5 dark:border-green-900/30 dark:bg-green-900/10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-3 w-3 text-green-500" />
            <CardTitle className="text-sm font-medium text-green-600 dark:text-green-400">
              执行计划 (v{plan.version})
            </CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {plan.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pt-0">
        <div className="space-y-1">
          {plan.steps.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                'p-2 rounded-lg text-sm transition-colors',
                step.status === 'in_progress' && 'bg-blue-500/10 border-l-2 border-blue-500',
                step.status === 'completed' && 'bg-green-500/10 border-l-2 border-green-500',
                step.status === 'failed' && 'bg-red-500/10 border-l-2 border-red-500'
              )}
            >
              <div className="flex items-start gap-2">
                <div className="flex items-center justify-center w-6 h-6 shrink-0">
                  {step.status === 'pending' && (
                    <span className="w-4 h-4 rounded-full border border-muted-foreground/30 text-[10px] flex items-center justify-center">
                      {index + 1}
                    </span>
                  )}
                  {step.status === 'in_progress' && (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  )}
                  {step.status === 'completed' && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  {step.status === 'failed' && (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {editingStepId === step.id ? (
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit();
                        if (e.key === 'Escape') {
                          setEditText('');
                          setEditingStepId(null);
                        }
                      }}
                      autoFocus
                      className="w-full px-2 py-1 text-sm border rounded bg-background"
                    />
                  ) : (
                    <p
                      className={cn(
                        'cursor-pointer',
                        step.requiresApproval && !step.approved && 'text-amber-600'
                      )}
                      onClick={() => startEdit(step)}
                    >
                      <span className="font-medium">{index + 1}. </span>
                      <span>{step.description}</span>
                      {step.requiresApproval && !step.approved && (
                        <Badge variant="secondary" className="ml-1 text-[9px]">
                          需批准
                        </Badge>
                      )}
                      {step.status === 'failed' && step.error && (
                        <span className="ml-2 text-[10px] text-red-500">
                          ({step.error})
                        </span>
                      )}
                    </p>
                  )}
                </div>

                {step.referencedEntities.length > 0 && (
                  <div className="flex items-center gap-1 ml-8 flex-wrap">
                    {step.referencedEntities.map((entity) => (
                      <Badge
                        key={entity.id}
                        variant="outline"
                        className="text-[9px] h-4"
                      >
                        {entity.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {plan.status === 'pending_review' && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button variant="default" size="sm" onClick={() => onApprove?.(plan.id)}>
              <CheckCircle2 className="h-3 w-3 mr-1.5" />
              批准计划
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const reason = prompt('请输入拒绝原因：');
                if (reason) onReject?.(plan.id, reason);
              }}
            >
              <XCircle className="h-3 w-3 mr-1.5" />
              拒绝
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const changes = prompt('请输入修改建议：');
                if (changes && onModify) {
                  onModify(plan.id, {
                    steps: plan.steps,
                    feedback: changes,
                  } as any);
                }
              }}
            >
              修改计划
            </Button>
          </div>
        )}

        {plan.feedback && (
          <div className="p-2 bg-amber-50/50 rounded text-sm text-amber-700 dark:text-amber-300">
            <strong>约束/反馈：</strong> {plan.feedback}
          </div>
        )}
      </CardContent>
    </Card>
  );
}