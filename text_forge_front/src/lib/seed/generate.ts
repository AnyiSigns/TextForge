// src/lib/seed/generate.ts
//
// 种子生成入口：把「一句话」转成结构化三项（creativeSetting/outline/characters），
// 再经 merge 适配器增量合并回填三个 store。
//
// 后端契约：
//   POST /api/books/:id/seed
//     body: { prompt: string }
//     → 200 { data: BookSeed }
//   中途单补某一项：
//   POST /api/books/:id/seed/part
//     body: { part: 'brief'|'outline'|'characters', prompt?, context? }
//     → 200 { data: BookSeed }

import { API_URL } from '@/lib/config/env';
import { useAuthStore } from '@/lib/stores/authStore';
import { useCreativeSettingStore } from '@/features/projects';
import { useCharacterStore } from '@/features/characters';
import { loadOutline, saveOutline } from '@/lib/storage/backup';
import { mergeCreativeSetting, mergeOutline, mergeCharacters } from './merge';
import { syncManager } from '@/lib/storage/syncManager';
import type { BookSeed, SeedPart, SeedRequest, SeedCreativeSetting, SeedOutline, SeedCharacter } from '@/types';

// ---------- mock 占位生成（后端就绪后删除）----------
function mockSeed(prompt: string): BookSeed {
  const p = prompt.trim() || '一个关于遗忘与重逢的科幻故事';
  const isSci = /科幻|星|太空|未来|ai|机械/.test(p);
  const creativeSetting: SeedCreativeSetting = isSci
    ? {
        worldview: '文明记忆正随星海漂流消散，拾荒者必须在遗忘前打捞。',
        tone: '苍凉而温柔',
        writingTaboos: '避免硬科幻术语堆砌',
        customDimensions: [
          { id: 'sec-core', title: '核心矛盾', content: '记忆晶核串联逝者与生者的对话', pinned: true },
        ],
      }
    : {
        worldview: '一座永远在下雨的城市，每个人都在等一个不会来的人。',
        tone: '细腻怅惘',
        writingTaboos: '避免悬浮爽文套路',
        customDimensions: [
          { id: 'sec-core', title: '核心矛盾', content: '等待与错过的循环', pinned: true },
        ],
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
              { id: 'nd-1', title: '开篇钩子', content: '主角在残骸带发现一枚会发光的记忆晶核' },
              { id: 'nd-2', title: '转折', content: '晶核共振，已故之人的残响浮现' },
              { id: 'nd-3', title: '收束', content: '主角决定带着记忆继续漂流' },
            ],
          },
        ],
      },
    ],
  };

  const characters: SeedCharacter[] = [
    { id: 1, name: isSci ? '林墨' : '沈砚', description: '沉默的拾荒者/等待者，习惯用文字记录', roleType: 'protagonist', status: '存活' },
    { id: 2, name: isSci ? '苏霓' : '苏晚', description: '已逝的同伴/旧识，留下未完成的念想', roleType: 'deuteragonist', status: '已故' },
  ];

  return { creativeSetting, outline, characters };
}

// ---------- 后端调用（mock 期回退本地）----------
async function fetchSeed(bookId: number, body: SeedRequest): Promise<BookSeed> {
  try {
    const token = useAuthStore.getState().accessToken;
    const res = await fetch(`${API_URL}/api/books/${bookId}/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.data && !data?.mocked) return data.data as BookSeed;
    }
  } catch { /* 回退 mock */ }
  return mockSeed(body.prompt ?? '');
}

// ---------- 构造中途单补的上下文 ----------
export async function buildSeedContext(bookId: number): Promise<NonNullable<SeedRequest['context']>> {
  const setting = useCreativeSettingStore.getState().settings[bookId];
  const chars = useCharacterStore.getState().characters;
  const vols = await loadOutline(String(bookId)).catch(() => []);
  const outlineSummary = vols.length
    ? vols.map((v) => v.chapters.map((c) => c.nodes.map((n) => n.title).join('/')).join('、')).join(' | ') || undefined
    : undefined;
  return {
    creativeSetting: setting
      ? {
          worldview: setting.worldview,
          tone: setting.tone,
          writingTaboos: setting.writingTaboos,
          customDimensions: setting.customDimensions?.map((s) => ({ id: s.id, title: s.title, content: s.content, pinned: s.pinned })),
        }
      : undefined,
    existingCharacterIds: chars.map((c) => c.id),
    outlineSummary,
  };
}

// ---------- 回填 ----------
async function applySeed(bookId: number, seed: BookSeed): Promise<void> {
  const settingStore = useCreativeSettingStore.getState();
  const charStore = useCharacterStore.getState();

  if (seed.creativeSetting) {
    const local = settingStore.settings[bookId];
    settingStore.upsertSetting(mergeCreativeSetting(local, seed.creativeSetting, bookId), 'seed');
  }
  if (seed.characters) {
    const local = charStore.characters;
    const merged = mergeCharacters(local, seed.characters, bookId);
    useCharacterStore.setState({ characters: merged });
  }
  if (seed.outline) {
    const local = await loadOutline(String(bookId));
    const merged = mergeOutline(local, seed.outline);
    await saveOutline(String(bookId), merged);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('outline-seeded', { detail: { bookId } }));
    }
  }

  syncManager.syncStore('creativeSettings').catch(() => {});
  syncManager.syncStore('characters').catch(() => {});
}

// ---------- 对外入口 ----------
export async function generateSeed(bookId: number, prompt: string): Promise<BookSeed> {
  const seed = await fetchSeed(bookId, { prompt });
  await applySeed(bookId, seed);
  return seed;
}

export async function generatePart(
  bookId: number,
  part: SeedPart,
  opts: { prompt?: string; context?: SeedRequest['context'] } = {},
): Promise<BookSeed> {
  const context = opts.context ?? (await buildSeedContext(bookId));
  const seed = await fetchSeed(bookId, { prompt: opts.prompt, part, context });
  const partial: BookSeed = { [part]: seed[part] };
  await applySeed(bookId, partial);
  return partial;
}

export async function streamSeed(
  bookId: number,
  prompt: string,
  onPart?: (part: SeedPart, data: unknown) => void,
): Promise<BookSeed> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${API_URL}/api/books/${bookId}/seed/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ prompt }),
  });
  if (!res.body) return generateSeed(bookId, prompt);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let acc = '';
  const collected: BookSeed = {};
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
          await applySeed(bookId, { [ev.part]: ev.data } as BookSeed);
          onPart?.(ev.part, ev.data);
        }
      } catch { /* 忽略不完整帧 */ }
    }
  }
  return collected;
}
