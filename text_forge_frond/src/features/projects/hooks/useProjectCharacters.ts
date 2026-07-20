// src/lib/hooks/useProjectCharacters.ts
import { useEffect } from 'react';
import { useCharacterStore } from '@/features/characters';
import type { Character } from '@/types';

/**
 * 统一「按项目过滤角色」+「进入页面时同步角色」的入口，消除多处重复的
 * characters.filter((c) => c.projectId === projectId) 与各自 syncFromBackend() 调用。
 * - projectChars：当前项目下的角色（已过滤）
 * - sync：手动触发一次后端同步（角色 tab 进入时常需强制刷新）
 * hook 内默认在本地无角色数据时拉取；其余场景由调用方按需调用 sync。
 */
export function useProjectCharacters(projectId: string): {
  projectChars: Character[];
  allCharacters: Character[];
  sync: () => Promise<unknown>;
} {
  const characters = useCharacterStore((s) => s.characters);
  const syncFromBackend = useCharacterStore((s) => s.syncFromBackend);

  const projectChars = characters.filter((c) => (c.projectId ?? null) === projectId);

  useEffect(() => {
    if (useCharacterStore.getState().characters.length === 0) {
      syncFromBackend().catch(() => {});
    }
  }, [projectId, syncFromBackend]);

  return { projectChars, allCharacters: characters, sync: syncFromBackend };
}
