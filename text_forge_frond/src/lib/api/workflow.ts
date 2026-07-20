// src/lib/api/workflow.ts
// 创作流水线域 API（契约层对接 openapi/seed-api.yaml -> src/types/generated.ts）。
import { apiGet } from '@/shared/lib/api';
import { workflowsResponseSchema } from '@/lib/validation/responses';
import type { components } from '@/types/generated';

type WorkflowSummary = components['schemas']['WorkflowSummary'];

export async function listWorkflows(): Promise<WorkflowSummary[]> {
  const res = await apiGet<{ workflows: WorkflowSummary[] }>(
    '/api/workflow',
    workflowsResponseSchema as never,
    'listWorkflows',
  );
  return res.workflows;
}

export type { WorkflowSummary };
