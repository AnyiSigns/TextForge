// src/features/characters/lib/characterRefs.test.ts
import { describe, it, expect } from 'vitest';
import {
  collectReferenceImages,
  matchCharsByText,
  makeRelationId,
  pruneRelations,
} from './characterRefs';
import type { CharacterRelationship } from '@/types';

describe('characterRefs - 角色参考图与匹配纯函数', () => {
  it('collectReferenceImages 多张优先、单张回退、去重', () => {
    expect(
      collectReferenceImages({ referenceImages: ['a', 'a', 'b'], referenceImage: 'c' }),
    ).toEqual(['a', 'b']);
    expect(collectReferenceImages({ referenceImage: 'x' })).toEqual(['x']);
    expect(collectReferenceImages({})).toEqual([]);
  });

  it('matchCharsByText 按名/别名命中且保留原对象形状', () => {
    const pool = [
      { id: '1', name: '林墨' },
      { id: '2', name: '苏清', aliases: ['苏姑娘', '清儿'] },
      { id: '3', name: '路人' },
    ];
    const hit = matchCharsByText(pool, '林墨与苏姑娘同行');
    expect(hit.map((c) => c.id)).toEqual(['1', '2']);
    // 保留完整对象，便于后续取参考图
    expect(hit[1]).toHaveProperty('aliases');
  });

  it('matchCharsByText 空文本返回空', () => {
    expect(matchCharsByText([{ id: '1', name: 'x' }], '')).toEqual([]);
  });

  it('makeRelationId 生成唯一 id', () => {
    const a = makeRelationId();
    const b = makeRelationId();
    expect(a).not.toBe(b);
    expect(a.startsWith('rel-')).toBe(true);
  });

  it('pruneRelations 仅保留有对端与关系描述的项', () => {
    const draft: CharacterRelationship[] = [
      { id: '1', targetId: 'a', relation: '宿敌' },
      { id: '2', targetId: '', relation: '友' },
      { id: '3', targetId: 'b', relation: '   ' },
    ];
    expect(pruneRelations(draft).map((r) => r.id)).toEqual(['1']);
  });
});
