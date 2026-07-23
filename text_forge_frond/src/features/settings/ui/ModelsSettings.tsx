// src/components/settings/ModelsSettings.tsx
'use client';

import { useState, useEffect } from 'react';
import { useModelStore } from '../stores/modelStore';
import { useSettingsStore } from '../stores/settingsStore';
import { EmbedModelManager } from './EmbedModelManager';
import { ModelEditDialog } from './ModelEditDialog';
import type { ModelRole, RoleModelConfig } from '@/types';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Check, AlertCircle } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

const TEXT_ROLES: ModelRole[] = ['main', 'compression', 'router', 'tool'];

export function ModelsSettings() {
  const textRoleModels = useModelStore((s) => s.textRoleModels);
  const setTextRoleModel = useModelStore((s) => s.setTextRoleModel);
  const setEmbedTierId = useSettingsStore((s) => s.setEmbedTierId);

  const [visionConfig, setVisionConfig] = useState<RoleModelConfig | null>(null);
  const [embeddingPublicConfig, setEmbeddingPublicConfig] = useState<RoleModelConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [editRole, setEditRole] = useState<ModelRole | null>(null);
  const [editVision, setEditVision] = useState(false);
  const [editEmbedding, setEditEmbedding] = useState(false);
  const [mode, setMode] = useState<'text' | 'vision' | 'embedding'>('text');
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'success' | 'error'>>({});

  useEffect(() => {
    setVisionConfig({
      id: 'vision-config',
      role: 'main',
      name: '',
      provider: '',
      adapter: 'kling',
      baseUrl: '',
      apiKey: '',
      modelId: '',
      deployment: 'cloud',
      createdAt: new Date().toISOString(),
    });
    setEmbeddingPublicConfig({
      id: 'embedding-public-config',
      role: 'main',
      name: '',
      provider: '',
      adapter: 'openai',
      baseUrl: '',
      apiKey: '',
      modelId: '',
      deployment: 'cloud',
      createdAt: new Date().toISOString(),
    });
  }, []);

  const handleSave = async (model: RoleModelConfig) => {
    const next = { ...model };
    if (editRole) {
      setTextRoleModel(editRole, next);
      const key = editRole === 'main' ? 'main_config' : editRole === 'compression' ? 'compression_config' : editRole === 'router' ? 'router_config' : 'tool_config';
      await syncTextConfig({ [key]: next });
    } else if (editVision) {
      setVisionConfig(next);
      await syncVision(next);
    } else if (editEmbedding) {
      setEmbeddingPublicConfig(next);
      await syncEmbedding(next);
    }
    toast.success('已保存');
    setOpen(false);
    setEditRole(null);
    setEditVision(false);
    setEditEmbedding(false);
  };

  const syncTextConfig = async (payload: Record<string, RoleModelConfig | null>) => {
    try { await apiClient.put('/api/user/models/text-config', payload); } catch { /* swallow */ }
  };
  const syncVision = async (model: RoleModelConfig) => {
    try { await apiClient.put('/api/user/models/vision', { vision_config: model }); } catch { /* swallow */ }
  };
  const syncEmbedding = async (model: RoleModelConfig) => {
    try { await apiClient.put('/api/user/models/embedding', { embedding_public_config: model }); } catch { /* swallow */ }
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

  const currentEditing: RoleModelConfig | null = editRole
    ? (textRoleModels[editRole] ?? buildEmpty(editRole))
    : editVision
      ? visionConfig
      : editEmbedding
        ? embeddingPublicConfig
        : null;

  const openDialog = (editType: 'text' | 'vision' | 'embedding', roleOrNull: ModelRole | null = null) => {
    setMode(editType);
    setEditRole(roleOrNull);
    setEditVision(editType === 'vision');
    setEditEmbedding(editType === 'embedding');
    setOpen(true);
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>模型配置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">以下配置将同步到后端，生成时后端自动决策使用哪个模型。</p>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">文本生成（最少 1 个主模型）</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TEXT_ROLES.map((role) => {
              const m = textRoleModels[role];
              const isMain = role === 'main';
              return (
                <div key={role} className="rounded-xl border border-border/40 bg-background/40 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{label(role)}</span>
                    {isMain && <Badge variant="secondary" className="text-[10px]">必须</Badge>}
                  </div>
                  {m && m.modelId ? (
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium truncate">{m.name || label(role)}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.provider} · {m.modelId}</p>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => testConnection(m)}>
                          {testStatus[m.id] === 'success' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : testStatus[m.id] === 'error' ? <AlertCircle className="w-3.5 h-3.5 text-destructive" /> : <AlertCircle className="w-3.5 h-3.5" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openDialog('text', role)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="w-full mt-1" onClick={() => openDialog('text', role)}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> 添加
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">视觉模型（图片/视频）</p>
          {visionConfig && visionConfig.modelId ? (
            <div className="rounded-xl border border-border/40 bg-background/40 p-3 space-y-2">
              <p className="text-sm font-medium truncate">{visionConfig.name}</p>
              <p className="text-xs text-muted-foreground truncate">{visionConfig.provider} · {visionConfig.modelId}</p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => testConnection(visionConfig)}>
                  {testStatus[visionConfig.id] === 'success' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : testStatus[visionConfig.id] === 'error' ? <AlertCircle className="w-3.5 h-3.5 text-destructive" /> : <AlertCircle className="w-3.5 h-3.5" />}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openDialog('vision', null)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => openDialog('vision', null)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> 添加视觉模型
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">公共文档库向量模型</p>
          {embeddingPublicConfig && embeddingPublicConfig.modelId ? (
            <div className="rounded-xl border border-border/40 bg-background/40 p-3 space-y-2">
              <p className="text-sm font-medium truncate">{embeddingPublicConfig.name}</p>
              <p className="text-xs text-muted-foreground truncate">{embeddingPublicConfig.provider} · {embeddingPublicConfig.modelId}</p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => testConnection(embeddingPublicConfig)}>
                  {testStatus[embeddingPublicConfig.id] === 'success' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : testStatus[embeddingPublicConfig.id] === 'error' ? <AlertCircle className="w-3.5 h-3.5 text-destructive" /> : <AlertCircle className="w-3.5 h-3.5" />}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openDialog('embedding', null)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => openDialog('embedding', null)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> 添加公共向量模型
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">个人文档库向量模型（本地下载）</p>
          <EmbedModelManager onDownloaded={setEmbedTierId} />
        </div>

        {open && currentEditing && (
          <ModelEditDialog
            editing={currentEditing}
            open={open}
            onOpenChange={(v) => { setOpen(v); if (!v) { setEditRole(null); setEditVision(false); setEditEmbedding(false); } }}
            onSave={handleSave}
            mode={mode}
          />
        )}
      </CardContent>
    </Card>
  );
}

function label(role: ModelRole): string {
  return { main: '主模型', compression: '压缩模型', router: '路由模型', tool: '工具调用模型' }[role];
}

function buildEmpty(role: ModelRole): RoleModelConfig {
  const adapter = role === 'main' ? 'deepseek' : role === 'compression' ? 'ollama' : role === 'router' ? 'deepseek' : 'deepseek';
  return {
    id: role === 'main' ? 'main-config' : role === 'compression' ? 'compression-config' : role === 'router' ? 'router-config' : 'tool-config',
    role,
    name: '',
    provider: '',
    adapter,
    baseUrl: '',
    apiKey: '',
    modelId: '',
    deployment: 'cloud',
    createdAt: new Date().toISOString(),
  };
}
