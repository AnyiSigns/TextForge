// src/lib/api/workflowStorage.ts
// 工作流存储：直接调用后端接口，无本地 mock 回退。
import apiClient from '@/shared/lib/apiClient';
import type { Workflow, ListWorkflowsResponse, WorkflowResponse } from './workflowTypes';

export async function listWorkflows(): Promise<Workflow[]> {
  const { data } = await apiClient.get<ListWorkflowsResponse>('/api/workflows');
  return data.workflows || [];
}

export async function getWorkflow(id: string): Promise<Workflow | undefined> {
  const { data } = await apiClient.get<WorkflowResponse>(`/api/workflows/${id}`);
  return data.workflow;
}

export async function saveWorkflow(wf: Workflow): Promise<Workflow> {
  const { data } = await apiClient.put<WorkflowResponse>(`/api/workflows/${wf.id}`, wf);
  return data.workflow;
}

export async function deleteWorkflow(id: string): Promise<void> {
  await apiClient.delete(`/api/workflows/${id}`);
}
