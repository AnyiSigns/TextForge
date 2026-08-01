// src/lib/api/workflowRunner.ts
// 工作流运行：后端 SSE 驱动，前端按事件流消费节点产出。
import type { WorkflowRunStep, RunWorkflowOptions } from './workflowTypes';
import apiClient from '@/shared/lib/apiClient';

function parseSSE(text: string): Record<string, unknown> | null {
  const lines = text.split('\n');
  const dataLine = lines.find((l) => l.startsWith('data:'));
  const eventLine = lines.find((l) => l.startsWith('event:'));
  if (!dataLine) return null;
  try {
    const parsed = JSON.parse(dataLine.slice(5));
    if (eventLine) {
      parsed.type = eventLine.slice(6).trim();
    }
    return parsed;
  } catch {
    return null;
  }
}

function resolveId(
  nodeId: string | undefined,
  label: string,
  visibleNodeIds: Set<string>,
  labelToIdMap?: Map<string, string>,
): string {
  const candidate = nodeId || label;
  if (visibleNodeIds.has(candidate)) return candidate;
  if (labelToIdMap) {
    const mapped = labelToIdMap.get(label);
    if (mapped && visibleNodeIds.has(mapped)) return mapped;
  }
  return candidate;
}

export async function runWorkflow(
  workflowId: string,
  opts?: Omit<RunWorkflowOptions, 'input'>,
): Promise<WorkflowRunStep[]> {
  const threadId = opts?.bookId
    ? `${opts.bookId}-${Date.now()}`
    : `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const visibleNodeIds = new Set(
    Array.isArray(opts?.visibleNodeIds) ? opts.visibleNodeIds : opts?.visibleNodeIds ? Array.from(opts.visibleNodeIds) : [],
  );
  const labelToIdMap = opts?.labelToIdMap;
  const body: Record<string, number | string> = {
    book_id: opts?.bookId ?? 0,
    thread_id: threadId,
  };
  const res = await fetch(`${apiClient.defaults.baseURL}/api/workflows/${workflowId}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${(await import('@/shared/stores/sessionStore')).useSessionStore.getState().accessToken}`,
    },
    body: JSON.stringify(body),
    signal: opts?.signal,
  });
  if (!res.ok) throw new Error(`工作流运行失败: ${res.status}`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error('响应流不可读');
  const decoder = new TextDecoder();
  const steps: WorkflowRunStep[] = [];
  let buffer = '';
  let currentNode: { id: string; label: string } | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const event = parseSSE(part);
      if (!event) {
        if (part.trim()) console.log('[SSE raw]', part.slice(0, 200));
        continue;
      }
      console.log('[SSE parsed]', event);
      const eventType = event.type || event.event || '';
      if (eventType === 'node_start' && event.node) {
        const label = String(event.node);
        const nodeId = resolveId(String(event.node_id ?? event.node), label, visibleNodeIds, labelToIdMap);
        currentNode = { id: nodeId, label };
      }
      if (eventType === 'node_stream' && event.node && typeof event.output === 'string') {
        const text = event.output;
        if (!text) continue;
        const label = currentNode?.label || String(event.node);
        const nodeId = resolveId(
          currentNode?.id ? currentNode.id : String(event.node_id ?? event.node),
          label,
          visibleNodeIds,
          labelToIdMap,
        );
        if (visibleNodeIds.size > 0 && !visibleNodeIds.has(nodeId)) {
          console.warn('[SSE] node_stream skipped by visibleNodeIds', nodeId, label, text.slice(0, 20));
          continue;
        }
        const existing = steps.find((s) => s.nodeId === nodeId);
        if (existing) {
          existing.output = (existing.output || '') + text;
          existing.status = 'running';
        } else {
          steps.push({ nodeId, label, output: text, status: 'running' });
          console.info('[SSE] new step created', nodeId, label, text.slice(0, 30));
        }
        console.debug('[SSE] onStep', nodeId, label, (existing ? existing.output : text).slice(0, 30));
        opts?.onStep?.(nodeId, label, existing ? existing.output : text, undefined, 'running');
      }
      if (eventType === 'node_end' && event.node) {
        const label = String(event.node);
        const nodeId = resolveId(String(event.node_id ?? event.node), label, visibleNodeIds, labelToIdMap);
        if (visibleNodeIds.size > 0 && !visibleNodeIds.has(nodeId)) {
          currentNode = null;
          continue;
        }
        const text = typeof event.output === 'string' ? event.output : '';
        const existing = steps.find((s) => s.nodeId === nodeId);
        if (existing) {
          if (text) existing.output = text;
          existing.status = 'done';
          currentNode = null;
          opts?.onStep?.(nodeId, existing.label || nodeId, existing.output, undefined, 'done');
        } else {
          steps.push({ nodeId, label, output: text, status: 'done' });
          currentNode = null;
          opts?.onStep?.(nodeId, label, text, undefined, 'done');
        }
      }
      if (eventType === 'done' && event.steps && Array.isArray(event.steps)) {
        for (const s of event.steps as WorkflowRunStep[]) {
          if (visibleNodeIds.size > 0 && !visibleNodeIds.has(s.nodeId)) continue;
          const existing = steps.find((x) => x.nodeId === s.nodeId);
          if (existing) { existing.output = s.output; existing.status = 'done'; }
          else steps.push(s);
          opts?.onStep?.(s.nodeId, s.label, s.output, s.systemPrompt);
        }
      }
    }
  }
  return steps;
}
