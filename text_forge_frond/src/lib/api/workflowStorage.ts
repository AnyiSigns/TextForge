// src/lib/api/workflowStorage.ts
// 本地工作流存储（mock 期持久化；后端就绪后由服务端对齐）与示例/内置流水线定义。
import apiClient from './client';
import { getItem, setItem } from '@/lib/storage/indexedDB';
import { BUILTIN_WORKFLOW_ID } from '@/types';
import type { Workflow, ListWorkflowsResponse, WorkflowResponse } from './workflowTypes';

// 演示工作流：节点 node.kind 决定角色，两条 agent 节点线性串联。
const DEMO_WORKFLOW: Workflow = {
  id: 'wf-demo-1',
  name: '章节生成与提炼',
  description: '生成当前章节标题 → 模型会话提炼压缩',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  nodes: [
    { id: 'n1', kind: 'input', label: '项目上下文' },
    { id: 'n2', kind: 'agent', label: '生成章节标题', modelId: '', systemPrompt: '根据项目设定，生成本章标题与大纲要点。' },
    { id: 'n3', kind: 'agent', label: '提炼压缩', modelId: '', systemPrompt: '将上文提炼为紧凑的写作提要，保留关键情节。', dependsOn: ['n2'] },
    { id: 'n4', kind: 'output', label: '输出', dependsOn: ['n3'] },
  ],
  edges: [
    { from: 'n1', to: 'n2' },
    { from: 'n2', to: 'n3' },
    { from: 'n3', to: 'n4' },
  ],
};

// 内置创作流水线：项目默认使用的 7-Agent 生成流程，对应原 WorkflowGraph.AGENTS。
// 节点 id 与 WorkflowGraph 的 agent id 对齐，writer 节点产出可确认正文。
export const BUILTIN_NOVEL_PIPELINE: Workflow = {
  id: BUILTIN_WORKFLOW_ID,
  name: '内置创作流水线',
  description: '策划 → 世界观 → 角色 → 大纲 → 写作 → 审校 → 总编（默认流程）',
  createdAt: '1970-01-01T00:00:00.000Z',
  updatedAt: '1970-01-01T00:00:00.000Z',
  builtin: true,
  nodes: [
    { id: 'planner',   kind: 'agent', label: '策划', roleId: 'planner',   tier: 'standard', systemPrompt: '你是小说策划，输出核心创意与悬念。' },
    { id: 'world',     kind: 'agent', label: '世界观', roleId: 'worldbuilder', tier: 'standard', systemPrompt: '你是世界构建师，补充本章用得上的世界观设定。' },
    { id: 'character', kind: 'agent', label: '角色', roleId: 'character_designer', tier: 'standard', systemPrompt: '你是角色设计师，输出本章出场角色要点。' },
    { id: 'outline',   kind: 'agent', label: '大纲', roleId: 'architect', tier: 'standard', systemPrompt: '你是架构师，输出本章结构节拍。' },
    { id: 'writer',    kind: 'agent', label: '写作', roleId: 'writer', tier: 'standard', systemPrompt: '你是主笔写手，基于上游要点写本章正文。', dependsOn: ['planner', 'world', 'character', 'outline'] },
    { id: 'reviewer',  kind: 'agent', label: '审校', roleId: 'auditor', tier: 'cheap', systemPrompt: '你是审校，列出硬伤与一致性问题。', dependsOn: ['writer'] },
    { id: 'editor',    kind: 'agent', label: '总编', roleId: 'producer', tier: 'cheap', systemPrompt: '你是总编，做最终把关与收口。', dependsOn: ['reviewer'] },
  ],
  edges: [
    { from: 'planner', to: 'writer' },
    { from: 'world', to: 'writer' },
    { from: 'character', to: 'writer' },
    { from: 'outline', to: 'writer' },
    { from: 'writer', to: 'reviewer' },
    { from: 'reviewer', to: 'editor' },
  ],
};

// 把内置流水线拼到列表最前（mock 期）；后端期由服务端返回，前端不拼接。
export async function withBuiltin(list: Workflow[]): Promise<Workflow[]> {
  if (list.some((w) => w.id === BUILTIN_WORKFLOW_ID)) return list;
  return [BUILTIN_NOVEL_PIPELINE, ...list];
}

let localWorkflows: Workflow[] | null = null;

async function loadLocalWorkflows(): Promise<Workflow[]> {
  if (localWorkflows) return localWorkflows;
  const saved = await getItem<Workflow[]>('local-workflows');
  localWorkflows = saved && saved.length ? saved : [DEMO_WORKFLOW];
  return localWorkflows;
}

async function persistLocalWorkflows(list: Workflow[]) {
  localWorkflows = list;
  await setItem('local-workflows', list);
}

// 后端探测：先试真实接口；失败 / 返回 mocked（开发期 mock 占位）则回退本地
export async function tryBackend<T>(fn: () => Promise<T>, fallback: T, isValid?: (v: T) => boolean): Promise<T> {
  try {
    const v = await fn();
    if (v && typeof v === 'object' && (v as { mocked?: boolean }).mocked) return fallback;
    if (isValid && !isValid(v)) return fallback;
    return v;
  } catch {
    return fallback;
  }
}

export async function listWorkflows(): Promise<Workflow[]> {
  try {
    const { data } = await apiClient.get<ListWorkflowsResponse>('/api/workflows');
    if (data && (data as { mocked?: boolean }).mocked) throw new Error('mocked');
    return Array.isArray(data.workflows) ? data.workflows : await loadLocalWorkflows();
  } catch {
    return loadLocalWorkflows();
  }
}

export async function listWorkflowsWithBuiltin(): Promise<Workflow[]> {
  const list = await listWorkflows();
  return withBuiltin(list);
}

export async function getWorkflow(id: string): Promise<Workflow | undefined> {
  if (id === BUILTIN_WORKFLOW_ID) return BUILTIN_NOVEL_PIPELINE;
  const local = (await loadLocalWorkflows()).find((w) => w.id === id);
  return tryBackend(
    async () => {
      const { data } = await apiClient.get<WorkflowResponse>(`/api/workflows/${id}`);
      return data.workflow;
    },
    local,
    (v) => !!v,
  );
}

export async function saveWorkflow(wf: Workflow): Promise<Workflow> {
  const list = await loadLocalWorkflows();
  const next = list.some((w) => w.id === wf.id)
    ? list.map((w) => (w.id === wf.id ? wf : w))
    : [...list, wf];
  await persistLocalWorkflows(next);

  return tryBackend(
    async () => {
      if (next.some((x) => x.id === wf.id)) {
        return (await apiClient.put<WorkflowResponse>(`/api/workflows/${wf.id}`, wf)).data.workflow;
      }
      return (await apiClient.post<WorkflowResponse>('/api/workflows', wf)).data.workflow;
    },
    { ...wf, updatedAt: new Date().toISOString() },
    (v) => !!v,
  );
}

export async function deleteWorkflow(id: string): Promise<void> {
  const list = await loadLocalWorkflows();
  await persistLocalWorkflows(list.filter((w) => w.id !== id));
  await tryBackend(() => apiClient.delete(`/api/workflows/${id}`), undefined);
}
