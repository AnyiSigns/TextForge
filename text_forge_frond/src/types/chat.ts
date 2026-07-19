// src/types/chat.ts
// 对话与图文/视频生成请求类型。
import type { GenerationContext } from './workflow';

export interface ChatMessageRequest {
  message: string;
  project_id?: string;
  brief?: string;
  character_name?: string;
  character_description?: string;
  // 最近历史上下文（后端无状态时需回传以维持连贯对话）
  messages?: { role: 'user' | 'assistant'; content: string }[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  emoji?: string;
}

// Request types for generation API
export type GenerationBaseRequest = {
  prompt: string;
  negative_prompt?: string;
  model_id?: string;
  project_id?: string;
  context?: GenerationContext;
  source_step?: string;
};

export interface ImageRequest extends GenerationBaseRequest {
  style?: string;
  size?: string;
  count?: number;
  characterId?: string;
  /** 角色一致性：用作参考图的 URL（后端据此保持同一角色多图一致） */
  reference_image?: string;
  /** 角色一致性：固定随机种子（同一 seed 产出更稳定的角色外观） */
  seed?: number;
}

export interface VideoRequest extends GenerationBaseRequest {
  duration?: number;
  aspect?: string;
  /** 视频专属：关联章节（回链，3.3） */
  chapter_id?: string;
  /** 视频专属：本次用到的角色 id 列表（来自角色图，3.1） */
  character_ids?: string[];
  /** 视频专属：角色参考图 URL（保证视频中角色外观一致，3.1） */
  reference_images?: string[];
  /** 视频专属：分镜脚本（后端生成或前端拼装，预留） */
  storyboard?: string;
}
