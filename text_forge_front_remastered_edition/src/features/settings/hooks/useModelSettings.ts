'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { showApiError } from '@/shared/lib/apiError';
import * as modelApi from '@/shared/api/models';
import { EMBED_TIERS, downloadEmbedModel, deleteEmbedModel } from '@/lib/rag/embed';
import { useEmbedDownloaded } from '@/hooks/useEmbedDownloaded';

export const TEXT_ROLES: { key: string; label: string; desc: string }[] = [
  { key: 'main', label: '主模型', desc: '通用生成' },
  { key: 'audit', label: '审核模型', desc: '内容审核' },
  { key: 'router', label: '路由模型', desc: '任务分发' },
  { key: 'tool', label: '工具模型', desc: '工具调用' },
];

export const PROVIDER_TEMPLATES: Record<string, { base_url: string; model_id: string; desc: string }[]> = {
  deepseek: [{ base_url: 'https://api.deepseek.com', model_id: 'deepseek-chat', desc: 'DeepSeek Chat' }],
  ollama: [{ base_url: 'http://localhost:11434/v1', model_id: 'llama3', desc: 'Llama3 (本地)' }],
  openai: [{ base_url: 'https://api.openai.com/v1', model_id: 'gpt-4o', desc: 'GPT-4o' }],
  gemini: [{ base_url: 'https://generativelanguage.googleapis.com/v1', model_id: 'gemini-2.0-flash', desc: 'Gemini 2.0 Flash' }],
  anthropic: [{ base_url: 'https://api.anthropic.com/v1', model_id: 'claude-3-5-sonnet-20240620', desc: 'Claude 3.5 Sonnet' }],
  zhipu: [{ base_url: 'https://open.bigmodel.cn/api/paas/v4', model_id: 'glm-4-plus', desc: 'GLM-4 Plus' }],
  moonshot: [{ base_url: 'https://api.moonshot.cn/v1', model_id: 'moonshot-v1-8k', desc: 'Moonshot v1 8K' }],
  qianfan: [{ base_url: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1', model_id: 'ernie-4.0', desc: 'ERNIE 4.0' }],
  dashscope: [
    { base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model_id: 'qwen-turbo', desc: '通义千问 Turbo' },
  ],
};

export const PROVIDER_LIST = Object.keys(PROVIDER_TEMPLATES);

// 默认模型配置：从 .env.local 注入（gitignored，不提交密钥）。不再硬编码任何 base url / 模型名
// 默认值——env 为空时即空白，由用户在「设置」页自行填写（仅存于浏览器 IndexedDB）。
const MODEL_BASE_URL = process.env.NEXT_PUBLIC_MODEL_BASE_URL || '';
const MODEL_API_KEY = process.env.NEXT_PUBLIC_MODEL_API_KEY || '';
const MODEL_ID = process.env.NEXT_PUBLIC_MODEL_ID || '';
const EMBEDDING_API_KEY = process.env.NEXT_PUBLIC_EMBEDDING_API_KEY || '';

export const DEFAULT_TEXT_ROLES: Record<string, { adapter: string; base_url: string; api_key: string; model_id: string }> = {
  main: { adapter: 'dashscope', base_url: MODEL_BASE_URL, api_key: MODEL_API_KEY, model_id: MODEL_ID },
  audit: { adapter: 'dashscope', base_url: MODEL_BASE_URL, api_key: MODEL_API_KEY, model_id: MODEL_ID },
  router: { adapter: 'dashscope', base_url: MODEL_BASE_URL, api_key: MODEL_API_KEY, model_id: MODEL_ID },
  tool: { adapter: 'dashscope', base_url: MODEL_BASE_URL, api_key: MODEL_API_KEY, model_id: MODEL_ID },
};

export const DEFAULT_EMBEDDING = { adapter: 'dashscope', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', api_key: EMBEDDING_API_KEY, model_id: 'text-embedding-v4' };
export const DEFAULT_SEARCH = { provider: 'bocha', api_key: process.env.NEXT_PUBLIC_SEARCH_API_KEY || '' };
export const DEFAULT_VISION = { adapter: 'openai', base_url: 'https://api.openai.com/v1', api_key: '', model_id: 'gpt-4o' };

export type ModelConfigEntry = { adapter: string; base_url: string; api_key: string; model_id: string };

export function useModelSettings() {
  const [modelConfig, setModelConfig] = useState<Record<string, ModelConfigEntry>>({});
  const [embeddingModel, setEmbeddingModel] = useState<ModelConfigEntry>(DEFAULT_EMBEDDING);
  const [visionModel, setVisionModel] = useState<ModelConfigEntry>(DEFAULT_VISION);
  const [searchConfig, setSearchConfig] = useState(DEFAULT_SEARCH);
  const [testingRole, setTestingRole] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ adapter: '', base_url: '', api_key: '', model_id: '' });
  const [editingEmbedding, setEditingEmbedding] = useState(false);
  const [editingVision, setEditingVision] = useState(false);
  const [embedEditForm, setEmbedEditForm] = useState(DEFAULT_EMBEDDING);
  const [visionEditForm, setVisionEditForm] = useState(DEFAULT_VISION);

  const [embedDownloadId, setEmbedDownloadId] = useState<string | null>(null);
  const [embedDownloading, setEmbedDownloading] = useState(false);
  const [embedProgress, setEmbedProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [embedDeleting, setEmbedDeleting] = useState<string | null>(null);
  const downloadedIds = useEmbedDownloaded();

  useEffect(() => {
    modelApi.fetchModelConfig().then((cfg) => {
      setModelConfig(cfg.textRoleModels || {});
      if (cfg.embeddingModel) setEmbeddingModel(cfg.embeddingModel);
      if (cfg.visionModel) setVisionModel(cfg.visionModel);
      if (cfg.searchConfig) setSearchConfig(cfg.searchConfig);
    }).catch(() => {});
  }, []);

  const persistModelConfig = useCallback(
    async (
      textRoleModels = modelConfig,
      embedModel = embeddingModel,
      vision = visionModel,
      search = searchConfig,
    ) => {
      try {
        await modelApi.saveModelConfig({ textRoleModels, embeddingModel: embedModel, visionModel: vision, searchConfig: search });
        toast.success('已保存');
      } catch (e) {
        showApiError(e, '保存失败');
      }
    },
    [modelConfig, embeddingModel, visionModel, searchConfig],
  );

  const startEditRole = useCallback((key: string) => {
    const existing = modelConfig[key] || DEFAULT_TEXT_ROLES[key];
    setEditForm({ adapter: existing.adapter, base_url: existing.base_url, api_key: existing.api_key, model_id: existing.model_id });
    setEditingRole(key);
  }, [modelConfig]);

  const saveEditRole = useCallback(() => {
    if (!editingRole) return;
    const newModelConfig = { ...modelConfig, [editingRole]: editForm };
    setModelConfig(newModelConfig);
    setEditingRole(null);
    persistModelConfig(newModelConfig);
  }, [editingRole, modelConfig, editForm, persistModelConfig]);

  const handleTestRole = useCallback(async (key: string) => {
    const raw = modelConfig[key] || DEFAULT_TEXT_ROLES[key];
    const cfg = raw as ModelConfigEntry;
    setTestingRole(key);
    try {
      const res = await modelApi.testModelConnection(cfg);
      if (res.ok) {
        toast.success('连接成功', { description: res.content?.slice(0, 60) });
      }
    } catch (e) {
      showApiError(e, '连接失败');
    } finally {
      setTestingRole(null);
    }
  }, [modelConfig]);

  const handleEmbedDownload = useCallback(async (id: string) => {
    setEmbedDownloading(true);
    setEmbedDownloadId(id);
    setEmbedProgress(null);
    try {
      const ok = await downloadEmbedModel(id, (p) => setEmbedProgress(p));
      // 返回 false 表示用户取消（不标记已下载、不提示失败）；true 为下载就绪
      if (ok) toast.success('本地检索模型已就绪，切换精度请前往知识库页面');
    } catch (e) {
      showApiError(e, '下载失败');
    } finally {
      setEmbedDownloading(false);
      setEmbedDownloadId(null);
      setEmbedProgress(null);
    }
  }, []);

  const handleEmbedDelete = useCallback(async (id: string) => {
    setEmbedDeleting(id);
    try {
      await deleteEmbedModel(id);
      toast.success('已删除');
    } catch (e) {
      showApiError(e, '删除失败');
    } finally {
      setEmbedDeleting(null);
    }
  }, []);

  return {
    modelConfig,
    setModelConfig,
    embeddingModel,
    setEmbeddingModel,
    visionModel,
    setVisionModel,
    searchConfig,
    setSearchConfig,
    testingRole,
    editingRole,
    editForm,
    setEditForm,
    editingEmbedding,
    setEditingEmbedding,
    editingVision,
    setEditingVision,
    embedEditForm,
    setEmbedEditForm,
    visionEditForm,
    setVisionEditForm,
    embedDownloadId,
    embedDownloading,
    embedProgress,
    embedDeleting,
    downloadedIds,
    EMBED_TIERS,
    persistModelConfig,
    startEditRole,
    saveEditRole,
    handleTestRole,
    handleEmbedDownload,
    handleEmbedDelete,
  };
}
