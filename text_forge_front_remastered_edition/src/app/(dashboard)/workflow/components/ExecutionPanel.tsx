'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Play, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import { getModelConfigData } from '@/shared/api/agent';
import { getAccessToken } from '@/shared/stores/authStore';
import { fetchChaptersTree } from '@/shared/api/books';
import type { Chapter, Volume } from '@/shared/api/types';
import type { Workflow } from '@/shared/api/workflows';

interface NodeStatus {
  nodeId: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tokens?: number;
  reason?: string;
  // 节点流式输出（node_stream 累积）
  output?: string;
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
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  // 目标章节选择：传入后工作流节点将按该章写作目标生成正文
  const [chapterTree, setChapterTree] = useState<(Volume & { chapters: Chapter[] })[]>([]);
  const [targetChapterId, setTargetChapterId] = useState<number | ''>('');

  useEffect(() => {
    if (!bookId) return;
    fetchChaptersTree(bookId)
      .then(setChapterTree)
      .catch(() => setChapterTree([]));
  }, [bookId]);

  const chapterOptions = chapterTree.flatMap((v) =>
    (v.chapters ?? []).map((c) => ({ id: c.id, label: `${v.title} / ${c.title}` })),
  );

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

    const applyEvent = (data: any) => {
      const nodeId = data?.node_id as string | undefined;
      switch (data?.event ?? data?.type) {
        case 'node_start':
          if (nodeId) {
            setStatuses((prev) => prev.map((s) => (s.nodeId === nodeId ? { ...s, status: 'running', output: '' } : s)));
          }
          break;
        case 'node_stream':
          // 角色节点执行的流式输出：累积展示，让用户看到生成过程
          if (nodeId && typeof data?.token === 'string') {
            setStatuses((prev) =>
              prev.map((s) => (s.nodeId === nodeId ? { ...s, output: (s.output || '') + data.token } : s)),
            );
          }
          break;
        case 'node_end':
          if (nodeId) {
            setStatuses((prev) =>
              prev.map((s) => (s.nodeId === nodeId ? { ...s, status: 'completed', tokens: data.tokens } : s)),
            );
          }
          break;
        case 'node_fail':
          if (nodeId) {
            setStatuses((prev) =>
              prev.map((s) => (s.nodeId === nodeId ? { ...s, status: 'failed', reason: data.reason } : s)),
            );
          }
          break;
        case 'done': {
          const result = data?.result;
          if (result?.status === 'error') {
            toast.error(result.message || '工作流执行失败');
          } else if (result?.status === 'pending_review') {
            toast.info(`节点 "${result.pending_node_label}" 未通过审计，进入待审核`);
          }
          break;
        }
      }
    };

    try {
      const modelConfigData = await getModelConfigData();
      if (!modelConfigData) {
        toast.error('请先在设置页配置模型');
        setRunning(false);
        return;
      }
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/workflows/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          workflow_id: workflow.id,
          book_id: bookId,
          model_config_data: modelConfigData,
          target_chapter_id: targetChapterId || undefined,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        let msg = '工作流执行请求失败';
        try {
          const d = await res.json();
          if (d?.detail) msg = typeof d.detail === 'string' ? d.detail : msg;
        } catch { /* ignore */ }
        toast.error(msg);
        setRunning(false);
        return;
      }

      // 解析 SSE 事件流
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            applyEvent(JSON.parse(line.slice(6)));
          } catch { /* 忽略无法解析的行 */ }
        }
      }
    } catch (err) {
      // AbortError 为用户主动停止，不算错误
      if ((err as Error)?.name !== 'AbortError') {
        console.error('[workflow] execute failed', err);
        toast.error('工作流执行失败');
      }
    } finally {
      setRunning(false);
      setAbortController(null);
    }
  }, [workflow, bookId, targetChapterId]);

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
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1c1b1a]/30 shrink-0">
            运行面板
          </span>
          {/* 目标章节选择 */}
          <select
            value={targetChapterId}
            onChange={(e) => setTargetChapterId(e.target.value ? Number(e.target.value) : '')}
            disabled={running}
            className="h-6 max-w-[180px] px-1.5 rounded text-[10px] bg-white border border-[#1c1b1a]/[0.10] focus:outline-none text-[#1c1b1a]/60 disabled:opacity-50"
            title="选择目标章节后，工作流将按该章写作目标生成"
          >
            <option value="">目标章节：不限</option>
            {chapterOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {running && (
            <span className="text-[10px] text-[#1c1b1a]/40 shrink-0">
              {completedCount}/{statuses.length} 完成
            </span>
          )}
          {!running && completedCount > 0 && (
            <span className="text-[10px] text-[#1c1b1a]/40 shrink-0">
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
              <span className="text-[10px] text-red-500/50 shrink-0 truncate max-w-[160px]">
                {s.reason}
              </span>
            )}
          {s.output && (
            <div className="pl-8 pr-2 pb-2 -mt-1">
              <div className="text-[10px] leading-relaxed text-[#1c1b1a]/45 bg-[#1c1b1a]/[0.03] rounded-md px-2 py-1.5 max-h-[80px] overflow-y-auto whitespace-pre-wrap break-words">
                {s.output}
                {s.status === 'running' && <span className="inline-block w-1 h-3 bg-[#1c1b1a]/30 ml-0.5 animate-pulse" />}
              </div>
            </div>
          )}
        </div>
      ))}        {statuses.length === 0 && (
          <div className="text-[10px] text-[#1c1b1a]/25 text-center py-2">
            无节点
          </div>
        )}
      </div>
    </div>
  );
}
