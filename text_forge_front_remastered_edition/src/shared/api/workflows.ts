import { apiClient } from './client';

export interface WorkflowNode {
  id: string;
  label: string;
  systemPrompt?: string;
  tier?: 'cheap' | 'standard';
  contextFields?: string[];
  ragFilter?: { docIds?: string[]; authorIds?: string[]; sample?: string };
  ragTopK?: number;
  executor?: 'main' | 'audit' | 'tool' | 'auto';
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
  createdAt?: string;
  updatedAt?: string;
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
  const { data } = await apiClient.put<{ workflow: Workflow }>(`/workflows/${wf.id}`, wf);
  return data.workflow;
}

export async function deleteWorkflow(id: string): Promise<void> {
  await apiClient.delete(`/workflows/${id}`);
}
