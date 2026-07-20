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
  { key: 'openai', vendor: 'OpenAI', adapter: 'openai', category: 'llm', deployment: 'cloud', defaultModelId: 'gpt-4o', defaultBaseUrl: 'https://api.openai.com/v1', needsApiKey: true },
  { key: 'anthropic', vendor: 'Anthropic', adapter: 'anthropic', category: 'llm', deployment: 'cloud', defaultModelId: 'claude-3-5-sonnet', defaultBaseUrl: 'https://api.anthropic.com', needsApiKey: true },
  { key: 'dashscope', vendor: '通义千问', adapter: 'dashscope', category: 'llm', deployment: 'cloud', defaultModelId: 'qwen-plus', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', needsApiKey: true },
  { key: 'wenxin', vendor: '文心一言', adapter: 'wenxin', category: 'llm', deployment: 'cloud', defaultModelId: 'ernie-4.0-8k', needsApiKey: true },
  { key: 'deepseek', vendor: 'DeepSeek', adapter: 'deepseek', category: 'llm', deployment: 'cloud', defaultModelId: 'deepseek-chat', defaultBaseUrl: 'https://api.deepseek.com', needsApiKey: true },
  { key: 'gemini', vendor: 'Gemini', adapter: 'gemini', category: 'llm', deployment: 'cloud', defaultModelId: 'gemini-1.5-pro', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta', needsApiKey: true },
  { key: 'ollama', vendor: 'Ollama (本地)', adapter: 'ollama', category: 'llm', deployment: 'local', defaultModelId: 'llama3', defaultBaseUrl: 'http://localhost:11434/v1', needsApiKey: false, hint: '本地运行，无需 API Key' },
  { key: 'lmstudio', vendor: 'LM Studio (本地)', adapter: 'lmstudio', category: 'llm', deployment: 'local', defaultModelId: 'local-model', defaultBaseUrl: 'http://localhost:1234/v1', needsApiKey: false, hint: '本地运行，无需 API Key' },
  { key: 'vllm', vendor: 'vLLM (本地)', adapter: 'vllm', category: 'llm', deployment: 'local', defaultModelId: 'default', defaultBaseUrl: 'http://localhost:8000/v1', needsApiKey: false, hint: '本地运行，无需 API Key' },
  { key: 'openai-compat', vendor: 'OpenAI 兼容', adapter: 'openai', category: 'llm', deployment: 'cloud', defaultModelId: '', defaultBaseUrl: '', needsApiKey: false, hint: '任意兼容 OpenAI 接口的服务（含自建）' },

  // ---------- 视觉模型 (vision) ----------
  { key: 'dalle', vendor: 'DALL·E 3', adapter: 'openai', category: 'vision', deployment: 'cloud', defaultModelId: 'dall-e-3', defaultBaseUrl: 'https://api.openai.com/v1', needsApiKey: true, modalities: ['image'] },
  { key: 'wanx', vendor: '通义万相', adapter: 'dashscope', category: 'vision', deployment: 'cloud', defaultModelId: 'wanx-v1', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', needsApiKey: true, modalities: ['image'] },
  { key: 'sd-local', vendor: 'Stable Diffusion (本地)', adapter: 'comfyui', category: 'vision', deployment: 'local', defaultModelId: 'sd-xl', defaultBaseUrl: 'http://localhost:7860', needsApiKey: false, hint: '本地 ComfyUI / SD 服务', modalities: ['image'] },
  { key: 'midjourney', vendor: 'Midjourney', adapter: 'custom', category: 'vision', deployment: 'cloud', defaultModelId: '', needsApiKey: true, hint: '按需对接自建代理', modalities: ['image'] },
  { key: 'kling', vendor: '可灵 Kling', adapter: 'kling', category: 'vision', deployment: 'cloud', defaultModelId: 'kling-v1', needsApiKey: true, extraFields: [{ key: 'duration', label: '时长(秒)', type: 'number', default: 5 }, { key: 'aspect', label: '比例', type: 'text', placeholder: '16:9' }], modalities: ['video'] },
  { key: 'runway', vendor: 'Runway', adapter: 'runway', category: 'vision', deployment: 'cloud', defaultModelId: 'gen-3-alpha', needsApiKey: true, extraFields: [{ key: 'duration', label: '时长(秒)', type: 'number', default: 4 }], modalities: ['video'] },
  { key: 'luma', vendor: 'Luma', adapter: 'luma', category: 'vision', deployment: 'cloud', defaultModelId: 'luma-ray', needsApiKey: true, modalities: ['video'] },
  { key: 'jimeng', vendor: '即梦 Jimeng', adapter: 'jimeng', category: 'vision', deployment: 'cloud', defaultModelId: 'jimeng-v1', needsApiKey: true, modalities: ['video'] },
  { key: 'comfyui', vendor: 'ComfyUI (本地)', adapter: 'comfyui', category: 'vision', deployment: 'local', defaultModelId: 'workflow-default', defaultBaseUrl: 'http://localhost:8188', needsApiKey: false, hint: '本地 ComfyUI 工作流', modalities: ['image', 'video'] },

  // ---------- 全模态模型 (omni) ----------
  { key: 'gemini-omni', vendor: 'Gemini (全模态)', adapter: 'gemini', category: 'omni', deployment: 'cloud', defaultModelId: 'gemini-1.5-pro', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta', needsApiKey: true, modalities: ['image', 'video'] },
  { key: 'gpt4o-omni', vendor: 'GPT-4o (全模态)', adapter: 'openai', category: 'omni', deployment: 'cloud', defaultModelId: 'gpt-4o', defaultBaseUrl: 'https://api.openai.com/v1', needsApiKey: true, modalities: ['image', 'video'] },

  // ---------- 语音模型 (speech) ----------
  { key: 'openai-tts', vendor: 'OpenAI TTS', adapter: 'openai', category: 'speech', deployment: 'cloud', defaultModelId: 'tts-1', defaultBaseUrl: 'https://api.openai.com/v1', needsApiKey: true },
  { key: 'azure-speech', vendor: 'Azure 语音', adapter: 'custom', category: 'speech', deployment: 'cloud', defaultModelId: '', needsApiKey: true, hint: '按需对接自建代理' },
  { key: 'coqui', vendor: 'Coqui (本地)', adapter: 'custom', category: 'speech', deployment: 'local', defaultModelId: 'coqui-tts', defaultBaseUrl: 'http://localhost:5002', needsApiKey: false, hint: '本地 TTS 服务' },

  // ---------- 向量模型 (embedding) ----------
  { key: 'openai-embed', vendor: 'OpenAI Embeddings', adapter: 'openai', category: 'embedding', deployment: 'cloud', defaultModelId: 'text-embedding-3-small', defaultBaseUrl: 'https://api.openai.com/v1', needsApiKey: true },
  { key: 'bge', vendor: 'BGE (本地)', adapter: 'bge', category: 'embedding', deployment: 'local', defaultModelId: 'bge-large-zh', defaultBaseUrl: 'http://localhost:8000', needsApiKey: false, hint: '本地嵌入服务' },
  { key: 'cohere', vendor: 'Cohere', adapter: 'cohere', category: 'embedding', deployment: 'cloud', defaultModelId: 'embed-multilingual-v3', needsApiKey: true },
  { key: 'jina', vendor: 'Jina', adapter: 'jina', category: 'embedding', deployment: 'cloud', defaultModelId: 'jina-embeddings-v2-base-zh', needsApiKey: true },
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