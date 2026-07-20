// src/types/project.ts
// 项目与项目请求体类型。
import type { ProjectBrief } from './brief';

export interface Project {
  id: string;
  title: string;
  status: 'draft' | 'generating' | 'completed' | 'paused';
  genre?: string;
  description?: string;
  pinned?: boolean;
  /** 绑定的创作流水线（工作流 id）；缺省使用内置创作流水线 BUILTIN_WORKFLOW_ID */
  workflowId?: string;
  createdAt: string;
  updatedAt: string;
}

/** 内置创作流水线 id（项目默认使用的多 Agent 生成流程） */
export const BUILTIN_WORKFLOW_ID = 'builtin-novel-pipeline';
export type WorkflowRef = string; // 工作流 id（含内置 id）

// API 请求体类型
export interface CreateProjectRequest {
  title: string;
  description: string;
  genre: string;
  version?: number;
}

export interface UpdateBriefRequest {
  brief: ProjectBrief;
}
