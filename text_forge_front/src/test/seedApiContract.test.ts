// 验证前端与「后端 seed 接口」的契约对齐：
// 后端返回标准 BookSeed JSON（id 由后端生成），前端 fetchSeed 解析后回填三 store。
// 用 vi.stubGlobal 模拟后端 fetch，不依赖运行时 mock handler。
// 运行：npm run test -- src/test/seedApiContract.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSeed, generatePart } from '@/lib/seed/generate';
import { useCreativeSettingStore } from '@/features/projects';
import { useCharacterStore } from '@/features/characters';

// 用内存实现替换 indexedDB 读写，绕开 jsdom 无 indexedDB 的限制（专注测前端回填逻辑）
const idbMem = new Map<string, unknown>();
vi.mock('@/lib/storage/indexedDB', () => ({
  getItem: vi.fn(async (k: string) => idbMem.get(k)),
  setItem: vi.fn(async (k: string, v: unknown) => {
    idbMem.set(k, v);
  }),
  removeItem: vi.fn(async (k: string) => {
    idbMem.delete(k);
  }),
  putKbDoc: vi.fn(),
  getKbDoc: vi.fn(),
  getAllKbDocs: vi.fn(async () => []),
  deleteKbDoc: vi.fn(),
}));

import { loadOutline, saveOutline } from '@/lib/storage/backup';

// 模拟后端返回的标准 BookSeed（id 由后端生成，形状对齐 store 类型）
function backendSeedResponse(bookId: number, part?: string) {
  const full = {
    creativeSetting: {
      worldview: '后端生成的星海世界观',
      tone: '苍凉',
      customDimensions: [{ id: 'sec-b-1', title: '核心矛盾', content: '后端矛盾', pinned: true }],
    },
    outline: {
      volumes: [
        {
          id: 'vol-b-1',
          title: '第一卷',
          chapters: [
            {
              id: 'ch-b-1',
              title: '第一章',
              nodes: [{ id: 'nd-b-1', title: '钩子', content: 'x' }],
            },
          ],
        },
      ],
    },
    characters: [
      { id: 1, name: '后端主角', description: 'd', roleType: 'protagonist', status: '存活' },
      { id: 2, name: '后端配角', description: 'd', roleType: 'supporting' },
    ],
  };
  const data = part ? { [part]: (full as Record<string, unknown>)[part] } : full;
  return {
    ok: true,
    status: 200,
    json: async () => ({ data, meta: { version: 1 } }),
  } as unknown as Response;
}

describe('后端 seed 接口契约', () => {
  beforeEach(() => {
    useCreativeSettingStore.setState({ settings: {} });
    useCharacterStore.setState({ characters: [] });
     saveOutline('1', []);
  });

  it('generateSeed：后端返回完整 BookSeed，前端正确回填三项', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => backendSeedResponse(1)),
    );
    const seed = await generateSeed(1, '一句话开局');
    expect(seed.creativeSetting?.worldview).toBe('后端生成的星海世界观');
    expect(useCreativeSettingStore.getState().settings[1]?.worldview).toBe('后端生成的星海世界观');
    const chars = useCharacterStore.getState().characters;
    expect(chars.map((c) => c.id)).toEqual([1, 2]);
     const outline = await loadOutline('1');
    expect(outline[0]?.id).toBe('vol-b-1');
    vi.unstubAllGlobals();
  });

  it('generatePart(characters)：后端只返回角色，前端只回填角色不碰其他', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => backendSeedResponse(1, 'characters')),
    );
    useCreativeSettingStore.getState().upsertSetting({
      bookId: 1,
      worldview: '用户世界观',
    });
    const res = await generatePart(1, 'characters', { prompt: '补角色' });
    expect(res.characters?.length).toBe(2);
    expect(useCreativeSettingStore.getState().settings[1]?.worldview).toBe('用户世界观');
    const chars = useCharacterStore.getState().characters;
    expect(chars.map((c) => c.id)).toEqual([1, 2]);
    vi.unstubAllGlobals();
  });

  it('后端失败（网络错误）时回退本地 mock，不抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network');
      }),
    );
    const seed = await generateSeed(1, '科幻拾荒');
    expect(seed.creativeSetting?.worldview).toContain('星海');
    vi.unstubAllGlobals();
  });
});
