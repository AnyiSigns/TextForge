// src/types/seed.ts
// 种子生成（一句话开局 / 中途单补）相关类型。

export type SeedPart = 'creativeSetting' | 'outline' | 'characters';

// 种子产出的「创作设定」结构（对齐 BookCreativeSetting 的可合并字段）
export interface SeedCreativeSetting {
  worldview?: string;
  tone?: string;
  writingTaboos?: string;
  customDimensions?: { id: string; title: string; content: string; pinned?: boolean }[];
}

// 种子产出的「大纲」结构（对齐 OutlineVolume[]，带 origin 不在此层，由适配器打）
export interface SeedOutline {
  volumes: {
    id: string;
    title: string;
    chapters: {
      id: string;
      title: string;
      nodes: { id: string; title: string; content?: string }[];
    }[];
  }[];
}

// 种子产出的「角色」结构（对齐 Character，缺 createdAt 由适配器补）
export interface SeedCharacter {
  id: number;
  name: string;
  description: string;
  roleType?: string;
  status?: string;
}

// 后端 /api/books/:id/seed 的完整返回（开局：一次填满三项）
export interface BookSeed {
  creativeSetting?: SeedCreativeSetting;
  outline?: SeedOutline;
  characters?: SeedCharacter[];
}

// 后端契约请求体
//  - generateSeed：开局，prompt 为用户一句话；后端据此生成完整三项。
//  - generatePart：中途单补某一项；context 为「当前书籍已有数据」的精简快照，
//    后端据此生成与现有设定自洽的内容（不凭空矛盾）。
export interface SeedRequest {
  prompt?: string;
  part?: SeedPart;
  // 中途单补时携带的上下文（前端把当前 creativeSetting/已存在角色/大纲摘要压缩后传入）
  context?: { creativeSetting?: SeedCreativeSetting; existingCharacterIds?: number[]; outlineSummary?: string };
}
