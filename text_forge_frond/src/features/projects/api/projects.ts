import { Project, Step, CreateProjectRequest, BUILTIN_WORKFLOW_ID, type GenerationContext } from '@/types';
import apiClient from '@/shared/lib/apiClient';
import { getWorkflow, runWorkflow, workflowToSteps, type RunWorkflowOptions, type WorkflowRunStep } from '@/lib/api/workflow';

export interface CreateProjectResponse extends Project {
  version?: number;
}

export interface ProjectListResponse {
  projects: Project[];
}

export interface ProjectResponse {
  project: Project;
}

export interface StepsResponse {
  steps: Step[];
}

export interface CharactersResponse {
  characters?: { id: string; name: string; description: string }[];
}

export async function fetchProjects(): Promise<Project[]> {
  const { data } = await apiClient.get<ProjectListResponse>('/api/projects');
  return data.projects || [];
}

export async function createProject(body: CreateProjectRequest, version?: number): Promise<CreateProjectResponse> {
  const config = version ? { headers: { 'If-Match': String(version) } } : undefined;
  const { data } = await apiClient.post<ProjectResponse>('/api/projects', body, config);
  return { ...data.project, version };
}

export async function deleteProject(id: string, version?: number): Promise<void> {
  await apiClient.delete(`/api/projects/${id}`, version ? { headers: { 'If-Match': String(version) } } : undefined);
}

export interface ProjectDetail {
  project: Project;
  steps: Step[];
  characters?: { id: string; name: string; description: string }[];
}

export async function fetchProjectDetail(id: string): Promise<Step[]> {
  const { data } = await apiClient.get(`/api/projects/${id}`);
  return data.steps || [];
}

export async function fetchProjectMeta(id: string): Promise<ProjectDetail['project']> {
  const { data } = await apiClient.get(`/api/projects/${id}`);
  return data.project || { id, title: '', status: 'draft', createdAt: '', updatedAt: '' };
}

export async function fetchProjectCharacters(id: string): Promise<NonNullable<ProjectDetail['characters']>> {
  const { data } = await apiClient.get(`/api/projects/${id}/characters`);
  return data.characters || [];
}

export async function confirmStep(projectId: string, stepId: string): Promise<void> {
  await apiClient.post(`/api/projects/${projectId}/confirm`, { step_id: stepId });
}

export async function saveStepEdit(projectId: string, stepId: string, content: string): Promise<void> {
  await apiClient.put(`/api/projects/${projectId}/steps/${stepId}`, { content });
}

/** 把项目绑定到某条创作流水线（工作流 id；省略则回退内置流水线） */
export async function bindWorkflow(projectId: string, workflowId: string = BUILTIN_WORKFLOW_ID): Promise<void> {
  // 后端未就绪时静默成功（本地 store 已维护 workflowId）
  await apiClient.put(`/api/projects/${projectId}`, { workflowId }).catch(() => {});
}

export interface GenerateOptions {
  workflowId?: string;
  context?: GenerationContext;
  /** 本地 DAG 生成的每步回调（mock 期流式注入 steps）。
   *  回调的 Step 已带 nodeId，调用方应以 nodeId 作为合并键（而非中文 agent 名），
   *  避免多节点重名导致重复 append，也避免 writer 步骤被错标。 */
  onStep?: (step: Step) => void;
  /** 真实模型生成器（可选）；不传则用本地占位。
   *  后端就绪时传入的 generate 应消费 (node, context, tier, ragChunks, systemPrompt, projectContext)，
   *  其中 projectContext 为完整 GenerationContext（brief/角色/维度/摘要/大纲），直接发 LangGraph 子图。 */
  runOpts?: RunWorkflowOptions;
  /** 暂停信号：返回 true 时运行在节点间挂起（透传给 DAG） */
  shouldPause?: () => boolean;
  /** 取消信号：返回 true 时中止生成（透传给 DAG） */
  isAborted?: () => boolean;
}

// 项目生成：统一入口。
// - 后端就绪期：走 SSE POST /api/projects/:id/generate（带 workflowId），由调用方解析。
// - 后端未就绪（mock 期）：本地跑所选工作流 DAG，实时把每个 agent 节点转成 Step 注入。
// 返回生成的 steps（writer 节点为 waiting 待确认正文）。
//
// 对后端友好：完整 GenerationContext（brief/角色/维度/摘要/大纲）原样下传：
//  - runWorkflow 折叠为「项目设定基座」文本注入根节点（mock 占位可见）；
//  - 同时把 context 透传给 generate(node, context, tier, ragChunks, systemPrompt, projectContext)，
//    后端生成器可直接用结构化字段发 LangGraph 子图，无需反解文本。
export async function generateWithWorkflow(
  projectId: string,
  { workflowId = BUILTIN_WORKFLOW_ID, context, onStep, runOpts, shouldPause, isAborted }: GenerateOptions,
): Promise<Step[]> {
  const wf = await getWorkflow(workflowId);
  if (!wf) return [];

  // 流式回调：DAG 每产出一个 agent 节点，转成带 nodeId 的 Step 即时上抛。
  // 双路通知，职责分离：
  //  - onStep（业务层）：本项目工作台用于增量渲染；
  //  - runOpts.onStep（底层 DAG 运行时）：节点级日志/埋点，与业务解耦。
  const streamStep: NonNullable<RunWorkflowOptions['onStep']> = (nodeId, label, output, systemPrompt) => {
    const step = runStepToStreamStep({ nodeId, label, output, status: 'done', systemPrompt });
    if (step) onStep?.(step);
    runOpts?.onStep?.(nodeId, label, output, systemPrompt);
  };

  // 1) 跑 DAG（含设定基座注入 + 结构化 projectContext 透传）
  const runs = await runWorkflow(
    workflowId,
    context?.outline ?? '',
    { projectId, ...runOpts, shouldPause, isAborted, onStep: streamStep },
    context,
  );
  // 2) 定稿：workflowToSteps 统一处理 writer=waiting 等最终状态
  return workflowToSteps(runs);
}

// 单次运行结果 → 流式 Step（纯函数，无副作用）。
// 携带 nodeId 作为合并键；流式阶段 writer 暂标 completed，
// 最终定稿由 workflowToSteps 校正为 waiting（调用方按 nodeId 覆盖，不会降级）。
function runStepToStreamStep(run: WorkflowRunStep): Step | null {
  if (!run.nodeId) return null;
  return {
    id: `step-${run.nodeId}-${Date.now()}`,
    agent: run.nodeId,
    agentName: run.label,
    content: run.output,
    status: 'completed',
    nodeId: run.nodeId,
  };
}

/** 把一段正文转为工作台 step（手稿 → 工作台 互导）。
 *  仅负责构造 step，草稿落库由调用方负责（API 层不耦合 store）。 */
export async function importManuscriptToProject(projectId: string, title: string, content: string): Promise<Step> {
  return {
    id: `step-manuscript-${Date.now()}`,
    agent: 'writer',
    content: `# ${title}\n\n${content}`,
    status: 'completed',
  };
}

// 把整本书（已拆好的章节）转为工作台 steps（completed），
// 让工作台「续写下一章」能把这些已导入章节当作上下文注入 Agent 流。
// 仅负责构造 steps，草稿落库由调用方负责（API 层不耦合 store）。
export async function importBookToProject(
  projectId: string,
  chapters: { title: string; content: string }[],
): Promise<Step[]> {
  return chapters.map((c, i) => ({
    id: `step-book-${Date.now()}-${i}`,
    agent: 'writer',
    content: `# ${c.title}\n\n${c.content}`,
    status: 'completed',
  }));
}
