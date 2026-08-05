'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Play, CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import * as agentApi from '@/shared/api/agent';
import { fetchModelConfig } from '@/shared/api/models';
import type { Workflow } from '@/shared/api/workflows';

interface NodeStatus {
  nodeId: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tokens?: number;
  reason?: string;
}

interface ExecutionPanelProps {
  workflow: Workflow;
  bookId?: number;
  onClose: () => void;
}

export function ExecutionPanel({ workflow, bookId, onClose }: ExecutionPanelProps) {
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<NodeStatus[]>(() =>
    workflow.nodes.map((n) => ({
      nodeId: n.id,
      label: n.label || n.id,
      status: 'pending' as const,
    })),
  );
  const [threadId, setThreadId] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const streamRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setStatuses(
      workflow.nodes.map((n) => ({
        nodeId: n.id,
        label: n.label || n.id,
        status: 'pending',
      })),
    );
  }, [workflow.id]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setStatuses((prev) => prev.map((s) => ({ ...s, status: 'pending' })));

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const session = await agentApi.startAgentSession(bookId);
      const tid = session.thread_id;
      setThreadId(tid);

      let reply = '';
      await agentApi.streamAgent(
        tid,
        `请按工作流 "${workflow.name}" (ID: ${workflow.id}) 执行创作任务。`,
        (event) => {
          switch (event.type) {
            case 'node_start':
              setStatuses((prev) =>
                prev.map((s) =>
                  s.nodeId === (event as any).node_id
                    ? { ...s, status: 'running' }
                    : s,
                ),
              );
              break;
            case 'node_end':
              setStatuses((prev) =>
                prev.map((s) =>
                  s.nodeId === (event as any).node_id
                    ? { ...s, status: 'completed', tokens: (event as any).tokens }
                    : s,
                ),
              );
              break;
            case 'node_fail':
              setStatuses((prev) =>
                prev.map((s) =>
                  s.nodeId === (event as any).node_id
                    ? { ...s, status: 'failed', reason: (event as any).reason }
                    : s,
                ),
              );
              break;
          }
        },
        (finalReply) => {
          reply = finalReply;
          setRunning(false);
        },
        (err) => {
          setRunning(false);
        },
        controller.signal,
      );
    } catch {
      setRunning(false);
    } finally {
      setAbortController(null);
    }
  }, [workflow, bookId]);

  const handleStop = useCallback(() => {
    abortController?.abort();
    setRunning(false);
    setAbortController(null);
  }, [abortController]);

  const completedCount = statuses.filter((s) => s.status === 'completed').length;
  const failedCount = statuses.filter((s) => s.status === 'failed').length;

  return (
    <div className="border-t border-[#1c1b1a]/[0.08] bg-[#f4f3f0]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1c1b1a]/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1c1b1a]/30">
            运行面板
          </span>
          {running && (
            <span className="text-[10px] text-[#1c1b1a]/40">
              {completedCount}/{statuses.length} 完成
            </span>
          )}
          {!running && completedCount > 0 && (
            <span className="text-[10px] text-[#1c1b1a]/40">
              完成 {completedCount}/{statuses.length}
              {failedCount > 0 && ` (${failedCount} 失败)`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!running ? (
            <button
              onClick={handleRun}
              disabled={!bookId}
              className="flex items-center gap-1 h-7 px-3 rounded-md bg-[#1c1b1a] text-[#f4f3f0] text-xs font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-40"
              title={!bookId ? '未选择活动书籍' : undefined}
            >
              <Play size={12} /> 运行
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="flex items-center gap-1 h-7 px-3 rounded-md bg-[#1c1b1a]/[0.06] text-[#1c1b1a] text-xs font-medium border border-[#1c1b1a]/[0.10] cursor-pointer hover:bg-[#1c1b1a]/[0.10]"
            >
              停止
            </button>
          )}
          <button
            onClick={onClose}
            className="w-5 h-5 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-[#1c1b1a]/20 hover:text-[#1c1b1a]/50"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="py-2 px-4 space-y-1 max-h-[160px] overflow-y-auto">
        {statuses.map((s) => (
          <div
            key={s.nodeId}
            className={cn(
              'flex items-center gap-2 px-2 py-1 rounded text-xs',
              s.status === 'running' && 'bg-[#1c1b1a]/[0.04]',
            )}
          >
            {s.status === 'completed' && (
              <CheckCircle2 size={12} className="text-[#1c1b1a]/40 shrink-0" />
            )}
            {s.status === 'failed' && (
              <XCircle size={12} className="text-red-500/60 shrink-0" />
            )}
            {s.status === 'running' && (
              <Loader2 size={12} className="text-[#1c1b1a]/40 animate-spin shrink-0" />
            )}
            {s.status === 'pending' && (
              <div className="w-3 h-3 rounded-full border border-[#1c1b1a]/[0.12] shrink-0" />
            )}
            <span
              className={cn(
                'flex-1 truncate',
                s.status === 'completed' && 'text-[#1c1b1a]/50',
                s.status === 'failed' && 'text-red-500/70',
                s.status === 'running' && 'text-[#1c1b1a]/70 font-medium',
                s.status === 'pending' && 'text-[#1c1b1a]/30',
              )}
            >
              {s.label}
            </span>
            {s.tokens !== undefined && (
              <span className="text-[10px] text-[#1c1b1a]/25 tabular-nums shrink-0">
                {s.tokens}t
              </span>
            )}
            {s.status === 'failed' && s.reason && (
              <AlertTriangle size={12} className="text-red-500/40 shrink-0" />
            )}
          </div>
        ))}
        {statuses.length === 0 && (
          <div className="text-[10px] text-[#1c1b1a]/25 text-center py-2">
            无节点
          </div>
        )}
      </div>
    </div>
  );
}
