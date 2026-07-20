// src/types/model.ts
// 模型配置相关类型。
import type {
  AdapterType,
  AuxiliaryModel,
  ModelCategory,
  ModelDeployment,
  ModelModality,
} from './common';

export interface ModelConfig {
  id: string;
  name: string;
  category: ModelCategory;
  deployment: ModelDeployment;
  vendor: string; // e.g. 'OpenAI', 'Ollama', 'Kling'
  adapter: AdapterType;
  baseUrl?: string;
  apiKey?: string;
  modelId: string; // actual model name passed to backend
  isDefault?: boolean;
  extra?: Record<string, string | number>;
  auxiliary?: AuxiliaryModel[]; // only for category 'text'
  modalities?: ModelModality[]; // 支持的能力：图片/视频（仅 vision/omni 有意义）
  createdAt: string;
}
