// src/types/project.ts
// 书籍与书籍请求体类型。
import type { BookCreativeSetting } from './creativeSetting';

export interface Book {
  id: number;
  title: string;
  genre?: string;
  description?: string;
  pinned?: boolean;
  workflowId?: string;
  totalWordGoal?: number;
  currentWordCount?: number;
  createdAt: string;
  updatedAt: string;
}

/** 内置创作流水线 id（书籍默认使用的多 Agent 生成流程） */
export const BUILTIN_WORKFLOW_ID = 'builtin-novel-pipeline';
export type WorkflowRef = string; // 工作流 id（含内置 id）

// API 请求体类型
export interface CreateBookRequest {
  title: string;
  description?: string;
  genre?: string;
}

export interface UpdateCreativeSettingRequest {
  setting: BookCreativeSetting;
}

export type BookId = number;
