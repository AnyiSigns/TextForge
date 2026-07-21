import type { AdapterType, ModelCategory, ModelDeployment, AuxiliaryModel } from '@/types';

export interface ModelTemplate {
  key: string;
  vendor: string;
  adapter: AdapterType;
  category: ModelCategory;
  deployment: ModelDeployment;
  defaultModelId: string;
  defaultBaseUrl?: string;
  needsApiKey: boolean;
  extraFields?: { key: string; label: string; type: 'text' | 'number'; placeholder?: string; default?: string | number }[];
  hint?: string;
  modalities?: ('image' | 'video')[];
}

// Vendor presets. `adapter` is the single field the backend uses to pick its
// library/SDK, so adding a new vendor only needs a template here + a backend adapter.
export const MODEL_TEMPLATES: ModelTemplate[] = [
  // ---------- 大语言模型 (llm) ----------
  { key: 'ollama', vendor: 'Ollama (本地)', adapter: 'ollama', category: 'llm', deployment: 'local', defaultModelId: 'llama3', defaultBaseUrl: 'http://localhost:11434/v1', needsApiKey: false, hint: '本地运行，无需 API Key' },
  { key: 'dashscope', vendor: '通义千问', adapter: 'dashscope', category: 'llm', deployment: 'cloud', defaultModelId: 'qwen-plus', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', needsApiKey: true },
  { key: 'deepseek', vendor: 'DeepSeek', adapter: 'deepseek', category: 'llm', deployment: 'cloud', defaultModelId: 'deepseek-chat', defaultBaseUrl: 'https://api.deepseek.com', needsApiKey: true },
  { key: 'openai-compat', vendor: 'OpenAI 兼容', adapter: 'openai', category: 'llm', deployment: 'cloud', defaultModelId: '', defaultBaseUrl: '', needsApiKey: false, hint: '任意兼容 OpenAI 接口的服务（含自建）' },

  // ---------- 向量模型 (embedding) ----------
  { key: 'openai-embed', vendor: 'OpenAI Embeddings', adapter: 'openai', category: 'embedding', deployment: 'cloud', defaultModelId: 'text-embedding-3-small', defaultBaseUrl: 'https://api.openai.com/v1', needsApiKey: true },
  { key: 'dashscope-embed', vendor: 'DashScope 文本向量', adapter: 'dashscope', category: 'embedding', deployment: 'cloud', defaultModelId: 'text-embedding-v4', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', needsApiKey: true },
];

export const CATEGORY_LABELS: Record<ModelCategory, string> = {
  llm: '大语言模型',
  vision: '视觉模型',
  omni: '全模态模型',
  speech: '语音模型',
  embedding: '向量模型',
};

export const AUX_ROLE_LABELS: Record<AuxiliaryModel['role'], string> = {
  planner: '规划',
  critic: '批评/校对',
  summarizer: '总结',
  reviewer: '审查',
  translator: '翻译',
  custom: '自定义',
};