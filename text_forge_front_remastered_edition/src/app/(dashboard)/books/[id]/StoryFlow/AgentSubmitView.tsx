'use client';

/**
 * 剧情流：提交到工作流的执行视图（从 StoryFlow.tsx renderAgentSubmitView 抽离）。
 * 覆盖 review-needed / lock-conflict / summarizing / streaming / success / error 各态。
 */
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { SubmitState, AgentNodeStatus } from './useStoryFlowSubmit';

interface AgentSubmitViewProps {
  submitState: SubmitState;
  nodeStatuses: Record<string, AgentNodeStatus>;
  agentReply: string;
  reviewData: { nodeLabel?: string; reason?: string } | null;
  onRetry: () => void;
  onGoAgentPanel: () => void;
}

export function AgentSubmitView({ submitState, nodeStatuses, agentReply, reviewData, onRetry, onGoAgentPanel }: AgentSubmitViewProps) {
  if (submitState === 'idle') return null;

  // 审计拦截提示条
  if (submitState === 'review-needed' && reviewData) {
    return (
      <div className="mt-6 max-w-2xl mx-auto">
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3">
          <AlertTriangle size={14} className="text-amber-500/70 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-foreground/80 font-medium">
              节点 {reviewData.nodeLabel ?? ''} 需要审核
            </p>
            {reviewData.reason && (
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">{reviewData.reason}</p>
            )}
            <p className="text-[10px] text-muted-foreground/50 mt-1">工作流已暂停，请前往 Agent 面板处理（接受/重试/编辑）</p>
          </div>
          <button
            onClick={onGoAgentPanel}
            className="flex-shrink-0 h-7 px-3 rounded-md text-[11px] font-medium bg-amber-500/90 text-background border-none cursor-pointer hover:opacity-90"
          >
            前往 Agent 面板处理
          </button>
        </div>
      </div>
    );
  }

  if (submitState === 'lock-conflict') {
    return (
      <div className="mt-6 max-w-2xl mx-auto">
        <div className="flex items-start gap-2 rounded-xl border border-border/40 bg-background/40 px-4 py-3">
          <AlertTriangle size={14} className="text-muted-foreground/50 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-foreground/80 font-medium">该书正有 Agent 任务进行中</p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">请稍后再试，或前往 Agent 面板查看进行中的任务。</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onRetry}
              className="h-7 px-3 rounded-md text-[11px] border border-border/40 bg-transparent cursor-pointer hover:text-foreground/80 flex items-center gap-1"
            >
              <RefreshCw size={11} /> 稍后重试
            </button>
            <button
              onClick={onGoAgentPanel}
              className="h-7 px-3 rounded-md text-[11px] font-medium bg-foreground text-background border-none cursor-pointer hover:opacity-90"
            >
              前往 Agent 面板
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (submitState === 'summarizing') {
    return (
      <div className="mt-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground/70">
          <Loader2 size={13} className="animate-spin" />
          生成摘要中…
        </div>
      </div>
    );
  }

  // streaming / success / error：agent 消息气泡 + 节点状态列表
  const statusList = Object.entries(nodeStatuses);
  return (
    <div className="mt-6 max-w-2xl mx-auto">
      <div className="rounded-xl border border-border/40 bg-background/40 overflow-hidden">
        <div className="px-4 py-2 border-b border-border/20 flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">Agent 执行中</span>
          {(submitState === 'streaming' || submitState === 'success') && (
            <span className="text-[10px] text-muted-foreground/50">
              {Object.values(nodeStatuses).filter((s) => s.status === 'completed').length}/{Object.keys(nodeStatuses).length || '—'} 节点完成
            </span>
          )}
        </div>
        <div className="px-4 py-3 space-y-2 max-h-[280px] overflow-y-auto">
          {agentReply ? (
            <div className="text-[12px] leading-relaxed text-foreground/80 whitespace-pre-wrap break-words">
              {agentReply}
              {submitState === 'streaming' && <span className="inline-block w-1 h-3.5 bg-foreground/40 ml-0.5 align-middle animate-pulse" />}
            </div>
          ) : submitState === 'streaming' ? (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
              <span className="thinking-shimmer-text">执行工作流中</span>
              <span className="ml-auto inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground/70" />
            </div>
          ) : null}

          {statusList.map(([nodeId, s]) => (
            <div key={nodeId} className="flex items-start gap-2">
              {s.status === 'completed' && <CheckCircle2 size={13} className="text-green-500/70 mt-0.5 shrink-0" />}
              {s.status === 'failed' && <XCircle size={13} className="text-red-500/60 mt-0.5 shrink-0" />}
              {s.status === 'running' && <Loader2 size={13} className="text-foreground/40 animate-spin mt-0.5 shrink-0" />}
              {s.status === 'pending' && <div className="w-3 h-3 rounded-full border border-border/30 mt-1 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={cn('text-[11px]', s.status === 'completed' ? 'text-foreground/50' : s.status === 'failed' ? 'text-red-500/70' : s.status === 'running' ? 'text-foreground/80 font-medium' : 'text-foreground/40')}>
                    {s.label}
                  </span>
                  {s.tokens !== undefined && (
                    <span className="text-[9px] text-foreground/30 tabular-nums">{s.tokens}t</span>
                  )}
                  {s.status === 'failed' && s.reason && (
                    <span className="text-[9px] text-red-500/50 truncate max-w-[140px]">{s.reason}</span>
                  )}
                </div>
                {s.output && (
                  <div className="text-[10px] leading-relaxed text-foreground/45 bg-foreground/[0.03] rounded-md px-2 py-1.5 mt-1 max-h-[80px] overflow-y-auto whitespace-pre-wrap break-words">
                    {s.output}
                    {s.status === 'running' && <span className="inline-block w-1 h-3 bg-foreground/30 ml-0.5 animate-pulse" />}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {submitState === 'success' && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground/60">已在 agent 会话中生成，可前往 Agent 面板查看</p>
          <button
            onClick={onGoAgentPanel}
            className="h-7 px-3 rounded-md text-[11px] font-medium bg-foreground text-background border-none cursor-pointer hover:opacity-90"
          >
            前往 Agent 面板查看
          </button>
        </div>
      )}

      {submitState === 'error' && (
        <div className="mt-3 flex items-center gap-2">
          <p className="text-[11px] text-red-500/70 flex-1">Agent 执行失败，推演与会话已保留</p>
          <button
            onClick={onRetry}
            className="h-7 px-3 rounded-md text-[11px] border border-border/40 bg-transparent cursor-pointer hover:text-foreground/80 flex items-center gap-1"
          >
            <RefreshCw size={11} /> 重试
          </button>
        </div>
      )}
    </div>
  );
}
