// src/features/characters/lib/characterRefs.ts
// 角色参考图 / 匹配 / 关系 id 的纯函数集合（跨 hook 复用，避免重复实现）。
// 纯函数、无副作用，便于单测。
import type { Character, CharacterRelationship } from '@/types';

/** 归并角色参考图 URL：优先用多张 referenceImages，否则回退单张 referenceImage（与原内联逻辑一致）。 */
export function collectReferenceImages(
  c: { referenceImages?: string[] | null; referenceImage?: string | null },
): string[] {
  const src = c.referenceImages ?? (c.referenceImage ? [c.referenceImage] : []);
  return Array.from(new Set(src.filter((u): u is string => !!u)));
}

/** 按章节正文匹配出场角色：角色名或别名（称呼）任一出现在正文中即命中。 */
export function matchCharsByText<T extends { id: string; name?: string; aliases?: string[] | null }>(
  pool: T[],
  text: string,
): T[] {
  if (!text) return [];
  return pool.filter((c) => {
    const keys = [c.name, ...(c.aliases ?? [])].filter(
      (k): k is string => !!k && k.trim().length > 0,
    );
    return keys.some((k) => text.includes(k));
  });
}

/** 生成关系条目 id（详情编辑用，避免与既有 id 冲突）。 */
export function makeRelationId(): string {
  return `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 仅保留已选对端且填写关系描述的项（保存关系前过滤）。 */
export function pruneRelations(draft: CharacterRelationship[]): CharacterRelationship[] {
  return draft.filter((r) => r.targetId && r.relation.trim());
}

export type { Character };
