// src/components/projects/StepCard.tsx
'use client';

import { useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, Edit2, Loader2, PauseCircle, CheckCircle2, Expand, RefreshCw, Minimize2, SkipForward, RotateCcw, BookOpen, Sparkles, Image as ImageIcon, Clapperboard } from 'lucide-react';
import Link from 'next/link';
import { Step } from '@/types';
import { AGENTS } from './WorkflowGraph';

interface Props {
  step: Step;
  index: number;
  isLast: boolean;
  isEditing: boolean;
  editContent: string;
  onEditChange: (val: string) => void;
  onEditStart: (content: string) => void;
  onEditCancel: () => void;
  onSaveEdit: (stepId: string) => void;
  onConfirm: (stepId: string) => void;
  onSendToManuscript?: (step: Step) => void;
  onAiAction?: (action: 'expand' | 'rewrite' | 'summarize', text: string, stepId: string) => void;
  onSkip?: (stepId: string) => void;
  onRetry?: (stepId: string) => void;
  /** 项目 id，用于「去 AI绘画/视频」带当前章节深链 */
  projectId?: string;
}

export function StepCard({
  step, index, isLast, isEditing, editContent,
  onEditChange, onEditStart, onEditCancel, onSaveEdit, onConfirm, onAiAction,
  onSendToManuscript,
  onSkip, onRetry, projectId,
}: Props) {
  const agentLabel = step.agentName || AGENTS.find(a => a.id === step.agent)?.label || '步骤';
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const textRef = useRef<HTMLDivElement>(null);

  const handleSelect = () => {
    const selection = window.getSelection();
    if (selection?.toString().trim()) {
      setSelectedText(selection.toString());
      setShowAiMenu(true);
    }
    else {
      setShowAiMenu(false);
    }
  };

  const handleAiAction = (action: 'expand' | 'rewrite' | 'summarize') => {
    if (selectedText && onAiAction) {
      onAiAction(action, selectedText, step.id);
    }
    setShowAiMenu(false);
    setSelectedText('');
  };

  return (
    <Card className="p-4 border-border/40 bg-card/30 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{agentLabel}</span>
          {step.status === 'streaming' && <span className="text-xs text-blue-500 animate-pulse flex items-center gap-1"><Loader2 className="w-3.5 h-3.5" /> 生成中…</span>}
          {step.status === 'waiting' && <span className="text-xs text-yellow-500 flex items-center gap-1"><PauseCircle className="w-3.5 h-3.5" /> 等待确认</span>}
          {step.status === 'completed' && <span className="text-xs text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> 已完成</span>}
          {step.status === 'failed' && <span className="text-xs text-destructive flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> 失败</span>}
          {step.content?.includes('（生成结果占位）') && (
            <span className="text-xs text-amber-600/90 bg-amber-500/10 px-1.5 py-0.5 rounded-full flex items-center gap-1" title="当前为预览模式，这是本地示例内容；配置后端/密钥后才会由 AI 真正生成">
              <Sparkles className="w-3 h-3" /> 示例内容
            </span>
          )}
          {step.nodeId ? (
            <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">AI生成</span>
          ) : (
            <span className="text-[10px] text-muted-foreground bg-border/40 px-1.5 py-0.5 rounded-full">手工</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">步骤 {index + 1}</span>
          {step.status === 'waiting' && onSkip && (
            <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground" onClick={() => onSkip(step.id)}>
              <SkipForward className="w-3 h-3 mr-1" /> 跳过
            </Button>
          )}
          {step.status === 'failed' && onRetry && (
            <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive" onClick={() => onRetry(step.id)}>
              <RotateCcw className="w-3 h-3 mr-1" /> 重试
            </Button>
          )}
        </div>
      </div>

      <div
        ref={textRef}
        onMouseUp={handleSelect}
        className="prose prose-sm dark:prose-invert max-w-none cursor-text relative"
      >
        {step.content || (step.status === 'streaming' && '...')}
      </div>

      {showAiMenu && selectedText && (
        <div className="absolute top-2 right-2 z-50 flex gap-1">
          <Button size="sm" variant="secondary" className="h-6 text-xs" onClick={() => handleAiAction('expand')}>
            <Expand className="w-3 h-3 mr-1" /> 扩写
          </Button>
          <Button size="sm" variant="secondary" className="h-6 text-xs" onClick={() => handleAiAction('rewrite')}>
            <RefreshCw className="w-3 h-3 mr-1" /> 改写
          </Button>
          <Button size="sm" variant="secondary" className="h-6 text-xs" onClick={() => handleAiAction('summarize')}>
            <Minimize2 className="w-3 h-3 mr-1" /> 缩写
          </Button>
        </div>
      )}

      {isEditing && isLast && step.status === 'waiting' && (
        <div className="mt-3 space-y-2">
          <Textarea
            value={editContent}
            onChange={(e) => onEditChange(e.target.value)}
            rows={6}
            className="font-mono text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onSaveEdit(step.id)}>保存修改</Button>
            <Button size="sm" variant="outline" onClick={onEditCancel}>取消</Button>
          </div>
        </div>
      )}

      {step.status === 'waiting' && !isEditing && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
          <Button size="sm" onClick={() => onConfirm(step.id)}>
            <Check className="w-4 h-4 mr-2" /> 确认继续
          </Button>
          <Button size="sm" variant="outline" onClick={() => onEditStart(step.content)}>
            <Edit2 className="w-4 h-4 mr-2" /> 修改
          </Button>
          {onSendToManuscript && (
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onSendToManuscript(step)}>
              <BookOpen className="w-4 h-4 mr-1.5" /> 发到手稿
            </Button>
          )}
        </div>
      )}

      {step.status === 'completed' && projectId && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
          <span className="text-xs text-muted-foreground">用本章生成：</span>
          <Button size="sm" variant="ghost" className="text-muted-foreground" asChild>
            <Link href={`/assets?project=${projectId}&chapter=${step.id}`}>
              <ImageIcon className="w-4 h-4 mr-1.5" /> 章节插图
            </Link>
          </Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground" asChild>
            <Link href={`/tasks?project=${projectId}&chapter=${step.id}`}>
              <Clapperboard className="w-4 h-4 mr-1.5" /> 章节动画
            </Link>
          </Button>
        </div>
      )}
    </Card>
  );
}