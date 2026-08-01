'use client';

import { useState, useEffect, useCallback } from 'react';
import { useModelStore } from '../stores/modelStore';
import { useSettingsStore } from '../stores/settingsStore';
import { EmbedModelManager } from './EmbedModelManager';
import { ModelEditDialog } from './ModelEditDialog';
import { SearchConfigSection } from './SearchConfigSection';
import { VisionModelSection } from './VisionModelSection';
import { EmbeddingModelSection } from './EmbeddingModelSection';
import { TextRoleModelsGrid } from './TextRoleModelsGrid';
import type { AdapterType, ModelRole, RoleModelConfig } from '@/types';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Check, AlertCircle, Loader2 } from 'lucide-react';
import apiClient from '@/shared/lib/apiClient';
import { toast } from 'sonner';

const TEXT_ROLES: ModelRole[] = ['main', 'audit', 'router', 'tool'];

const EMPTY_ROLE: RoleModelConfig = {
  id: '',
  name: '',
  adapter: 'deepseek',
  baseUrl: '',
  apiKey: '',
  modelId: '',
  createdAt: new Date().toISOString(),
};

export function ModelsSettings() {
  const textRoleModels = useModelStore((s) => s.textRoleModels);
  const setTextRoleModel = useModelStore((s) => s.setTextRoleModel);
  const searchConfig = useModelStore((s) => s.searchConfig);
  const setSearchConfig = useModelStore((s) => s.setSearchConfig);
  const setEmbedTierId = useSettingsStore((s) => s.setEmbedTierId);

  const [visionConfig, setVisionConfig] = useState<RoleModelConfig | null>(null);
  const [embeddingPublicConfig, setEmbeddingPublicConfig] = useState<RoleModelConfig | null>(null);

  const [open, setOpen] = useState(false);
  const [editRole, setEditRole] = useState<ModelRole | null>(null);
  const [editVision, setEditVision] = useState(false);
  const [editEmbedding, setEditEmbedding] = useState(false);
  const [mode, setMode] = useState<'text' | 'vision' | 'embedding'>('text');
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'success' | 'error'>>({});
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const store = useModelStore.getState();
      if (store.textRoleModels.main) {
        for (const role of TEXT_ROLES) {
          const cfg = store.textRoleModels[role];
          if (cfg) setTextRoleModel(role, cfg);
        }
      }
      if (store.searchConfig?.api_key) setSearchConfig(store.searchConfig);
    } catch {
      toast.error('模型配置加载失败');
    } finally {
      setLoading(false);
    }
  }, [setTextRoleModel, setSearchConfig]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const buildRoleState = (role: ModelRole): RoleModelConfig => {
    const current = textRoleModels[role];
    if (current && current.modelId) return current;
    const map: Record<ModelRole, { adapter: AdapterType; baseUrl: string; modelId: string }> = {
      main: { adapter: 'deepseek', baseUrl: 'https://api.deepseek.com', modelId: 'deepseek-chat' },
      audit: { adapter: 'ollama', baseUrl: 'http://localhost:11434/v1', modelId: 'llama3' },
      router: { adapter: 'deepseek', baseUrl: 'https://api.deepseek.com', modelId: 'deepseek-chat' },
      tool: { adapter: 'deepseek', baseUrl: 'https://api.deepseek.com', modelId: 'deepseek-chat' },
    };
    const names: Record<ModelRole, string> = { main: 'DeepSeek', audit: 'Ollama (本地)', router: 'DeepSeek', tool: 'DeepSeek' };
    const cfg = map[role];
    return {
      id: `${role}-config`,
      name: names[role],
      adapter: cfg.adapter,
      baseUrl: cfg.baseUrl,
      apiKey: '',
      modelId: cfg.modelId,
      createdAt: new Date().toISOString(),
    };
  };

  const currentEditing: RoleModelConfig | null = editRole
    ? (textRoleModels[editRole] ?? buildRoleState(editRole))
    : editVision
      ? (visionConfig ?? EMPTY_ROLE)
      : editEmbedding
        ? (embeddingPublicConfig ?? EMPTY_ROLE)
        : null;

  const openDialog = (editType: 'text' | 'vision' | 'embedding', roleOrNull: ModelRole | null = null) => {
    setMode(editType);
    setEditRole(roleOrNull);
    setEditVision(editType === 'vision');
    setEditEmbedding(editType === 'embedding');
    setOpen(true);
  };

  const handleSave = async (model: RoleModelConfig) => {
    try {
      if (editRole) {
        setTextRoleModel(editRole, model);
      } else if (editVision) {
        setVisionConfig(model);
      } else if (editEmbedding) {
        setEmbeddingPublicConfig(model);
      }

      toast.success('已保存');
      setOpen(false);
      setEditRole(null);
      setEditVision(false);
      setEditEmbedding(false);
    } catch {
      toast.error('保存失败，将稍后重试');
    }
  };

  const handleDelete = async () => {
    try {
      if (editRole) {
        if (editRole === 'main') {
          toast.error('主模型不能删除');
          return;
        }
        setTextRoleModel(editRole, null);
      } else if (editVision) {
        setVisionConfig(null);
      } else if (editEmbedding) {
        setEmbeddingPublicConfig(null);
      }
      toast.success('已删除');
    } catch {
      toast.error('删除失败，将稍后重试');
    }
    setOpen(false);
    setEditRole(null);
    setEditVision(false);
    setEditEmbedding(false);
  };

  const testConnection = async (m: RoleModelConfig) => {
    setTestStatus(s => ({ ...s, [m.id]: 'testing' }));
    try {
      await apiClient.post('/api/models/test', { adapter: m.adapter, baseUrl: m.baseUrl, apiKey: m.apiKey, modelId: m.modelId });
      setTestStatus(s => ({ ...s, [m.id]: 'success' }));
      toast.success('连接成功');
    } catch {
      setTestStatus(s => ({ ...s, [m.id]: 'error' }));
      toast.error('连接失败');
    }
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardHeader><CardTitle>模型配置</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">加载中…</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>模型配置</CardTitle>
        <Button size="sm" variant="outline" onClick={() => fetchConfig()} disabled={loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          <span className="ml-1">已从服务器加载</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">设置将自动保存，生成时系统自动选用。</p>

        <TextRoleModelsGrid
          textRoleModels={textRoleModels}
          testStatus={testStatus}
          onEdit={(role) => openDialog('text', role)}
          onDelete={(role, key) => {
          setTextRoleModel(role, null);
          toast.success('已删除');
        }}
          onTest={testConnection}
          onAdd={(role) => openDialog('text', role)}
        />

        <VisionModelSection
          visionConfig={visionConfig}
          testStatus={testStatus}
          onEdit={() => openDialog('vision', null)}
          onDelete={() => {
            setVisionConfig(null);
            toast.success('已删除');
          }}
          onTest={testConnection}
          onAdd={() => openDialog('vision', null)}
        />

        <EmbeddingModelSection
          embeddingPublicConfig={embeddingPublicConfig}
          testStatus={testStatus}
          onEdit={() => openDialog('embedding', null)}
          onDelete={() => {
            setEmbeddingPublicConfig(null);
            toast.success('已删除');
          }}
          onTest={testConnection}
          onAdd={() => openDialog('embedding', null)}
        />

        <SearchConfigSection
          searchConfig={searchConfig}
          onChange={(apiKey) => {
            setSearchConfig(apiKey ? { api_key: apiKey, provider: 'bocha' } : null);
          }}
        />

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">个人文档检索模型（本机下载）</p>
          <EmbedModelManager onDownloaded={setEmbedTierId} />
        </div>

        {open && currentEditing && (
          <ModelEditDialog
            editing={currentEditing}
            open={open}
            onOpenChange={(v) => { setOpen(v); if (!v) { setEditRole(null); setEditVision(false); setEditEmbedding(false); } }}
            onSave={handleSave}
            {...(editRole === 'main' ? {} : { onDelete: handleDelete })}
            mode={mode}
          />
        )}
      </CardContent>
    </Card>
  );
}