// src/components/settings/ModelsSettings.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useModelStore } from '../stores/modelStore';
import { useSettingsStore } from '../stores/settingsStore';
import { EmbedModelManager } from './EmbedModelManager';
import { ModelEditDialog } from './ModelEditDialog';
import type { AdapterType, ModelRole, RoleModelConfig } from '@/types';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Check, AlertCircle, Loader2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';
import { enqueueSync } from '@/lib/storage/syncQueue';

const TEXT_ROLES: ModelRole[] = ['main', 'compression', 'router', 'tool'];

const EMPTY_ROLE: RoleModelConfig = {
  id: '',
  name: '',
  adapter: 'deepseek',
  baseUrl: '',
  apiKey: '',
  modelId: '',
  createdAt: new Date().toISOString(),
};

type RoleStatus = Record<string, RoleModelConfig | null>;

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
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/api/user/models/config');
      const body = data as {
        main_config?: RoleModelConfig;
        compression?: RoleModelConfig | null;
        router_config?: RoleModelConfig | null;
        tool_config?: RoleModelConfig | null;
        vision_config?: RoleModelConfig | null;
        embedding_config?: RoleModelConfig | null;
      } | undefined;
      if (!body) return;

      const roles: RoleStatus = {
        main: body.main_config ?? null,
        compression: body.compression ?? null,
        router: body.router_config ?? null,
        tool: body.tool_config ?? null,
      };

      for (const role of TEXT_ROLES) {
        const cfg = roles[role];
        if (cfg) setTextRoleModel(role, cfg);
      }

      if (body.vision_config) setVisionConfig(body.vision_config);
      if (body.embedding_config) setEmbeddingPublicConfig(body.embedding_config);
    } catch {
      toast.error('模型配置加载失败');
    } finally {
      setLoading(false);
    }
  }, [setTextRoleModel]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const buildRoleState = (role: ModelRole): RoleModelConfig => {
    const current = textRoleModels[role];
    if (current && current.modelId) return current;
    const map: Record<ModelRole, { adapter: AdapterType; baseUrl: string; modelId: string }> = {
      main: { adapter: 'deepseek', baseUrl: 'https://api.deepseek.com', modelId: 'deepseek-chat' },
      compression: { adapter: 'ollama', baseUrl: 'http://localhost:11434/v1', modelId: 'llama3' },
      router: { adapter: 'deepseek', baseUrl: 'https://api.deepseek.com', modelId: 'deepseek-chat' },
      tool: { adapter: 'deepseek', baseUrl: 'https://api.deepseek.com', modelId: 'deepseek-chat' },
    };
    const cfg = map[role];
    const names: Record<ModelRole, string> = { main: 'DeepSeek', compression: 'Ollama (本地)', router: 'DeepSeek', tool: 'DeepSeek' };
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

  const buildPayload = (): Record<string, RoleModelConfig | null> => {
    const store = useModelStore.getState();
    return {
      main_config: store.textRoleModels.main,
      compression: store.textRoleModels.compression,
      router_config: store.textRoleModels.router,
      tool_config: store.textRoleModels.tool,
      vision_config: visionConfig,
      embedding_config: embeddingPublicConfig,
    };
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

      const payload = buildPayload();
      await apiClient.post('/api/user/models/config', payload);
      toast.success('已保存');
      setOpen(false);
      setEditRole(null);
      setEditVision(false);
      setEditEmbedding(false);
    } catch {
      enqueueSync('models', async () => {
        await apiClient.post('/api/user/models/config', buildPayload());
      });
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
        const payload = buildPayload();
        payload[editRole === 'compression' ? 'compression' : editRole === 'router' ? 'router_config' : 'tool_config'] = null;
        await apiClient.post('/api/user/models/config', payload);
      } else if (editVision) {
        setVisionConfig(null);
        await apiClient.post('/api/user/models/config', { ...buildPayload(), vision_config: null });
      } else if (editEmbedding) {
        setEmbeddingPublicConfig(null);
        await apiClient.post('/api/user/models/config', { ...buildPayload(), embedding_config: null });
      }
      toast.success('已删除');
    } catch {
      const key = editRole === 'compression' ? 'compression' : editRole === 'router' ? 'router_config' : editRole === 'tool' ? 'tool_config' : null;
      if (key) {
        enqueueSync('models', async () => {
          await apiClient.post('/api/user/models/config', { ...buildPayload(), [key]: null });
        });
      }
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">文本生成（最少 1 个主模型）</p>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" onClick={() => openDialog('text', 'main')}>
              <Plus className="w-3.5 h-3.5 mr-1" /> 添加模型
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {TEXT_ROLES.map((role) => {
              const m = textRoleModels[role];
              const isMain = role === 'main';
              const display = m && m.modelId ? m : null;
              return (
                <div key={role} className="rounded-xl border border-border/40 bg-background/40 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{label(role)}</span>
                    {isMain && <Badge variant="secondary" className="text-[10px]">必须</Badge>}
                  </div>
                  {display ? (
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium truncate">{display.name || label(role)}</p>
                      <p className="text-xs text-muted-foreground truncate">{display.modelId}</p>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => testConnection(display)}>
                          {testStatus[display.id] === 'success' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : testStatus[display.id] === 'error' ? <AlertCircle className="w-3.5 h-3.5 text-destructive" /> : <AlertCircle className="w-3.5 h-3.5" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openDialog('text', role)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {(() => {
                          const key = role === 'compression' ? 'compression' : role === 'router' ? 'router_config' : role === 'tool' ? 'tool_config' : 'main_config';
                          return (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => {
                              setTextRoleModel(role, null);
                              const payload = buildPayload();
                              payload[key] = null;
                              apiClient.post('/api/user/models/config', payload).catch(() => {
                                enqueueSync('models', async () => {
                                  await apiClient.post('/api/user/models/config', { ...buildPayload(), [key]: null });
                                });
                              });
                              toast.success('已删除');
                            }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="w-full mt-1" onClick={() => openDialog('text', role)}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> {isMain ? '选择模型' : '添加'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">视觉模型（图片/视频）</p>
          </div>
          {visionConfig && visionConfig.modelId ? (
            <div className="rounded-xl border border-border/40 bg-background/40 p-3 space-y-2">
              <p className="text-sm font-medium truncate">{visionConfig.name}</p>
              <p className="text-xs text-muted-foreground truncate">{visionConfig.modelId}</p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => testConnection(visionConfig)}>
                  {testStatus[visionConfig.id] === 'success' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : testStatus[visionConfig.id] === 'error' ? <AlertCircle className="w-3.5 h-3.5 text-destructive" /> : <AlertCircle className="w-3.5 h-3.5" />}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openDialog('vision', null)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => {
                  setVisionConfig(null);
                  apiClient.post('/api/user/models/config', { ...buildPayload(), vision_config: null }).catch(() => {
                    enqueueSync('models', async () => {
                      await apiClient.post('/api/user/models/config', { ...buildPayload(), vision_config: null });
                    });
                  });
                  toast.success('已删除');
                }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => openDialog('vision', null)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> 添加图片/视频模型
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">公共文档库检索模型</p>
          </div>
          {embeddingPublicConfig && embeddingPublicConfig.modelId ? (
            <div className="rounded-xl border border-border/40 bg-background/40 p-3 space-y-2">
              <p className="text-sm font-medium truncate">{embeddingPublicConfig.name}</p>
              <p className="text-xs text-muted-foreground truncate">{embeddingPublicConfig.modelId}</p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => testConnection(embeddingPublicConfig)}>
                  {testStatus[embeddingPublicConfig.id] === 'success' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : testStatus[embeddingPublicConfig.id] === 'error' ? <AlertCircle className="w-3.5 h-3.5 text-destructive" /> : <AlertCircle className="w-3.5 h-3.5" />}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openDialog('embedding', null)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => {
                  setEmbeddingPublicConfig(null);
                  apiClient.post('/api/user/models/config', { ...buildPayload(), embedding_config: null }).catch(() => {
                    enqueueSync('models', async () => {
                      await apiClient.post('/api/user/models/config', { ...buildPayload(), embedding_config: null });
                    });
                  });
                  toast.success('已删除');
                }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => openDialog('embedding', null)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> 添加云端检索模型
            </Button>
          )}
        </div>

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

function label(role: ModelRole): string {
  return { main: '主模型', compression: '轻量模型', router: '路由模型（自动选模型）', tool: '工具模型' }[role];
}
