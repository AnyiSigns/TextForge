// src/lib/api/workflowRunner.ts
// 工作流运行：后端 SSE 驱动，前端按事件流消费节点产出。
import type { WorkflowRunStep, RunWorkflowOptions } from './workflowTypes';
import apiClient from '@/shared/lib/apiClient';

type GenerationContext = import('@/types').GenerationContext;

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

export async function runWorkflow(
  workflowId: string,
  input: string,
  opts?: RunWorkflowOptions,
  projectContext?: GenerationContext,
): Promise<WorkflowRunStep[]> {
  const threadId = opts?.projectId
    ? `${opts.projectId}-${Date.now()}`
    : `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const visibleNodeIds = new Set(
    Array.isArray(opts?.visibleNodeIds) ? opts.visibleNodeIds : opts?.visibleNodeIds ? Array.from(opts.visibleNodeIds) : [],
  );
  const res = await fetch(`${apiClient.defaults.baseURL}/api/workflows/${workflowId}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${(await import('@/lib/stores/authStore')).useAuthStore.getState().accessToken}`,
    },
    body: JSON.stringify({ input, project_id: opts?.projectId, thread_id: threadId }),
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
      if ((eventType === 'node_start' || eventType === 'on_chain_start') && event.node && event.node !== '__input__') {
        const nodeId = String(event.node);
        currentNode = { id: nodeId, label: nodeId };
      }
      if ((eventType === 'node_stream' || eventType === 'on_chat_model_stream') && event.node && typeof event.output === 'string') {
        const text = event.output;
        if (!text) continue;
        const target = currentNode?.id ? currentNode.id : String(event.node);
        const nodeId = target === 'ChatOpenAI' ? (currentNode?.id || target) : target;
        if (visibleNodeIds.size > 0 && !visibleNodeIds.has(nodeId)) continue;
        const label = currentNode?.label || nodeId;
        const existing = steps.find((s) => s.nodeId === nodeId);
        if (existing) {
          existing.output = (existing.output || '') + text;
          existing.status = 'running';
        } else {
          steps.push({ nodeId, label, output: text, status: 'running' });
        }
        opts?.onStep?.(nodeId, label, existing ? existing.output : text, undefined);
      }
      if ((eventType === 'node_end' || eventType === 'on_chain_end') && event.node) {
        const nodeId = String(event.node);
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
          if (existing.output) {
            opts?.onStep?.(nodeId, existing.label || nodeId, existing.output, undefined);
          }
        } else {
          steps.push({ nodeId, label: nodeId, output: text, status: 'done' });
          currentNode = null;
          if (text) {
            opts?.onStep?.(nodeId, nodeId, text, undefined);
          }
        }
      }
      if (event.steps && Array.isArray(event.steps)) {
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
