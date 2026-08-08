'use client';

import { useState } from 'react';
import { Check, X, Pencil, AlertTriangle, FileText } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

interface ReviewCardProps {
  data: Record<string, unknown>;
  onAction: (action: 'accept' | 'retry' | 'edit' | 'terminate', editedContent?: string, chapterId?: number) => void;
}

export function ReviewCard({ data, onAction }: ReviewCardProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const nodeLabel = String(data.node_label || data.node_id || '');
  const reason = String(data.reason || '输出不符合该角色节点的写作要求');
  const outputPreview = String(data.output_preview || '').slice(0, 300);
  // 后端审计拦截卡携带目标章节；「终止并生成正文」需回传定位落库章节
  const targetChapterId = typeof data.target_chapter_id === 'number' ? data.target_chapter_id : undefined;

  return (
    <div className="mx-1 my-2 p-3 rounded-lg border border-destructive/40 bg-destructive/5">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={14} className="text-destructive shrink-0" />
        <span className="text-xs font-semibold text-destructive">审核请求</span>
      </div>
      <div className="text-xs text-muted-foreground mb-1">
        节点 &ldquo;{nodeLabel}&rdquo; 的输出未通过质量检查
      </div>
      <div className="text-[11px] text-foreground/80 mb-2 max-h-20 overflow-y-auto whitespace-pre-wrap border-l-2 border-destructive/30 pl-2">
        {outputPreview}{outputPreview.length >= 300 ? '...' : ''}
      </div>
      <div className="text-[11px] text-muted-foreground mb-2 italic">{reason}</div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder={outputPreview}
            className="w-full h-20 rounded-md text-xs p-2 bg-background border border-border resize-none focus:outline-none"
          />
          <div className="flex gap-2">
            <button onClick={() => { onAction('edit', editText); setEditing(false); }}
              className="flex-1 h-7 rounded-md bg-foreground text-background text-xs font-medium border-none cursor-pointer hover:opacity-90">
              提交修改
            </button>
            <button onClick={() => setEditing(false)}
              className="px-3 h-7 rounded-md border border-border text-xs cursor-pointer bg-transparent hover:bg-muted">
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <button onClick={() => onAction('accept')}
              className={cn(
                'flex-1 h-7 rounded-md text-xs font-medium border-none cursor-pointer flex items-center justify-center gap-1',
                'bg-foreground text-background hover:opacity-90',
              )}
            >
              <Check size={12} /> 接受
            </button>
            <button onClick={() => onAction('retry')}
              className="flex-1 h-7 rounded-md bg-destructive/10 text-destructive text-xs font-medium border-none cursor-pointer hover:bg-destructive/20 flex items-center justify-center gap-1"
            >
              <X size={12} /> 拒绝重试
            </button>
            <button onClick={() => { setEditText(outputPreview); setEditing(true); }}
              className="flex-1 h-7 rounded-md border border-border text-xs cursor-pointer bg-transparent hover:bg-muted flex items-center justify-center gap-1"
            >
              <Pencil size={12} /> 自定义
            </button>
          </div>
          <button onClick={() => onAction('terminate', undefined, targetChapterId)}
            className="w-full h-7 rounded-md border border-destructive/40 bg-transparent text-muted-foreground text-xs cursor-pointer hover:bg-destructive/10 hover:text-destructive flex items-center justify-center gap-1"
          >
            <FileText size={12} /> 终止并生成正文
          </button>
        </div>
      )}
    </div>
  );
}
