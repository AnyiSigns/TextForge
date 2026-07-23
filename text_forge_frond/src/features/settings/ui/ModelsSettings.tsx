// src/components/settings/ModelsSettings.tsx
'use client';

import { useState } from 'react';
import { useModelStore } from '../stores/modelStore';
import { useSettingsStore } from '../stores/settingsStore';
import {
  MODEL_TEMPLATES, CATEGORY_LABELS, ROLE_LABELS,
} from '../api/templates';
import type { ModelCategory, ModelConfig, ModelRole, RoleModelConfig } from '@/types';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Star, Cloud, Cpu, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { uid } from '@/lib/utils/id';
import { EmbedModelManager } from './EmbedModelManager';
import { ModelEditDialog } from './ModelEditDialog';

const MODEL_ROLES: ModelRole[] = ['main', 'compression', 'router', 'tool'];
const CATEGORIES: ModelCategory[] = ['llm', 'vision', 'omni', 'speech', 'embedding'];

export function ModelsSettings({ initialCategory = 'llm' }: { initialCategory?: ModelCategory }) {
  const models = useModelStore((s) => s.models);
  const textRoleModels = useModelStore((s) => s.textRoleModels);
  const setTextRoleModel = useModelStore((s) => s.setTextRoleModel);
  const addModel = useModelStore((s) => s.addModel);
  const updateModel = useModelStore((s) => s.updateModel);
  const removeModel = useModelStore((s) => s.removeModel);
  const setDefault = useModelStore((s) => s.setDefault);
  const setEmbedTierId = useSettingsStore((s) => s.setEmbedTierId);

  const [category, setCategory] = useState<ModelCategory>(initialCategory);
  const [editingRole, setEditingRole] = useState<ModelRole | null>(null);
  const [editingVision, setEditingVision] = useState<ModelConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'success' | 'error'>>({});

  const visionList = models.filter((m) => m.category === category);

  const startNewRole = (role: ModelRole) => {
    const extra: Record<string, string | number> = {};
    MODEL_TEMPLATES.forEach((t) => {
      t.extraFields?.forEach((f) => { if (f.default !== undefined) extra[f.key] = f.default; });
    });
    setEditingRole(role);
    setEditingVision(null);
    setOpen(true);
  };

  const startEditRole = (role: ModelRole) => {
    setEditingRole(role);
    setEditingVision(null);
    setOpen(true);
  };

  const saveRole = (model: RoleModelConfig) => {
    if (!editingRole) return;
    setTextRoleModel(editingRole, model);
    toast.success(`已保存${ROLE_LABELS[editingRole]}`);
    setOpen(false);
    setEditingRole(null);
  };

  const removeRole = (role: ModelRole) => {
    if (!confirm(`确定删除「${ROLE_LABELS[role]}」配置？`)) return;
    setTextRoleModel(role, null);
    toast.success('已删除');
  };

  const startNewVision = () => {
    const t = MODEL_TEMPLATES.find((x) => x.category === category)!;
    const extra: Record<string, string | number> = {};
    t.extraFields?.forEach((f) => { if (f.default !== undefined) extra[f.key] = f.default; });
    setEditingVision({
      id: uid(),
      name: t.vendor,
      category,
      deployment: t.deployment,
      vendor: t.vendor,
      adapter: t.adapter,
      baseUrl: t.defaultBaseUrl,
      apiKey: '',
      modelId: t.defaultModelId,
      isDefault: visionList.length === 0,
      extra: Object.keys(extra).length ? extra : undefined,
      createdAt: new Date().toISOString(),
    });
    setEditingRole(null);
    setOpen(true);
  };

  const startEditVision = (m: ModelConfig) => {
    setEditingVision(m);
    setEditingRole(null);
    setOpen(true);
  };

  const saveVision = () => {
    if (!editingVision) return;
    if (!editingVision.name.trim()) { toast.error('请填写模型名称'); return; }
    if (!editingVision.modelId.trim()) { toast.error('请填写模型 ID'); return; }
    const exists = models.some((m) => m.id === editingVision.id);
    if (exists) updateModel(editingVision.id, editingVision);
    else addModel(editingVision);
    toast.success('已保存模型');
    setOpen(false);
    setEditingVision(null);
  };

  const removeVision = (m: ModelConfig) => {
    if (!confirm(`确定删除模型「${m.name}」？`)) return;
    removeModel(m.id);
    toast.success('已删除');
  };

  const testConnection = async (m: RoleModelConfig | ModelConfig) => {
    setTestStatus(s => ({ ...s, [m.id]: 'testing' }));
    try {
      await apiClient.post('/api/models/test', {
        adapter: m.adapter,
        baseUrl: m.baseUrl,
        apiKey: m.apiKey,
        modelId: m.modelId,
      });
      setTestStatus(s => ({ ...s, [m.id]: 'success' }));
      toast.success('连接成功');
    } catch {
      setTestStatus(s => ({ ...s, [m.id]: 'error' }));
      toast.error('连接失败');
    }
  };

  const handleTemplateChange = (key: string) => {
    const t = MODEL_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    const extra: Record<string, string | number> = {};
    t.extraFields?.forEach((f) => { if (f.default !== undefined) extra[f.key] = f.default; });
    if (editingRole) {
      setEditingRole(null);
      setEditingVision({
        id: uid(),
        name: t.vendor,
        category: t.category,
        deployment: t.deployment,
        vendor: t.vendor,
        adapter: t.adapter,
        baseUrl: t.defaultBaseUrl ?? '',
        apiKey: '',
        modelId: t.defaultModelId,
        isDefault: false,
        extra: Object.keys(extra).length ? extra : undefined,
        createdAt: new Date().toISOString(),
      });
    } else if (editingVision) {
      setEditingVision({
        ...editingVision,
        vendor: t.vendor,
        adapter: t.adapter,
        category: t.category,
        deployment: t.deployment,
        baseUrl: t.defaultBaseUrl ?? editingVision.baseUrl,
        modelId: t.defaultModelId,
        extra: Object.keys(extra).length ? extra : undefined,
      });
    }
  };

  const handlePatchVision = (patch: Partial<ModelConfig>) => setEditingVision((e) => (e ? { ...e, ...patch } : e));

  const currentEditing: RoleModelConfig | ModelConfig | null = editingRole
    ? textRoleModels[editingRole] ?? {
        id: uid(),
        role: editingRole,
        name: '',
        provider: '',
        adapter: 'openai',
        baseUrl: '',
        apiKey: '',
        modelId: '',
        deployment: 'cloud',
        createdAt: new Date().toISOString(),
      }
    : editingVision;

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>模型配置</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">文本生成模型（最少 1 个主模型，最多 4 个）</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {MODEL_ROLES.map((role) => {
              const m = textRoleModels[role];
              const isMain = role === 'main';
              return (
                <div key={role} className="rounded-xl border border-border/40 bg-background/40 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{ROLE_LABELS[role]}</span>
                    {isMain && <Badge variant="secondary" className="text-[10px]">必须</Badge>}
                  </div>
                  {m ? (
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.provider} · {m.modelId}</p>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => testConnection(m)}>
                          {testStatus[m.id] === 'success' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : testStatus[m.id] === 'error' ? <AlertCircle className="w-3.5 h-3.5 text-destructive" /> : <AlertCircle className="w-3.5 h-3.5" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => startEditRole(role)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {!isMain && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => removeRole(role)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="w-full mt-1" onClick={() => startNewRole(role)}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> 添加
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                category === c ? 'bg-primary/10 text-primary ring-1 ring-primary/15' : 'text-muted-foreground hover:bg-accent/60'
              )}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>

        <div className="flex justify-end">
          <Button onClick={startNewVision} size="sm">
            <Plus className="w-4 h-4 mr-1.5" /> 添加模型
          </Button>
        </div>

        {category === 'embedding' && (
          <EmbedModelManager onDownloaded={setEmbedTierId} />
        )}

        {visionList.length === 0 ? (
          <div className="text-center py-10 rounded-xl border border-dashed border-border/60 text-muted-foreground">
            <p className="text-sm">暂无模型，点击右上角添加</p>
          </div>
        ) : (
          <div className="grid gap-3 stagger">
            {visionList.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3.5 rounded-xl border border-border/40 bg-background/40 hover:bg-background/70 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0">
                    {m.deployment === 'local' ? <Cpu className="w-4 h-4" /> : <Cloud className="w-4 h-4" />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      {m.isDefault && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                      <Badge variant={testStatus[m.id] === 'success' ? 'default' : testStatus[m.id] === 'error' ? 'destructive' : 'secondary'} className="text-xs">
                        {testStatus[m.id] === 'success' && '已连接'}
                        {testStatus[m.id] === 'error' && '连接失败'}
                        {testStatus[m.id] === 'testing' && '测试中'}
                        {testStatus[m.id] === 'idle' && '未测试'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.vendor} · {m.modelId}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => testConnection(m)} disabled={testStatus[m.id] === 'testing'}>
                    {testStatus[m.id] === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  </Button>
                  {!m.isDefault && (
                    <Button variant="ghost" size="sm" onClick={() => setDefault(m.id, m.category)} title="设为默认">
                      <Star className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => startEditVision(m)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => removeVision(m)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <ModelEditDialog
          editing={currentEditing as ModelConfig | null}
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) { setEditingRole(null); setEditingVision(null); }
          }}
          onPatch={handlePatchVision}
          onTemplateChange={handleTemplateChange}
          onSave={editingRole ? () => {
            if (!currentEditing) return;
            const model = currentEditing as RoleModelConfig;
            if (!model.name.trim()) { toast.error('请填写模型名称'); return; }
            if (!model.modelId.trim()) { toast.error('请填写模型 ID'); return; }
            saveRole(model);
          } : saveVision}
        />
      </CardContent>
    </Card>
  );
}
