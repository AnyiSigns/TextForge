// src/components/projects/StepCard.tsx
'use client';

import { memo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PauseCircle, CheckCircle2, RotateCcw, Sparkles, Image as ImageIcon, Clapperboard, FileText } from 'lucide-react';
import Link from 'next/link';
import { Step } from '@/types';
import { AGENTS } from './WorkflowGraph';

interface Props {
  step: Step;
  index: number;
  onSetAsMainText?: (step: Step) => void;
  bookId?: string;
}

export const StepCard = memo(function StepCard({
  step, index, onSetAsMainText, bookId,
}: Props) {
  const agentLabel = step.agentName || AGENTS.find(a => a.id === step.agent)?.label || '步骤';

  return (
    <Card className="p-4 border-border/40 bg-card/30 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{agentLabel}</span>
          {step.status === 'streaming' && <span className="text-xs text-blue-500 animate-pulse flex items-center gap-1"><Loader2 className="w-3.5 h-3.5" /> 生成中…</span>}
          {step.status === 'waiting' && <span className="text-xs text-yellow-500 flex items-center gap-1"><PauseCircle className="w-3.5 h-3.5" /> 等待确认</span>}
          {step.status === 'completed' && <span className="text-xs text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> 已完成</span>}
          {step.status === 'failed' && <span className="text-xs text-destructive flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> 出错了</span>}
          {step.content?.includes('（生成结果占位）') && (
            <span className="text-xs text-amber-600/90 bg-amber-500/10 px-1.5 py-0.5 rounded-full flex items-center gap-1" title="当前为预览模式，这是本地示例内容；配置云端服务/密钥后才会由 AI 真正生成">
              <Sparkles className="w-3 h-3" /> 示例内容
            </span>
          )}
          {step.nodeId ? (
            <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">AI生成</span>
          ) : (
            <span className="text-[10px] text-muted-foreground bg-border/40 px-1.5 py-0.5 rounded-full">自己写</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">步骤 {index + 1}</span>
        </div>
      </div>

      <div
        className="prose prose-sm dark:prose-invert max-w-none"
      >
        {step.content || (step.status === 'streaming' && '...')}
      </div>

      {step.status === 'waiting' && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
          {onSetAsMainText && (
            <Button size="sm" variant="secondary" onClick={() => onSetAsMainText(step)}>
              <FileText className="w-4 h-4 mr-2" /> 设为正文
            </Button>
          )}
        </div>
      )}

      {step.status === 'completed' && projectId && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
          {onSetAsMainText && (
            <Button size="sm" variant="secondary" onClick={() => onSetAsMainText(step)}>
              <FileText className="w-4 h-4 mr-2" /> 设为正文
            </Button>
          )}
          <span className="text-xs text-muted-foreground">用本章生成：</span>
          <Button size="sm" variant="ghost" className="text-muted-foreground" asChild>
            <Link href={`/assets?book=${bookId}&chapter=${step.id}`}>
              <ImageIcon className="w-4 h-4 mr-1.5" /> 章节插图
            </Link>
          </Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground" asChild>
            <Link href={`/tasks?book=${bookId}&chapter=${step.id}`}>
              <Clapperboard className="w-4 h-4 mr-1.5" /> 章节动画
            </Link>
          </Button>
        </div>
      )}
    </Card>
  );
});
