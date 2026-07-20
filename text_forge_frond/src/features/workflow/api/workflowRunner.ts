// src/lib/api/workflowRunner.ts
// 工作流运行引擎：拓扑排序执行 DAG，注入上游产出/RAG 片段，tier 路由，支持暂停/取消。
// 后端就绪后由 POST /api/workflows/:id/run 返回 SSE（前端契约不变，仅此处回退逻辑失效）。
import type { WorkflowNode, WorkflowRunStep, RunWorkflowOptions } from './workflowTypes';
import { BUILTIN_NOVEL_PIPELINE, listWorkflows } from './workflowStorage';
import { lightSummary } from '@/lib/rag/chunk';
import type { RagChunk } from '@/types';
import { BUILTIN_WORKFLOW_ID } from '@/types';

type GenerationContext = import('@/types').GenerationContext;

// 把 GenerationContext 折叠成一段文本（世界观/基调/风格/禁忌/角色/维度/摘要/大纲）。
// 仅作 mock 占位时根节点 user 消息兜底；后端生成器应优先使用透传的 projectContext 对象。
function contextBaseText(ctx: GenerationContext): string {
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

export async function runWorkflow(
  id: string,
  input: string,
  opts?: RunWorkflowOptions,
  projectContext?: GenerationContext,
): Promise<WorkflowRunStep[]> {
  const wf = id === BUILTIN_WORKFLOW_ID
    ? BUILTIN_NOVEL_PIPELINE
    : (await listWorkflows()).find((w) => w.id === id);

  if (!wf) return [];

  const contextBaseTextValue = projectContext ? contextBaseText(projectContext) : '';
  // 拓扑排序（Kahn 算法，正序）：依赖上游先产出，下游后产出。
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  wf.nodes.forEach((n) => {
    indegree.set(n.id, 0);
    dependents.set(n.id, []);
  });
  const addDep = (from: string, to: string) => {
    if (!from || !to || !indegree.has(from) || !indegree.has(to) || from === to) return;
    const exists = wf.edges.some((e) => e.from === from && e.to === to);
    if (exists) return;
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
    dependents.get(from)!.push(to);
  };
  wf.edges.forEach((e) => addDep(e.from, e.to));
  wf.nodes.forEach((n) => (n.dependsOn ?? []).forEach((d) => addDep(d, n.id)));

  const order: string[] = [];
  const queue: string[] = wf.nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
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
  wf.nodes.forEach((n) => { if (!order.includes(n.id)) order.push(n.id); });

  const steps: WorkflowRunStep[] = [];
  const nodeOutputs = new Map<string, string>();
  nodeOutputs.set('__input__', input || (contextBaseTextValue || '（无输入，使用项目上下文）'));
  const poll = opts?.pausePollInterval ?? 200;

  function gatherContext(node: WorkflowNode): string {
    const wfRef = wf!;
    const deps = node.dependsOn ?? [];
    wfRef.edges.forEach((e) => { if (e.to === node.id && !deps.includes(e.from)) deps.push(e.from); });
    const effectiveDeps = deps.filter((d) => nodeOutputs.has(d));
    if (effectiveDeps.length === 0) {
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

  for (const nid of order) {
    if (opts?.isAborted?.()) break;
    if (opts?.shouldPause) {
      let guard = 0;
      while (opts.shouldPause() && !opts.isAborted?.()) {
        await new Promise((r) => setTimeout(r, poll));
        if (++guard > 1800) break;
      }
    }

    const node = wf.nodes.find((n) => n.id === nid)!;
    if (node.kind !== 'agent') continue;

    const ctx = gatherContext(node);
    let toolNote = '';
    const tools = node.toolIds ?? [];
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

    const { agentRoleById } = await import('@/shared/lib/agentRoles');
    const role = (node.roleId && agentRoleById(node.roleId)) || agentRoleById(node.label) || undefined;
    const tier = node.tier ?? role?.tier ?? 'standard';

    // C4/C10/C11: 解析该节点实际采用的语言模型 id（按 tier 取用户 category:llm 默认/便宜模型）。
    // 后端 LangGraph 凭 model_id 查 adapter/baseUrl/apiKey/category，前端不塞密钥。
    // 节点显式绑定 modelId 时优先使用；否则按 tier 解析。
    let modelId: string | undefined;
    try {
      const { useModelStore } = await import('@/features/settings');
      const llmDefault = useModelStore.getState().getDefaultModel('llm');
      const resolved = node.modelId
        ? useModelStore.getState().models.find((m) => m.id === node.modelId)
        : useModelStore.getState().resolveModelByTier('llm', tier);
      modelId = resolved?.id ?? llmDefault?.id;
    } catch { /* 模型库未就绪时留空，后端按自身默认兜底 */ }

    const systemPrompt = node.systemPrompt?.trim()
      ? (role?.defaultPrompt ? `${role.defaultPrompt}\n\n（节点补充）${node.systemPrompt}` : node.systemPrompt)
      : (role?.defaultPrompt ?? '');

    const context = ctx + toolNote;
    const out = opts?.generate
      ? await opts.generate(node, context, tier, ragChunks, systemPrompt, projectContext, modelId)
      : `[${node.label}][${tier === 'cheap' ? '本地/便宜模型' : '默认模型'}${modelId ? ` · ${modelId}` : ''}]\n${context.slice(0, 120)}…（生成结果占位）`;

    steps.push({ nodeId: nid, label: node.label, output: out, status: 'done', systemPrompt });
    opts?.onStep?.(nid, node.label, out, systemPrompt);
    nodeOutputs.set(nid, out);
    if (opts?.simulateDelay) await new Promise((r) => setTimeout(r, 120));
  }
  return steps;
}
