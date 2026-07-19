// 验证种子生成 + 增量合并回填 + 衔接内置流水线
// 运行：npm run test -- src/test/seedMerge.test.ts
import { describe, it, expect } from 'vitest';
import { mergeBrief, mergeOutline, mergeCharacters } from '@/lib/seed/merge';
import type { ProjectBrief, SeedBrief, SeedOutline, SeedCharacter, Character } from '@/types';
import type { OutlineVolume } from '@/lib/storage/backup';

const seedBrief: SeedBrief = {
  genre: '科幻',
  worldview: '种子世界观',
  tone: '苍凉',
  sections: [{ id: 's1', title: '核心矛盾', content: '种子矛盾' }],
};

describe('种子增量合并', () => {
  it('用户没改过的字段用种子值，改过的保留', () => {
    // 模拟用户手动改过 tone（标 user），worldview 未动
    const local: ProjectBrief = {
      projectId: 'p1',
      worldview: '',
      tone: '用户自定义基调',
      fieldOrigins: { tone: 'user' },
      sections: [],
    };
    const merged = mergeBrief(local, seedBrief, 'p1');
    expect(merged.worldview).toBe('种子世界观'); // 未动 → 种子覆盖
    expect(merged.tone).toBe('用户自定义基调');  // 用户改过 → 保留
    expect(merged.fieldOrigins?.tone).toBe('user');
    expect(merged.fieldOrigins?.worldview).toBe('seed');
    // 种子新增维度追加
    expect(merged.sections?.find((s) => s.id === 's1')?.content).toBe('种子矛盾');
  });

  it('用户自建维度（init）不被种子覆盖', () => {
    const local: ProjectBrief = {
      projectId: 'p1',
      sections: [{ id: 'u1', title: '用户维度', content: '用户内容', origin: 'init' }],
    };
    const merged = mergeBrief(local, seedBrief, 'p1');
    const userSec = merged.sections?.find((s) => s.id === 'u1');
    expect(userSec?.content).toBe('用户内容'); // 用户自建保留
    expect(merged.sections?.length).toBe(2);    // 用户维度 + 种子维度
  });
});

describe('大纲/角色增量合并', () => {
  it('用户自建大纲节点保留，种子新增追加', () => {
    const local: OutlineVolume[] = [
      { id: 'v-u', title: '用户卷', origin: 'init', chapters: [{ id: 'c-u', title: '用户章', origin: 'init', nodes: [{ id: 'n-u', title: '用户节点', status: 'todo', origin: 'init' }] }] },
    ];
    const seed: SeedOutline = { volumes: [{ id: 'v1', title: '第一卷', chapters: [{ id: 'c1', title: '第一章', nodes: [{ id: 'n1', title: '钩子', content: 'x' }] }] }] };
    const merged = mergeOutline(local, seed);
    expect(merged.find((v) => v.id === 'v-u')?.title).toBe('用户卷'); // 用户卷保留
    expect(merged.find((v) => v.id === 'v1')?.title).toBe('第一卷');  // 种子卷追加
    expect(merged.length).toBe(2);
  });

  it('用户自建角色不被覆盖', () => {
    const local: Character[] = [
      { id: 'u1', name: '用户角色', description: 'd', projectId: 'p1', origin: 'init', createdAt: 't' },
    ];
    const seed: SeedCharacter[] = [
      { id: 'c1', name: '种子角色', description: 'd' },
      { id: 'u1', name: '种子想覆盖用户', description: 'd' }, // 同名 id 但用户已改
    ];
    const merged = mergeCharacters(local, seed, 'p1');
    const u = merged.find((c) => c.id === 'u1');
    expect(u?.name).toBe('用户角色'); // 用户角色保留，不被种子覆盖
    expect(merged.find((c) => c.id === 'c1')?.name).toBe('种子角色'); // 种子新增
    expect(merged.length).toBe(2);
  });
});
