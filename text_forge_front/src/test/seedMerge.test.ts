// 验证种子生成 + 增量合并回填 + 衔接内置流水线
// 运行：npm run test -- src/test/seedMerge.test.ts
import { describe, it, expect } from 'vitest';
import { mergeCreativeSetting, mergeOutline, mergeCharacters } from '@/lib/seed/merge';
import type { BookCreativeSetting, SeedOutline, SeedCharacter, Character } from '@/types';
import type { OutlineVolume } from '@/lib/storage/backup';

const seedSetting: BookCreativeSetting = {
   bookId: 1,
   worldview: '种子世界观',
   tone: '苍凉',
   writingTaboos: '',
   customDimensions: [{ id: 's1', title: '核心矛盾', content: '种子矛盾', pinned: true }],
 };

describe('种子增量合并', () => {
   it('用户没改过的字段用种子值，改过的保留', () => {
     // 模拟用户手动改过 tone（标 user），worldview 未动
     const local: BookCreativeSetting = {
       bookId: 1,
       worldview: '',
       tone: '用户自定义基调',
       writingTaboos: '',
       customDimensions: [],
     };
     const merged = mergeCreativeSetting(local, seedSetting, 1);
     expect(merged.worldview).toBe('种子世界观'); // 未动 → 种子覆盖
     expect(merged.tone).toBe('用户自定义基调');  // 用户改过 → 保留
     expect(merged.customDimensions).toBeDefined();
     // 种子新增维度追加
     expect(merged.customDimensions?.find((s) => s.id === 's1')?.content).toBe('种子矛盾');
   });

   it('用户自建维度（init）不被种子覆盖', () => {
     const local: BookCreativeSetting = {
       bookId: 1,
       customDimensions: [{ id: 'u1', title: '用户维度', content: '用户内容', pinned: true, origin: 'init' }],
     };
     const merged = mergeCreativeSetting(local, seedSetting, 1);
     const userDim = merged.customDimensions?.find((s) => s.id === 'u1');
     expect(userDim?.content).toBe('用户内容'); // 用户自建保留
     expect(merged.customDimensions?.length).toBe(2);    // 用户维度 + 种子维度
   });
});

describe('大纲/角色增量合并', () => {
   it('用户自建大纲节点保留，种子新增追加', () => {
     const local: OutlineVolume[] = [
       { id: 'v-u', title: '用户卷', chapters: [{ id: 'c-u', title: '用户章', nodes: [{ id: 'n-u', title: '用户节点', status: 'writing' as const }] }] },
     ];
     const seed: SeedOutline = { volumes: [{ id: 'v1', title: '第一卷', chapters: [{ id: 'c1', title: '第一章', nodes: [{ id: 'n1', title: '钩子', content: 'x' }] }] }] };
     const merged = mergeOutline(local, seed);
     expect(merged.find((v) => v.id === 'v-u')?.title).toBe('用户卷'); // 用户卷保留
     expect(merged.find((v) => v.id === 'v1')?.title).toBe('第一卷');  // 种子卷追加
     expect(merged.length).toBe(2);
   });

   it('用户自建角色不被覆盖', () => {
     const local: Character[] = [
       { id: 1, name: '用户角色', description: 'd', bookId: 1, createdAt: 't', updatedAt: 't' },
     ];
     const seed: SeedCharacter[] = [
       { id: 2, name: '种子角色', description: 'd' },
       { id: 1, name: '种子想覆盖用户', description: 'd' }, // 同 id 但用户已改
     ];
     const merged = mergeCharacters(local, seed, 1);
     const u = merged.find((c) => c.id === 1);
     expect(u?.name).toBe('用户角色'); // 用户角色保留，不被种子覆盖
     expect(merged.find((c) => c.id === 2)?.name).toBe('种子角色'); // 种子新增
     expect(merged.length).toBe(2);
   });
});
