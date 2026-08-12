import { apiClient } from './client';

export interface WorkflowNode {
  id: string;
  label: string;
  systemPrompt?: string;
  contextFields?: string[];
  ragFilter?: { query?: string; docIds?: string[]; authorIds?: string[]; sample?: string };
  ragTopK?: number;
  executor?: 'main' | 'audit' | 'tool' | 'router';
}

export interface WorkflowEdge {
  from: string;
  to: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  builtin?: boolean;
}

export async function listWorkflows(): Promise<Workflow[]> {
  const { data } = await apiClient.get<{ workflows: Workflow[] }>('/workflows/');
  return data.workflows ?? [];
}

export async function getWorkflow(id: string): Promise<Workflow> {
  const { data } = await apiClient.get<{ workflow: Workflow }>(`/workflows/${id}`);
  return data.workflow;
}

export async function saveWorkflow(wf: Workflow): Promise<Workflow> {
  if (!wf.id) {
    // 死分支：前端在新建页已通过 makeNodeId 生成且始终携带 id（见 [id]/page.tsx），
    // 实际保存均走下方 PUT。此处保留仅为兼容后端契约（POST /workflows/ 创建），
    // 防止极端情况下 wf.id 为空时 PUT 集合路径被后端 405 拒绝。
    const { data } = await apiClient.post<{ workflow: Workflow }>('/workflows/', wf);
    return data.workflow;
  }
  const { data } = await apiClient.put<{ workflow: Workflow }>(`/workflows/${wf.id}`, wf);
  return data.workflow;
}

export async function deleteWorkflow(id: string): Promise<void> {
  await apiClient.delete(`/workflows/${id}`);
}
