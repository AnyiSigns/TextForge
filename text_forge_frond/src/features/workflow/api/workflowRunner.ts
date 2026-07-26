// src/lib/api/workflowRunner.ts
// 工作流运行：后端 SSE 驱动，前端按事件流消费节点产出。
import type { WorkflowNode, WorkflowRunStep, RunWorkflowOptions } from './workflowTypes';
import apiClient from '@/shared/lib/apiClient';

type GenerationContext = import('@/types').GenerationContext;

function parseSSE(text: string): Record<string, unknown> | null {
  const data = text.split('\n').find((l) => l.startsWith('data:'));
  if (!data) return null;
  try { return JSON.parse(data.slice(5)); } catch { return null; }
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
      if (event.node && event.node !== '__input__') {
        const step: WorkflowRunStep = {
          nodeId: String(event.node),
          label: String(event.node),
          output: '',
          status: 'running',
        };
        steps.push(step);
        opts?.onStep?.(step.nodeId, step.label, step.output, undefined);
      }
      if (event.node && typeof event.output === 'string') {
        const nodeId = String(event.node);
        const text = event.output;
        const existing = steps.find((s) => s.nodeId === nodeId);
        if (existing) {
          existing.output = text;
          existing.status = 'done';
        } else {
          steps.push({ nodeId, label: nodeId, output: text, status: 'done' });
        }
        opts?.onStep?.(nodeId, nodeId, text, undefined);
      }
      if (event.output && typeof event.output === 'object') {
        const out = event.output as Record<string, string>;
        for (const [nodeId, text] of Object.entries(out)) {
          const existing = steps.find((s) => s.nodeId === nodeId);
          if (existing) {
            existing.output = text;
            existing.status = 'done';
          } else {
            steps.push({ nodeId, label: nodeId, output: text, status: 'done' });
          }
          opts?.onStep?.(nodeId, nodeId, text, undefined);
        }
      }
      if (event.steps && Array.isArray(event.steps)) {
        for (const s of event.steps as WorkflowRunStep[]) {
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
