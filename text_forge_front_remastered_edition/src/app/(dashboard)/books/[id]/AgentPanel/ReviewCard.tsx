'use client';

import { useRef, useState } from 'react';
import { Check, X, Pencil, AlertTriangle, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

interface ReviewCardProps {
  data: Record<string, unknown>;
  onAction: (action: 'accept' | 'retry' | 'edit' | 'terminate', editedContent?: string, chapterId?: number) => void;
  /** 2.12：历史回放只读（true 时不渲染操作按钮，仅展示卡内容） */
  disabled?: boolean;
}

/** 按原因关键词分类展示失败类型（质量/设定/上下文/连贯性/其他）。 */
function reasonCategory(reason: string): { label: string; cls: string } {
  if (/角色|人设|设定/.test(reason)) return { label: '角色/设定不符', cls: 'text-amber-500/90 border-amber-500/30' };
  if (/上下文|背景/.test(reason)) return { label: '上下文缺失', cls: 'text-sky-500/90 border-sky-500/30' };
  if (/连贯|一致|矛盾/.test(reason)) return { label: '连贯性', cls: 'text-violet-500/90 border-violet-500/30' };
  return { label: '质量不达标', cls: 'text-destructive/80 border-destructive/30' };
}

export function ReviewCard({ data, onAction, disabled = false }: ReviewCardProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [showFull, setShowFull] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const nodeLabel = String(data.node_label || data.node_id || '');
  const reason = String(data.reason || '输出不符合该角色节点的写作要求');
  const fullPreview = String(data.output_preview || '');
  const outputPreview = fullPreview.slice(0, 300);
  // 后端审计拦截卡携带目标章节；「终止并生成正文」需回传定位落库章节
  const targetChapterId = typeof data.target_chapter_id === 'number' ? data.target_chapter_id : undefined;
  // 卡片展示节点 tokens 与耗时（后端 pending_review 附带）
  const tokens = typeof data.tokens === 'number' ? data.tokens : undefined;
  const elapsedMs = typeof data.elapsed_ms === 'number' ? data.elapsed_ms : undefined;
  const category = reasonCategory(reason);

  const handleAction = (action: 'accept' | 'retry' | 'edit' | 'terminate', editedContent?: string) => {
    if (submitting || disabled) return;
    if (action === 'edit' && !(editedContent || '').trim()) {
      // 空内容校验：不提交，聚焦输入框
      textareaRef.current?.focus();
      return;
    }
    setSubmitting(true);
    onAction(action, editedContent, targetChapterId);
  };

  const startEditing = () => {
    // 写工具审核卡的 output_preview 以「章节ID=xxx」开头，那是预览前缀而非正文，
    // 回填编辑框前剥离，避免提交修改时把前缀写进章节正文。
    setEditText(fullPreview.replace(/^章节ID=\d+\n/, ''));
    setEditing(true);
  };

  return (
    <div className="mx-1 my-2 p-3 rounded-lg border border-destructive/40 bg-destructive/5">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={14} className="text-destructive shrink-0" />
        <span className="text-xs font-semibold text-destructive">审核请求</span>
        {(tokens !== undefined || elapsedMs !== undefined) && (
          <span className="text-[10px] text-muted-foreground/60 tabular-nums">
            {tokens !== undefined && `${tokens}t`}
            {tokens !== undefined && elapsedMs !== undefined && ' · '}
            {elapsedMs !== undefined && `${(elapsedMs / 1000).toFixed(1)}s`}
          </span>
        )}
        <span className={cn('ml-auto text-[10px] px-1.5 py-px rounded-full border', category.cls)}>{category.label}</span>
      </div>
      <div className="text-xs text-muted-foreground mb-1">
        节点 &ldquo;{nodeLabel}&rdquo; 的输出未通过质量检查
      </div>
      <div className="text-[11px] text-foreground/80 mb-2 whitespace-pre-wrap border-l-2 border-destructive/30 pl-2">
        {showFull ? (
          <div className="max-h-52 overflow-y-auto">{fullPreview}</div>
        ) : (
          <>
            {outputPreview}
            {fullPreview.length > 300 && '...'}
          </>
        )}
        {fullPreview.length > 300 && (
          <button
            onClick={() => setShowFull((v) => !v)}
            className="mt-1 flex items-center gap-1 text-[10px] text-destructive/80 bg-transparent border-none cursor-pointer px-0"
          >
            {showFull ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {showFull ? '收起' : '查看完整输出'}
          </button>
        )}
      </div>
      <div className="text-[11px] text-muted-foreground mb-2 italic">{reason}</div>

      {disabled ? (
        <div className="text-[10px] text-muted-foreground/50 border-t border-border/30 pt-1.5">
          历史审核记录（只读）
        </div>
      ) : editing ? (
        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={editText}
            maxLength={10000}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              // Esc 取消，Ctrl/Cmd+Enter 提交（快捷键）
              if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleAction('edit', editText); }
            }}
            placeholder={outputPreview}
            className="w-full h-20 rounded-md text-xs p-2 bg-background border border-border resize-none focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">{editText.length}/10000</span>
            <div className="flex gap-2">
            <button onClick={() => handleAction('edit', editText)} disabled={!editText.trim() || submitting}
              className="flex-1 h-7 rounded-md bg-foreground text-background text-xs font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-default">
              {submitting ? '提交中…' : '提交修改'}
            </button>
            <button onClick={() => setEditing(false)} disabled={submitting}
              className="px-3 h-7 rounded-md border border-border text-xs cursor-pointer bg-transparent hover:bg-muted disabled:opacity-40 disabled:cursor-default">
              取消
            </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <button onClick={() => handleAction('accept')} disabled={submitting}
              className={cn(
                'flex-1 h-7 rounded-md text-xs font-medium border-none cursor-pointer flex items-center justify-center gap-1',
                'bg-foreground text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-default',
              )}
            >
              <Check size={12} /> {submitting ? '处理中…' : '接受'}
            </button>
            <button onClick={() => handleAction('retry')} disabled={submitting}
              className="flex-1 h-7 rounded-md bg-destructive/10 text-destructive text-xs font-medium border-none cursor-pointer hover:bg-destructive/20 disabled:opacity-40 disabled:cursor-default flex items-center justify-center gap-1"
            >
              <X size={12} /> 拒绝重试
            </button>
            <button onClick={startEditing} disabled={submitting}
              className="flex-1 h-7 rounded-md border border-border text-xs cursor-pointer bg-transparent hover:bg-muted disabled:opacity-40 disabled:cursor-default flex items-center justify-center gap-1"
            >
              <Pencil size={12} /> 自定义
            </button>
          </div>
          <button onClick={() => handleAction('terminate')} disabled={submitting}
            className="w-full h-7 rounded-md border border-destructive/40 bg-transparent text-muted-foreground text-xs cursor-pointer hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 disabled:cursor-default flex items-center justify-center gap-1"
          >
            <FileText size={12} /> 终止并生成正文
          </button>
        </div>
      )}
    </div>
  );
}
