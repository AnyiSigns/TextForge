// 模拟脚本：用真实 runWorkflow 内置创作流水线跑一遍小说生成，
// 验证大纲 / 维度创作设定（brief sections）/ 角色 的上下文拼接样式。
// 运行：npm run test -- src/test/simulateNovelGeneration.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runWorkflow, type WorkflowNode } from '@/lib/api/workflow';
import { type RagChunk } from '@/types';
import { AGENT_ROLE_MAP } from '@/lib/workflow/agentRoles';

// jsdom 不实现 indexedDB；内置流水线本不依赖它，但为兼容兜底分支，
// 注入一个极简内存 stub，保证测试环境可跑通。
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
      open: () => ({
        onupgradeneeded: null,
        result: { transaction: makeTx, objectStoreNames: { contains: () => true } },
      }),
    };
  }
});

// ---- 模拟一个完整小说项目的「章节级注入上下文」（对应项目页 buildContext 产出）----
const PROJECT_INPUT = `项目标题：星海拾遗
类型：科幻；世界观：一艘游离于星海之间的拾荒船，载着最后的文明碎片；基调：苍凉而温柔；风格：诗化白描；禁忌：避免硬科幻术语堆砌
【维度创作设定·核心矛盾】文明的记忆正在随星海漂流消散，拾荒者必须在遗忘前打捞
【维度创作设定·叙事视角】第三人称限知，跟随林墨的拾荒日志
【角色·林墨】沉默的拾荒者，习惯用诗记录星海；currentProfile：刚失去同伴苏霓，独自驾驶拾荒船「渡尘」；状态：存活
【角色·苏霓】前领航员，已逝；currentProfile：留下半本未写完的星图；状态：已故
【大纲·第一卷/第一章·拾遗】节点：林墨在残骸带发现一枚会发光的记忆晶核，触发生前与苏霓的对话残响
【剧情摘要】前文无，本章为开篇`;

// 每个节点拟真产出（仅用于演示上下文如何向下游汇聚）
function fakeGenerate(node: WorkflowNode, context: string, _tier: 'cheap' | 'standard', _rag?: RagChunk[], _sys?: string): string {
  switch (node.id) {
    case 'planner':
      return '核心创意：用「记忆晶核」串联逝者与生者的对话。目标读者：软科幻爱好者。钩子：晶核里传来已故同伴的声音。悬念：晶核是谁留下的？记忆为何在消散？';
    case 'world':
      return '本章用得上的设定：拾荒船「渡尘」的日志舱；星海残骸带的引力潮汐会让记忆晶核共振。与已有世界观一致，不引入新势力。';
    case 'character':
      return '出场角色要点——林墨：动机是打捞文明记忆、与亡者告别；处境：独驾渡尘、刚触到晶核；与苏霓的关系张力：晶核残响让他重陷失去之苦。';
    case 'outline':
      return '三幕节拍：①残骸带拾得晶核（钩子）②晶核共振，苏霓残响浮现（转折）③林墨决定带着记忆继续漂流（收束）。不写正文。';
    case 'writer':
      return '林墨的手指刚触到晶核，舱内便亮起幽蓝的光。那声音他认得——是苏霓，隔着生死，在星海里最后一次念他的名字。他闭上眼，任残骸带的引力潮把船轻轻摇晃，像谁在拍他的肩。';
    case 'reviewer':
      return '硬伤：无。OOC：林墨沉默但仍会因苏霓动摇，符合设定。冗余：日志舱描写可删半句。';
    case 'editor':
      return '收口通过。建议保留结尾「拍他的肩」的拟人化引力潮，余韵足够。可发。';
    default:
      return `[${node.label}]（占位产出）`;
  }
}

describe('模拟小说生成：上下文拼接样式', () => {
  it('跑内置流水线并导出每个节点的 system + user 上下文', async () => {
    const captured: { nodeId: string; label: string; tier: string; system: string; context: string; output: string }[] = [];

    await runWorkflow('builtin-novel-pipeline', PROJECT_INPUT, {
      generate: (node, context, tier, _rag, sys) => {
        captured.push({
          nodeId: node.id,
          label: node.label,
          tier,
          system: sys ?? '',
          context,
          output: fakeGenerate(node, context, tier, _rag, sys),
        });
        return captured[captured.length - 1].output;
      },
    });

    // 断言汇聚正确：writer 应收到 4 路上游（策划/世界观/角色/大纲）
    const writer = captured.find((c) => c.nodeId === 'writer')!;
    expect(writer.context).toContain('【上游·策划】');
    expect(writer.context).toContain('【上游·世界观】');
    expect(writer.context).toContain('【上游·角色】');
    expect(writer.context).toContain('【上游·大纲】');

    // 首层节点应拿到项目上下文（大纲/维度/角色）作为 input
    const planner = captured.find((c) => c.nodeId === 'planner')!;
    expect(planner.context).toContain('星海拾遗');
    expect(planner.context).toContain('维度创作设定');

    // 断言系统提示词 = 角色预设(defaultPrompt) + 节点补充(systemPrompt)
    // 注意：agentRoleById 按 node.label（中文「策划」）匹配到 planner 角色，
    // 故完整版 defaultPrompt 作基底，节点简版 systemPrompt 作为「（节点补充）」追加。
    const plannerRole = AGENT_ROLE_MAP['planner'];
    expect(planner.system).toContain(plannerRole.defaultPrompt);
    expect(planner.system).toContain('（节点补充）你是小说策划，输出核心创意与悬念。');

    // ---- 导出拼接样式文件 ----
    const lines: string[] = [];
    lines.push('==================================================');
    lines.push('text-forge 小说生成 · 节点上下文拼接样式（模拟）');
    lines.push('运行：内置创作流水线 BUILTIN_NOVEL_PIPELINE');
    lines.push('说明：每条节点 = system 消息(角色预设+节点补充) + user 消息(上游汇聚+维度/角色/大纲)');
    lines.push('==================================================');
    for (const c of captured) {
      lines.push('');
      lines.push(`────────── 节点 [${c.nodeId}] ${c.label} · tier=${c.tier} ──────────`);
      lines.push('【SYSTEM 消息】');
      lines.push(c.system || '（空）');
      lines.push('');
      lines.push('【USER 消息 / 上下文】');
      lines.push(c.context);
      lines.push('');
      lines.push('【本节点产出】');
      lines.push(c.output);
    }
    lines.push('');
    lines.push('==================================================');
    lines.push('拼接规则解释：');
    lines.push('1. system 与 user 分离：systemPrompt 走 system 通道，不进入 user 上下文。');
    lines.push('2. 多上游汇聚(fan-in)：writer 的 dependsOn=[planner,world,character,outline]，');
    lines.push('   各上游产出按定义顺序以「【上游·标签】」分段拼接（见 gatherContext）。');
    lines.push('3. 首层节点无依赖时回退为 input（项目上下文：大纲/维度设定/角色）。');
    lines.push('4. RAG 片段以「[RAG·个人库检索片段]」带标头文本注入（本模拟未挂 rag 工具，故无）。');
    lines.push('5. tier 由节点显式字段决定（writer=standard，审校/总编=cheap），后端无需反解中文 label。');
    lines.push('==================================================');

    const outPath = join(process.cwd(), 'simulation-context-sample.txt');
    writeFileSync(outPath, lines.join('\n'), 'utf-8');
    // eslint-disable-next-line no-console
    console.log('已导出上下文样例：', outPath);
  });
});
