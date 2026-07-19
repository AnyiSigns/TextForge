// src/lib/api/workflow.ts
// 多 Agent 工作流 —— 前端接口层（后端未就绪时走 mock）。
//
// 设计要点（供后端对接）：
// - 工作流 = 有向无环图（DAG）。节点 node.kind 决定角色：
//     'input'  用户输入/项目上下文入口
//     'agent'  LLM 节点（带 modelId + systemPrompt，可挂 toolIds）
//     'tool'   工具调用节点（如 RAG 检索、网络搜索）
//     'output' 汇总输出
// - 节点通过 dependsOn / edges 表达依赖；运行时按拓扑序执行，
//   上游节点的文本输出会注入下游节点的上下文（context 拼接）。
// - 这与你「AI 生成当前章节标题 → 模型会话提炼压缩」完全对应：
//   两个 agent 节点线性串联即可。
//
// 后端契约：
//   GET    /api/workflows
//   POST   /api/workflows
//   GET    /api/workflows/:id
//   PUT    /api/workflows/:id
//   DELETE /api/workflows/:id
//   POST   /api/workflows/:id/run   body: { input: string }  -> SSE 流式返回步骤

import apiClient from './client';
import { getItem, setItem } from '@/lib/storage/indexedDB';
import { BUILTIN_WORKFLOW_ID, type Step, type RagFilter, type RagChunk } from '@/types';
import type { OutlineVolume, OutlineChapter, OutlineNode } from '@/lib/storage/backup';
import { useProjectStore } from '@/lib/stores/projectStore';
import { lightSummary } from '@/lib/rag/chunk';

export type WorkflowNodeKind = 'input' | 'agent' | 'tool' | 'output';

export interface WorkflowNode {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  modelId?: string;          // agent 节点绑定的模型 id（来自模型库）
  systemPrompt?: string;     // agent 节点的角色/系统提示词
  toolIds?: string[];        // agent 节点可调用工具（RAG/搜索/...）
  dependsOn?: string[];      // 依赖的节点 id（等价 edges）
  tier?: 'cheap' | 'standard'; // 模型档位（显式，避免后端按中文 label 反解角色）
  roleId?: string;             // 关联角色预设 id（agentRoles），优先于 label 反查角色
  // RAG 检索配置（仅 rag:personal / rag:both 节点生效）
  ragFilter?: RagFilter;     // 限定范围：文档/作者；sample 覆盖自动 query
  ragTopK?: number;          // 返回片段数（默认 4）
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
  createdAt: string;
  updatedAt: string;
  builtin?: boolean;        // 内置流水线（不可删除，项目默认使用）
}

export interface WorkflowRunStep {
  nodeId: string;
  label: string;
  output: string;
  status: 'running' | 'done' | 'error';
  /** 该节点实际采用的系统提示词（角色预设 + 节点补充合并），作为 system 消息发送 */
  systemPrompt?: string;
}

export interface ListWorkflowsResponse { workflows: Workflow[]; }
export interface WorkflowResponse { workflow: Workflow; }

// ---------- 本地工作流存储（mock 期持久化；后端就绪后由服务端对齐） ----------
// 后端未就绪时，工作流存本地：内存 + IndexedDB（keyval），保证创建/查看/列表不丢。
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
async function withBuiltin(list: Workflow[]): Promise<Workflow[]> {
  // 已含内置（后端返回）则不重复
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
async function tryBackend<T>(fn: () => Promise<T>, fallback: T, isValid?: (v: T) => boolean): Promise<T> {
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
  // 本地先存，保证创建后立即可见（后端未就绪时即持久化）
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

// 运行：后端未就绪时走真实 DAG 拓扑执行（mock 生成，但流程/RAG/路由均真）。
// 后端就绪后由 POST /api/workflows/:id/run 返回 SSE（agent_switch/chunk/step_complete/done），
// 前端契约不变，仅此处回退逻辑失效。
//
// 执行语义：
// - 按拓扑序执行节点；agent 节点的上游输出拼接为上下文。
// - 节点挂了 rag 工具：先调用 ragClient 检索（个人库=端侧向量检索，公共库=后端 pgvector），
//   把命中片段注入该节点上下文，并随生成请求发后端（rag_chunks）。
// - tier 路由：cheap 档（压缩/审校/复盘/总编）标注用本地/便宜模型，standard 用默认，
//   实现"没钱也能跑"——重活不烧云端额度。
export interface RunWorkflowOptions {
  /** 每个 agent 节点产出后实时回调（用于项目页流式注入 steps） */
  onStep?: (nodeId: string, label: string, output: string, systemPrompt?: string) => void;
  /** 项目 id（仅用于日志/后续扩展） */
  projectId?: string;
  /** 节点生成器（可注入真实模型调用；默认本地占位）。
   *  - context（字符串）：上游 fan-in 产出 + 工具/检索片段，作为模型 **user 消息**；
   *  - systemPrompt：角色预设 + 节点补充，作为模型 **system 消息**；
   *  - projectContext：完整 GenerationContext（brief/角色/维度/摘要/大纲），
   *    作为 **设定基座**，后端生成器直接发 LangGraph 子图 state（结构化，不依赖文本反解）。
   *  三者职责分离，互不挤占同一接口字段。 */
  generate?: (
    node: WorkflowNode,
    context: string,
    tier: 'cheap' | 'standard',
    ragChunks?: RagChunk[],
    systemPrompt?: string,
    projectContext?: import('@/types').GenerationContext,
  ) => Promise<string> | string;
  /** 是否在 agent 节点间演示流式延迟（mock 观感） */
  simulateDelay?: boolean;
  /** 暂停信号：返回 true 时，运行在节点之间挂起，直至返回 false（轮询） */
  shouldPause?: () => boolean;
  /** 取消信号：返回 true 时，运行在中止前停止（不产出后续步骤） */
  isAborted?: () => boolean;
  /** 节点之间轮询暂停/取消的间隔（毫秒），默认 200 */
  pausePollInterval?: number;
}

export async function runWorkflow(
  id: string,
  input: string,
  opts?: RunWorkflowOptions,
  projectContext?: import('@/types').GenerationContext,
): Promise<WorkflowRunStep[]> {
  const wf = id === BUILTIN_WORKFLOW_ID
    ? BUILTIN_NOVEL_PIPELINE
    : (await loadLocalWorkflows()).find((w) => w.id === id);
  if (!wf) return [];

  // 结构化的项目设定基座（唯一真相来源）：brief/角色/维度/摘要/大纲。
  // 两路派生，互不挤占：
  //  - contextBaseText：从 projectContext 折叠的文本，仅作 mock 占位时根节点的 user 消息兜底，
  //    让预览模式作者也能看见"设定被读到"；后端模式下生成器应优先使用下方透传的 projectContext 对象。
  //  - generate(..., projectContext)：后端生成器直接拿原样对象发 LangGraph 子图 state。
  const contextBaseTextValue = projectContext ? contextBaseText(projectContext) : '';
  // 拓扑排序（Kahn 算法，正序）：依赖上游先产出，下游后产出。
  // 并列（无依赖）节点按 wf.nodes 定义顺序入队，保证内置流水线产出顺序稳定。
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  wf.nodes.forEach((n) => {
    indegree.set(n.id, 0);
    dependents.set(n.id, []);
  });
  const addDep = (from: string, to: string) => {
    if (!from || !to || !indegree.has(from) || !indegree.has(to) || from === to) return;
    // 去重边，避免重复计数
    const exists = wf.edges.some((e) => e.from === from && e.to === to);
    if (exists) return;
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
    dependents.get(from)!.push(to);
  };
  wf.edges.forEach((e) => addDep(e.from, e.to));
  // dependsOn 与 edges 互补：把节点声明的依赖也纳入拓扑
  wf.nodes.forEach((n) => (n.dependsOn ?? []).forEach((d) => addDep(d, n.id)));

  const order: string[] = [];
  const queue: string[] = wf.nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  // 用节点定义顺序维持并列节点入队次序
  while (queue.length) {
    const nid = queue.shift()!;
    order.push(nid);
    const nexts = dependents.get(nid) ?? [];
    for (const nx of nexts) {
      const left = (indegree.get(nx) ?? 0) - 1;
      indegree.set(nx, left);
      if (left === 0) queue.push(nx);
    }
  }
  // 兜底：环或漏网节点按定义顺序补上，保证全部 node 都执行
  wf.nodes.forEach((n) => { if (!order.includes(n.id)) order.push(n.id); });

  const steps: WorkflowRunStep[] = [];
  // 各节点产出按 id 落库：图级 state 汇聚，供下游 fan-in 拼接。
  // 不再用单一 ctx 覆盖式传递，避免 writer 的 4 路 dependsOn 只拿到最后一跳。
  const nodeOutputs = new Map<string, string>();
  // 入口 input 视为虚拟 input 节点产出，可被 dependsOn 引用（演示工作流 n1→n2）。
  // 无输入时退化为 mock 占位的设定基座文本（后端模式下此分支仅占位，生成器读 projectContext 对象）。
  nodeOutputs.set('__input__', input || (contextBaseTextValue || '（无输入，使用项目上下文）'));
  const poll = opts?.pausePollInterval ?? 200;

  // 汇聚上游输出：节点 dependsOn（含 edges 互补）指向的节点产出拼接为上下文。
  // 无依赖的节点回退为 input；多上游按定义顺序拼接，每路带上游标签便于模型区分。
  function gatherContext(node: WorkflowNode): string {
    const wfRef = wf!;
    const deps = node.dependsOn ?? [];
    // edges 互补：把 to===node.id 的 from 也纳入依赖
    wfRef.edges.forEach((e) => { if (e.to === node.id && !deps.includes(e.from)) deps.push(e.from); });
    const effectiveDeps = deps.filter((d) => nodeOutputs.has(d));
    if (effectiveDeps.length === 0) {
      // 根节点（无上游）：在其上下文前注入项目设定基座，保证与作者设定自洽
      const base = nodeOutputs.get('__input__')!;
      return contextBaseTextValue ? `${contextBaseTextValue}\n\n${base}` : base;
    }
    return effectiveDeps
      .map((d) => {
        const src = wfRef.nodes.find((n) => n.id === d);
        const label = src?.label ?? d;
        return `【上游·${label}】\n${nodeOutputs.get(d)}`;
      })
      .join('\n\n');
  }

  // 把 GenerationContext 折叠成一段文本（世界观/基调/风格/禁忌/角色/维度/摘要/大纲）。
  // 仅作 mock 占位时根节点 user 消息兜底；后端生成器应优先使用透传的 projectContext 对象。
  // 仅在有内容时返回非空字符串；空则上游回退逻辑退化为纯 input（保持旧行为）。
  function contextBaseText(ctx: import('@/types').GenerationContext): string {
    const parts: string[] = [];
    if (ctx.project_title) parts.push(`作品：《${ctx.project_title}》`);
    if (ctx.brief) parts.push(ctx.brief);
    if (ctx.plot_summary) parts.push(`【前文剧情摘要】\n${ctx.plot_summary}`);
    if (ctx.characters?.length) {
      const c = ctx.characters
        .map((x) => {
          const role = x.role ? `｜定位：${x.role}` : '';
          const rel = x.relationships?.length
            ? `｜关系：${x.relationships.map((r) => `${r.target}（${r.relation}）`).join('、')}`
            : '';
          return `- ${x.name}（${x.status}）：${x.description}${role}${x.currentProfile ? `｜当前：${x.currentProfile}` : ''}${rel}${x.change ? `｜本章变化：${x.change}` : ''}`;
        })
        .join('\n');
      parts.push(`【本章出场角色】\n${c}`);
    }
    if (ctx.sections?.length) {
      const s = ctx.sections.map((x) => `- ${x.title}：${x.content}`).join('\n');
      parts.push(`【相关设定维度】\n${s}`);
    }
    // 大纲骨架：优先用结构化树（更精确），回退到文本 outline（mock 兼容）
    const outlineText = ctx.outlineTree?.length
      ? ctx.outlineTree
          .map((vol) =>
            vol.chapters
              .map((ch) =>
                ch.nodes
                  .map((n) => `· ${vol.title}/${ch.title}：${n.title}${n.content ? `（${n.content}）` : ''}`)
                  .join('\n'),
              )
              .join('\n'),
          )
          .join('\n')
      : ctx.outline;
    if (outlineText) parts.push(`【大纲骨架】\n${outlineText}`);
    return parts.length ? `【项目设定基座】\n${parts.join('\n')}` : '';
  }

  for (const nid of order) {
    // 取消：立即停止（已产出的步骤会作为部分结果返回）
    if (opts?.isAborted?.()) break;
    // 暂停：在节点之间挂起，直到 shouldPause 返回 false
    if (opts?.shouldPause) {
      let guard = 0;
      while (opts.shouldPause() && !opts.isAborted?.()) {
        await new Promise((r) => setTimeout(r, poll));
        if (++guard > 1800) break; // 安全上限 ~6 分钟，避免永久挂起
      }
    }

    const node = wf.nodes.find((n) => n.id === nid)!;
    if (node.kind !== 'agent') continue; // 仅 agent 节点产生步骤

    // 该节点的汇聚上下文：来自全部 dependsOn 上游产出（fan-in）
    const ctx = gatherContext(node);

    // 工具注入：rag 检索（节点级作用域），web 由后端 agent 自主调度
    let toolNote = '';
    const tools = node.toolIds ?? [];
    // 自动搜 query：节点名 + 上游输出轻量摘要（零成本、不依赖模型）
    const autoQuery = `${node.label}：${lightSummary(ctx, 120)}`;
    const ragChunks: RagChunk[] = [];
    const hasRag = tools.some((t) => t.startsWith('rag'));
    if (node.kind === 'agent' && hasRag) {
      try {
        const { ragClient } = await import('@/lib/knowledge');
        if (tools.includes('rag:personal') || tools.includes('rag:both')) {
          const topK = node.ragTopK ?? 4;
          const chunks = await ragClient.search(autoQuery, 'personal', topK, node.ragFilter);
          if (chunks.length) {
            ragChunks.push(...chunks);
            toolNote += '\n[RAG·个人库检索片段]\n' + chunks.map((c) => `- 《${c.docName}》${c.text}`).join('\n');
          }
        }
        if (tools.includes('rag:public') || tools.includes('rag:both')) {
          const q = node.ragFilter?.sample ?? autoQuery;
          const chunks = await ragClient.search(q, 'public', node.ragTopK ?? 4);
          if (chunks.length) {
            ragChunks.push(...chunks);
            toolNote += '\n[RAG·公共库检索片段]\n' + chunks.map((c) => `- 《${c.docName}》${c.text}`).join('\n');
          }
        }
      } catch { /* 检索失败忽略，继续生成 */ }
    }
    if (tools.includes('web')) toolNote += '\n[web检索由后端 agent 自主调用]';

    // tier 路由：优先用节点显式 tier（稳定，后端无需反解中文 label），
    // 缺失时回退到角色预设映射（仅前端 mock 占位用）。
    const { agentRoleById } = await import('@/lib/workflow/agentRoles');
    // 角色查询优先 node.roleId，其次 node.label（中文 short/name），再回退。
    const role = (node.roleId && agentRoleById(node.roleId)) || agentRoleById(node.label) || undefined;
    const tier = node.tier ?? role?.tier ?? 'standard';

    // 系统提示词：角色预设 defaultPrompt 为基底，节点 systemPrompt 覆盖/补充。
    // 该值作为模型的 system 消息发送，不进入 user 上下文（context）。
    const systemPrompt = node.systemPrompt?.trim()
      ? (role?.defaultPrompt ? `${role.defaultPrompt}\n\n（节点补充）${node.systemPrompt}` : node.systemPrompt)
      : (role?.defaultPrompt ?? '');

    const context = ctx + toolNote;
    const out = opts?.generate
      ? await opts.generate(node, context, tier, ragChunks, systemPrompt, projectContext)
      : `[${node.label}][${tier === 'cheap' ? '本地/便宜模型' : '默认模型'}]\n${context.slice(0, 120)}…（生成结果占位）`;

    steps.push({ nodeId: nid, label: node.label, output: out, status: 'done', systemPrompt });
    opts?.onStep?.(nid, node.label, out, systemPrompt);
    nodeOutputs.set(nid, out); // 落库供下游 fan-in；不再覆盖单一 ctx
    if (opts?.simulateDelay) await new Promise((r) => setTimeout(r, 120));
  }
  return steps;
}

// 把 DAG 运行结果转为项目 steps：仅 agent 节点生成步骤；
// writer 节点（写作）标记为待确认正文（waiting），其余 completed。
// outline 节点的章节结构作为「大纲步」并入引导，保证运行/写入项目时
// 既覆盖工作流环节，也覆盖作品大纲骨架。
export function workflowToSteps(runs: WorkflowRunStep[], outline?: OutlineVolume[]): Step[] {
  const writerIdx = runs.findIndex((r) => r.label === '写作' || r.nodeId === 'writer');
  const flowSteps: Step[] = runs.map((r, i) => ({
    id: `step-${r.nodeId}-${Date.now()}-${i}`,
    agent: r.nodeId,
    agentName: r.label,
    content: r.output,
    status: i === writerIdx ? ('waiting' as const) : ('completed' as const),
    nodeId: r.nodeId,
  }));

  if (!outline || outline.length === 0) return flowSteps;

  const outlineSteps: Step[] = outline.flatMap((vol: OutlineVolume) =>
    vol.chapters.flatMap((ch: OutlineChapter) =>
      ch.nodes.map((n: OutlineNode) => ({
        id: `outline-${n.id}-${Date.now()}`,
        agent: 'outline',
        agentName: `大纲 · ${vol.title} / ${ch.title}`,
        content: n.content || n.title,
        status: 'pending' as const,
        nodeId: n.id,
      })),
    ),
  );

  return [...flowSteps, ...outlineSteps];
}

// 统计某工作流被多少项目绑定（供工作流列表"已应用到 N 个项目"展示）
export function countWorkflowUsages(workflowId: string): number {
  try {
    const projects = useProjectStore.getState().projects;
    return projects.filter((p) => (p.workflowId ?? BUILTIN_WORKFLOW_ID) === workflowId).length;
  } catch {
    return 0;
  }
}
