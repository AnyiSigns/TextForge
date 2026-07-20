// src/lib/seed/generate.ts
//
// 种子生成入口：把「一句话」转成结构化三项（brief/outline/characters），
// 再经 merge 适配器增量合并回填三个 store。
//
// 后端契约（照顾后端，定义清晰入参/出参）：
//   POST /api/projects/:id/seed
//     body: { prompt: string }
//     → 200 { data: ProjectSeed }   // 后端 seed 子图产出，id 由后端生成
//   中途单补某一项：
//   POST /api/projects/:id/seed/part
//     body: { part: 'brief'|'outline'|'characters', prompt?, context? }
//     → 200 { data: ProjectSeed }   // 仅含该项
//
// 后端未就绪时走 mock（本地占位结构化产出），前端回填逻辑不变；
// 后端就绪后只替换内部 fetch 实现。

import { API_URL } from '@/lib/config/env';
import { useAuthStore } from '@/lib/stores/authStore';
import { useBriefStore } from '@/features/projects';
import { useCharacterStore } from '@/features/characters';
import { loadOutline, saveOutline } from '@/lib/storage/backup';
import { mergeBrief, mergeOutline, mergeCharacters } from './merge';
import { syncManager } from '@/lib/storage/syncManager';
import type { ProjectSeed, SeedPart, SeedRequest, SeedBrief, SeedOutline, SeedCharacter } from '@/types';

// ---------- mock 占位生成（后端就绪后删除）----------
function mockSeed(prompt: string): ProjectSeed {
  const p = prompt.trim() || '一个关于遗忘与重逢的科幻故事';
  const isSci = /科幻|星|太空|未来|ai|机械/.test(p);
  const brief: SeedBrief = isSci
    ? {
        genre: '科幻',
        worldview: '文明记忆正随星海漂流消散，拾荒者必须在遗忘前打捞。',
        tone: '苍凉而温柔',
        forbidden: '避免硬科幻术语堆砌',
        styleGuide: '诗化白描',
        wordCountGoal: 80000,
        dailyWordCountGoal: 1000,
        sections: [
          { id: 'sec-core', title: '核心矛盾', content: '记忆晶核串联逝者与生者的对话', pinned: true },
          { id: 'sec-pov', title: '叙事视角', content: '第三人称限知，跟随主角的拾荒日志', pinned: false },
        ],
      }
    : {
        genre: '都市',
        worldview: '一座永远在下雨的城市，每个人都在等一个不会来的人。',
        tone: '细腻怅惘',
        forbidden: '避免悬浮爽文套路',
        styleGuide: '现实笔触',
        wordCountGoal: 60000,
        sections: [{ id: 'sec-core', title: '核心矛盾', content: '等待与错过的循环', pinned: true }],
      };

  const outline: SeedOutline = {
    volumes: [
      {
        id: 'vol-1',
        title: '第一卷',
        chapters: [
          {
            id: 'ch-1',
            title: '第一章',
            nodes: [
              { id: 'nd-1', title: '开篇钩子', content: '主角在残骸带发现一枚会发光的记忆晶核', targetWords: 2000 },
              { id: 'nd-2', title: '转折', content: '晶核共振，已故之人的残响浮现', targetWords: 2000 },
              { id: 'nd-3', title: '收束', content: '主角决定带着记忆继续漂流', targetWords: 1500 },
            ],
          },
        ],
      },
    ],
  };

  const characters: SeedCharacter[] = [
    { id: 'char-1', name: isSci ? '林墨' : '沈砚', description: '沉默的拾荒者/等待者，习惯用文字记录', role: 'protagonist', status: '存活', currentProfile: '刚经历一次失去，独自前行' },
    { id: 'char-2', name: isSci ? '苏霓' : '苏晚', description: '已逝的同伴/旧识，留下未完成的念想', role: 'deuteragonist', status: '已故', currentProfile: '留下半本未写完的记录' },
  ];

  return { brief, outline, characters };
}

// ---------- 后端调用（mock 期回退本地）----------
async function fetchSeed(projectId: string, body: SeedRequest): Promise<ProjectSeed> {
  try {
    const token = useAuthStore.getState().accessToken;
    const res = await fetch(`${API_URL}/api/projects/${projectId}/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.data && !data?.mocked) return data.data as ProjectSeed;
    }
  } catch { /* 回退 mock */ }
  return mockSeed(body.prompt ?? '');
}

// ---------- 构造中途单补的上下文（保证与现有设定自洽）----------
// 把当前 brief + 已有角色 id + 大纲摘要压缩，传给后端 seed 子图，
// 后端据此生成不矛盾的内容（不凭空冒出冲突设定）。
export async function buildSeedContext(projectId: string): Promise<NonNullable<SeedRequest['context']>> {
  const brief = useBriefStore.getState().briefs[projectId];
  const chars = useCharacterStore.getState().characters.filter((c) => (c.projectId ?? null) === projectId);
  const vols = await loadOutline(projectId).catch(() => []);
  const outlineSummary = vols.length
    ? vols.map((v) => v.chapters.map((c) => c.nodes.map((n) => n.title).join('/')).join('、')).join(' | ') || undefined
    : undefined;
  return {
    brief: brief
      ? {
          genre: brief.genre,
          worldview: brief.worldview,
          tone: brief.tone,
          forbidden: brief.forbidden,
          styleGuide: brief.styleGuide,
          sections: brief.sections?.map((s) => ({ id: s.id, title: s.title, content: s.content, pinned: s.pinned })),
        }
      : undefined,
    existingCharacterIds: chars.map((c) => c.id),
    outlineSummary,
  };
}

// ---------- 回填：把 ProjectSeed 增量合并进三个 store ----------
async function applySeed(projectId: string, seed: ProjectSeed): Promise<void> {
  const briefStore = useBriefStore.getState();
  const charStore = useCharacterStore.getState();

  if (seed.brief) {
    const local = briefStore.briefs[projectId];
    briefStore.upsertBrief(mergeBrief(local, seed.brief, projectId), 'seed');
  }
  if (seed.characters) {
    const local = charStore.characters;
    const merged = mergeCharacters(local, seed.characters, projectId);
    // 直接以合并结果覆盖本地角色表（persist 自动存 IndexedDB）。
    // 后端同步交由 syncManager 周期对齐；种子 id 由后端定，避免前端重造。
    useCharacterStore.setState({ characters: merged });
  }
  if (seed.outline) {
    const local = await loadOutline(projectId);
    const merged = mergeOutline(local, seed.outline);
    await saveOutline(projectId, merged);
    // 通知大纲页重新加载（用户可能已停留在该 tab，本地 state 不会自动刷新）
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('outline-seeded', { detail: { projectId } }));
    }
  }

  // 回填后主动触发后端同步（mock 期后端未就绪会静默失败，不阻塞）
  syncManager.syncStore('briefs').catch(() => {});
  syncManager.syncStore('characters').catch(() => {});
}

// ---------- 对外入口 ----------
/** 一句话开局：生成并回填 brief/characters/outline 三项 */
export async function generateSeed(projectId: string, prompt: string): Promise<ProjectSeed> {
  const seed = await fetchSeed(projectId, { prompt });
  await applySeed(projectId, seed);
  return seed;
}

/** 中途单补某一项（part），可带当前项目上下文以保证自洽 */
export async function generatePart(
  projectId: string,
  part: SeedPart,
  opts: { prompt?: string; context?: SeedRequest['context'] } = {},
): Promise<ProjectSeed> {
  // 未显式传 context 时，自动用当前项目数据构造（保证种子不矛盾）
  const context = opts.context ?? (await buildSeedContext(projectId));
  const seed = await fetchSeed(projectId, { prompt: opts.prompt, part, context });
  // 只回填请求的那一项
  const partial: ProjectSeed = { [part]: seed[part] };
  await applySeed(projectId, partial);
  return partial;
}

// ---------- 后端 SSE 流式契约（后端就绪后启用）----------
// 后端 seed 子图可改走流式，分步产出 brief → outline → characters，
// 前端边收边增量回填（避免"转圈等整包"）。事件形状：
//   { type: 'part', part: 'brief'|'outline'|'characters', data: SeedBrief|SeedOutline|SeedCharacter[] }
//   { type: 'done' }
// 当前 generateSeed/generatePart 是"收整包再回填"；后端若走 SSE，
// 只需把 fetchSeed 换成下方 reader，对每个 part 事件即时 applySeed 即可。
export async function streamSeed(
  projectId: string,
  prompt: string,
  onPart?: (part: SeedPart, data: unknown) => void,
): Promise<ProjectSeed> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${API_URL}/api/projects/${projectId}/seed/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ prompt }),
  });
  if (!res.body) return generateSeed(projectId, prompt); // 无流回退整包
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let acc = '';
  const collected: ProjectSeed = {};
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += dec.decode(value, { stream: true });
    const lines = acc.split('\n\n');
    acc = lines.pop() ?? '';
    for (const line of lines) {
      const json = line.replace(/^data:\s?/, '').trim();
      if (!json) continue;
      try {
        const ev = JSON.parse(json) as { type: string; part?: SeedPart; data?: unknown };
        if (ev.type === 'part' && ev.part && ev.data) {
          (collected as Record<string, unknown>)[ev.part] = ev.data;
          await applySeed(projectId, { [ev.part]: ev.data } as ProjectSeed);
          onPart?.(ev.part, ev.data);
        }
      } catch { /* 忽略不完整帧 */ }
    }
  }
  return collected;
}
