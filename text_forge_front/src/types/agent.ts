// src/types/agent.ts
// Agent 相关共享类型（跨功能域使用）。
// 优先使用 features/user-agent/types/agent.ts 中的详细定义；
// 此文件仅存放需要在多个 feature 间共享的精简类型。

export interface CrossChapterContext {
  previousChapterSummary: string;
  characterStateChanges: CharacterStateChange[];
  foreshadowingProgress: ForeshadowingEntry[];
}

export interface CharacterStateChange {
  characterId: number;
  characterName: string;
  field: string;
  from: string;
  to: string;
}

export interface ForeshadowingEntry {
  id: string;
  description: string;
  status: 'setup' | 'developing' | 'resolved';
  relatedChapterIds: number[];
}