// src/types/creativeSetting.ts
// 创作设定（书籍级 CreativeSetting）相关类型。
import type { Origin } from './common';

// 用户自定义的弹性设定维度（势力/战力/阵营关系/地图/时间线…任意维度）。
export interface CustomDimension {
  id: string;
  title: string;
  content: string;
  pinned?: boolean;
  origin?: Origin;
  updatedAt?: string;
}

// 书籍级「创作设定」：统一注入到角色对话与图文/视频生成，
// 控制"与小说内容相关的程度"。由前端编辑，后端未就绪时存 IndexedDB。
export interface BookCreativeSetting {
  bookId: number;
  tone?: string;
  worldview?: string;
  writingTaboos?: string;
  customDimensions?: CustomDimension[];
  updatedAt?: string;
}
