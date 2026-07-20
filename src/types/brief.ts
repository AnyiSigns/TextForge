// src/types/brief.ts
// 创作设定（项目级 Brief）相关类型。
import type { Origin } from './common';

// 用户自定义的弹性设定维度（势力/战力/阵营关系/地图/时间线…任意维度）。
// 不写死为平铺字段，让作者自由增删，避免每次加维度都改类型。
export interface BriefSection {
  id: string;               // 稳定 id，便于增删改
  title: string;            // 维度名，如「势力设定」「战力体系」「阵营关系」
  content: string;          // 该维度设定文本（生成时可由 summarizer 压缩）
  pinned?: boolean;         // 是否常驻注入生成（核心维度每次都带）
  origin?: Origin;          // 该维度来源（种子/用户），用于增量合并
  updatedAt?: string;
}

// 项目级「创作设定」：统一注入到角色对话与图文/视频生成，
// 控制"与小说内容相关的程度"。由前端编辑，后端未就绪时存 IndexedDB。
export interface ProjectBrief {
  projectId: string;
  genre?: string;            // 类型，如 科幻/武侠
  worldview?: string;        // 世界观设定
  tone?: string;             // 基调/文风，如 轻松幽默/暗黑严肃
  forbidden?: string;        // 创作禁忌（生成与对话都遵守）
  styleGuide?: string;       // 风格指南（视觉/文本统一参考）
  defaultVisionModel?: string; // 项目默认视觉模型 id（子生成沿用）
  defaultStyle?: string;     // 项目默认图片风格
  wordCountGoal?: number;    // 写作目标（总字数）
  dailyWordCountGoal?: number; // 每日目标（字数）
  sections?: BriefSection[]; // 自定义设定维度（用户自由增删）
  // 平铺字段来源标记：key=字段名（genre/worldview/tone/...），value=来源。
  // 用户手动改某字段 → 标 'user'，种子回填时该字段跳过。
  fieldOrigins?: Partial<Record<'genre' | 'worldview' | 'tone' | 'forbidden' | 'styleGuide' | 'defaultVisionModel' | 'defaultStyle' | 'wordCountGoal' | 'dailyWordCountGoal', Origin>>;
  updatedAt?: string;
}
