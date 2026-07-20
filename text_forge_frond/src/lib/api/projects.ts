// src/lib/api/projects.ts
// 项目域 API（契约层对接 openapi/seed-api.yaml -> src/types/generated.ts）。
// - 类型级：请求/响应形状用 generated.ts 的 type 约束，保证与后端契约一致。
// - 运行时：经 shared/lib/api.ts 的 apiGet/apiPost/... + lib/validation/responses.ts 的 zod 校验，
//   防脏数据白屏；401 刷新、重试、幂等、token 由统一 apiClient 全链路处理。
// 仅暴露契约内已声明的端点；角色域归属顶层 /characters，见 characters.ts。
import { apiDelete, apiGet, apiPost, apiPut } from '@/shared/lib/api';
import {
  projectListResponseSchema,
  projectResponseSchema,
  stepsResponseSchema,
} from '@/lib/validation/responses';
import type { components, paths } from '@/types/generated';

type Project = components['schemas']['Project'];
type ProjectListResponse = components['schemas']['ProjectListResponse'];
type ProjectResponse = components['schemas']['ProjectResponse'];
type CreateProjectRequest = components['schemas']['CreateProjectRequest'];
type Step = components['schemas']['Step'];
type StepsResponse = components['schemas']['StepsResponse'];

type ListProjectsQuery = paths['/projects']['get']['parameters']['query'];

export async function listProjects(
  query?: ListProjectsQuery,
): Promise<ProjectListResponse> {
  return apiGet<ProjectListResponse>(
    '/api/projects',
    projectListResponseSchema as never,
    'listProjects',
    query ? { params: query } : undefined,
  );
}

export async function getProject(id: string): Promise<ProjectResponse> {
  return apiGet<ProjectResponse>(`/api/projects/${id}`, projectResponseSchema as never, 'getProject');
}

export async function createProject(
  body: CreateProjectRequest,
): Promise<ProjectResponse> {
  return apiPost<ProjectResponse>(
    '/api/projects',
    projectResponseSchema as never,
    'createProject',
    body,
  );
}

export async function updateProject(
  id: string,
  body: Partial<CreateProjectRequest>,
): Promise<ProjectResponse> {
  return apiPut<ProjectResponse>(
    `/api/projects/${id}`,
    projectResponseSchema as never,
    'updateProject',
    body,
  );
}

export async function deleteProject(id: string): Promise<void> {
  await apiDelete<unknown>(`/api/projects/${id}`, undefined as never, 'deleteProject');
}

export async function confirmProject(id: string): Promise<ProjectResponse> {
  return apiPost<ProjectResponse>(
    `/api/projects/${id}/confirm`,
    projectResponseSchema as never,
    'confirmProject',
    {},
  );
}

export async function generateProject(id: string): Promise<ProjectResponse> {
  return apiPost<ProjectResponse>(
    `/api/projects/${id}/generate`,
    projectResponseSchema as never,
    'generateProject',
    {},
  );
}

export async function listSteps(projectId: string): Promise<StepsResponse> {
  return apiGet<StepsResponse>(
    `/api/projects/${projectId}/steps`,
    stepsResponseSchema as never,
    'listSteps',
  );
}

export async function updateStep(
  projectId: string,
  stepId: string,
  body: Partial<Step>,
): Promise<Step> {
  return apiPut<Step>(
    `/api/projects/${projectId}/steps/${stepId}`,
    undefined as never,
    'updateStep',
    body,
  );
}

export type { Project, Step };
