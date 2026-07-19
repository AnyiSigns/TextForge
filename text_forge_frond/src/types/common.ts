// src/types/common.ts
// 跨域共享的基础类型与 API 包装。

// Model categories the app routes by (functional names)
export type ModelCategory = 'llm' | 'vision' | 'omni' | 'speech' | 'embedding';

// Where the model runs
export type ModelDeployment = 'cloud' | 'local';

// Tells the backend which library/adapter to use (decouples UI from per-vendor libs)
export type AdapterType =
  | 'openai'
  | 'anthropic'
  | 'dashscope' // 阿里通义千问
  | 'wenxin' // 百度文心
  | 'deepseek'
  | 'gemini'
  | 'ollama' // 本地
  | 'lmstudio' // 本地
  | 'vllm' // 本地
  | 'comfyui' // 本地视频/图像
  | 'kling' // 可灵
  | 'runway'
  | 'luma'
  | 'jimeng' // 即梦
  | 'bge' // 本地嵌入
  | 'cohere'
  | 'jina'
  | 'custom';

// Auxiliary model: a secondary llm role used by a primary text model
export interface AuxiliaryModel {
  id: string;
  role: 'planner' | 'critic' | 'summarizer' | 'reviewer' | 'translator' | 'custom';
  label: string;
  modelRef: string; // id of another text model, or inline model id
  enabled: boolean;
}

export type ModelModality = 'image' | 'video';

// API 统一响应包装
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export type SyncEntityType = 'projects' | 'characters' | 'briefs' | 'models' | 'settings' | 'portfolio';

// 后端同步响应包装；updates 默认 unknown[]，可在 syncManager 注册处标注具体类型
// （如 SyncResponse<Project[]>），避免 unknown 丢失类型。
export interface SyncResponse<T = unknown> {
  updates: T[];
  version?: number;
}

// 数据来源标记：增量合并时用于判断「该单元是否被用户手动改过」。
// - seed：种子生成填入，用户未手动改，可被后续种子覆盖
// - user：用户手动编辑/自建，种子回填时跳过、原地保留
// - init：本地从零创建（未经过种子），等同 user 语义，种子不覆盖
export type Origin = 'seed' | 'user' | 'init';

// Media types
export type MediaKind = 'image' | 'video';

export interface MediaTask {
  id: string;
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result_url?: string;
  kind: MediaKind;
  project_id?: string;
  source?: 'character' | 'chapter';
  source_ref?: string;
  /** 视频专属：关联章节（回链用，3.3） */
  chapter_id?: string;
  /** 视频专属：本次用到的角色 id 列表（来自角色图，3.1） */
  character_ids?: string[];
  /** 视频专属：分镜脚本文本（后端生成或前端拼装，预留） */
  storyboard?: string;
  createdAt: string;
}
