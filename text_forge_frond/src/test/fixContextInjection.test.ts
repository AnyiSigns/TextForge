// 验证修复 #1（设定/角色/大纲注入生成上下文）与 #2 的上下文基座逻辑。
// 直接调用 runWorkflow，传入结构化 GenerationContext，断言：
//  1) 根节点(planner)的 user 上下文含「项目设定基座」及角色/世界观；
//  2) generate 第 6 参数 projectContext 被透传（对 LangGraph 后端友好）；
//  3) 下游 writer 经 fan-in 继承全部上游产出。
import { describe, it, expect, beforeAll } from 'vitest';
import { runWorkflow, type WorkflowNode } from '@/lib/api/workflow';
import type { GenerationContext } from '@/types';

beforeAll(() => {
  if (typeof (globalThis as { indexedDB?: unknown }).indexedDB === 'undefined') {
    const store = new Map<string, Map<string, unknown>>();
    const makeTx = () => ({
      objectStore: () => ({
        get: (k: string) => Promise.resolve(store.get('kv')?.get(k) ?? undefined),
        put: (k: string, v: unknown) => {
          if (!store.has('kv')) store.set('kv', new Map());
          store.get('kv')!.set(k, v);
          return Promise.resolve();
        },
        getAll: () => Promise.resolve([...(store.get('kv')?.values() ?? [])]),
      }),
    });
    (globalThis as { indexedDB?: unknown }).indexedDB = {
      open: () => ({ onupgradeneeded: null, result: { transaction: makeTx, objectStoreNames: { contains: () => true } } }),
    };
  }
});

const ctx: GenerationContext = {
  project_id: 'p1',
  project_title: '星海拾遗验证',
  brief: '类型：科幻；世界观：一艘游离于星海之间的拾荒船，载着最后的文明碎片；基调：苍凉而温柔；风格：诗化白描；禁忌：避免硬科幻术语堆砌',
  plot_summary: '前文无，本章为开篇',
  characters: [
    { name: '林墨', description: '沉默的拾荒者，习惯用诗记录星海', currentProfile: '刚失去同伴苏霓', status: '存活' },
    { name: '苏霓', description: '前领航员，已逝', currentProfile: '留下半本未写完的星图', status: '已故' },
  ],
  sections: [{ title: '核心矛盾', content: '文明的记忆正在随星海漂流消散' }],
  outline: '第一卷/第一章·拾遗：林墨在残骸带发现一枚会发光的记忆晶核',
};

describe('修复#1：结构化设定注入生成上下文', () => {
  it('根节点拿到项目设定基座，且 projectContext 透传给 generate', async () => {
    const captured: { nodeId: string; context: string; projectContext?: GenerationContext }[] = [];
    let sawProjectContext = false;

    await runWorkflow(
      'builtin-novel-pipeline',
      '', // input 为空，应退化为设定基座
      {
        generate: (node: WorkflowNode, context: string, _tier, _rag, _sys, projectContext) => {
          captured.push({ nodeId: node.id, context, projectContext });
          if (projectContext && projectContext.project_title === '星海拾遗验证') sawProjectContext = true;
          return `[${node.label}] 产出`;
        },
      },
      ctx, // 结构化 GenerationContext（修复点）
    );

    // 1) 根节点(planner)应含「项目设定基座」与角色/世界观
    const planner = captured.find((c) => c.nodeId === 'planner')!;
    expect(planner.context).toContain('【项目设定基座】');
    expect(planner.context).toContain('林墨');
    expect(planner.context).toContain('苏霓');
    expect(planner.context).toContain('记忆晶核'); // 来自 outline
    expect(planner.context).toContain('核心矛盾'); // 来自 sections

    // 2) projectContext 透传（对 LangGraph 后端友好）
    expect(sawProjectContext, 'projectContext 应透传给 generate 第6参数').toBeTruthy();

    // 3) writer 经 fan-in 继承 4 路上游
    const writer = captured.find((c) => c.nodeId === 'writer')!;
    expect(writer.context).toContain('【上游·策划】');
    expect(writer.context).toContain('【上游·世界观】');
    expect(writer.context).toContain('【上游·角色】');
    expect(writer.context).toContain('【上游·大纲】');
  });
});
