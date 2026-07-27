// src/types/model.ts
// 模型配置相关类型。
import type {
  AdapterType,
  AuxiliaryModel,
  ModelCategory,
  ModelDeployment,
  ModelModality,
} from './common';

export type ModelRole = 'main' | 'audit' | 'router' | 'tool';

export interface RoleModelConfig {
  id: string;
  name: string;
  adapter: AdapterType;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  extra?: Record<string, string | number>;
  createdAt: string;
}

export interface ModelConfig {
  id: string;
  name: string;
  category: ModelCategory;
  deployment: ModelDeployment;
  vendor: string;
  adapter: AdapterType;
  baseUrl?: string;
  apiKey?: string;
  modelId: string;
  isDefault?: boolean;
  extra?: Record<string, string | number>;
  auxiliary?: AuxiliaryModel[];
  modalities?: ModelModality[];
  createdAt: string;
  role?: ModelRole;
}
