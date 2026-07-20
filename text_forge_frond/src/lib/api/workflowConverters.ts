// src/lib/api/workflowConverters.ts
// 把工作流运行结果 / 本地状态转为项目步骤与统计。
import type { WorkflowRunStep } from './workflowTypes';
import type { Step } from '@/types';
import { BUILTIN_WORKFLOW_ID } from '@/types';
import type { OutlineVolume, OutlineChapter, OutlineNode } from '@/lib/storage/backup';
import { useProjectStore } from '@/lib/stores/projectStore';

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
