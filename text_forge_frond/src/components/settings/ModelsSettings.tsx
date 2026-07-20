// src/components/settings/ModelsSettings.tsx
'use client';

import { useState } from 'react';
import { useModelStore } from '@/lib/stores/modelStore';
import { useSettingsStore } from '@/lib/stores/settingsStore';
import {
  MODEL_TEMPLATES, CATEGORY_LABELS,
} from '@/lib/models/templates';
import type { AuxiliaryModel, ModelCategory, ModelConfig } from '@/types';
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

const CATEGORIES: ModelCategory[] = ['llm', 'vision', 'omni', 'speech', 'embedding'];

export function ModelsSettings({ initialCategory = 'llm' }: { initialCategory?: ModelCategory }) {
  const models = useModelStore((s) => s.models);
  const addModel = useModelStore((s) => s.addModel);
  const updateModel = useModelStore((s) => s.updateModel);
  const removeModel = useModelStore((s) => s.removeModel);
  const setDefault = useModelStore((s) => s.setDefault);
  const setEmbedTierId = useSettingsStore((s) => s.setEmbedTierId);

  const [category, setCategory] = useState<ModelCategory>(initialCategory);
  const [editing, setEditing] = useState<ModelConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'success' | 'error'>>({});

  const list = models.filter((m) => m.category === category);
  const textModels = models.filter((m) => m.category === 'llm');

  const startNew = () => {
    const t = MODEL_TEMPLATES.find((x) => x.category === category)!;
    const extra: Record<string, string | number> = {};
    t.extraFields?.forEach((f) => { if (f.default !== undefined) extra[f.key] = f.default; });
    setEditing({
      id: uid(),
      name: t.vendor,
      category,
      deployment: t.deployment,
      vendor: t.vendor,
      adapter: t.adapter,
      baseUrl: t.defaultBaseUrl,
      apiKey: '',
      modelId: t.defaultModelId,
      isDefault: list.length === 0,
      extra: Object.keys(extra).length ? extra : undefined,
      auxiliary: category === 'llm' ? [] : undefined,
      createdAt: new Date().toISOString(),
    });
    setOpen(true);
  };

  const startEdit = (m: ModelConfig) => {
    setEditing({ ...m, auxiliary: m.auxiliary ? [...m.auxiliary] : (m.category === 'llm' ? [] : undefined) });
    setOpen(true);
  };

  const handleTemplateChange = (key: string) => {
    const t = MODEL_TEMPLATES.find((x) => x.key === key);
    if (!t || !editing) return;
    const extra: Record<string, string | number> = {};
    t.extraFields?.forEach((f) => { if (f.default !== undefined) extra[f.key] = f.default; });
    setEditing({
      ...editing,
      vendor: t.vendor,
      adapter: t.adapter,
      deployment: t.deployment,
      baseUrl: t.defaultBaseUrl ?? editing.baseUrl,
      modelId: t.defaultModelId,
      extra: Object.keys(extra).length ? extra : undefined,
    });
  };

  const save = () => {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error('请填写模型名称'); return; }
    if (!editing.modelId.trim()) { toast.error('请填写模型 ID'); return; }
    const exists = models.some((m) => m.id === editing.id);
    if (exists) updateModel(editing.id, editing);
    else addModel(editing);
    toast.success('已保存模型');
    setOpen(false);
  };

  const remove = (m: ModelConfig) => {
    if (!confirm(`确定删除模型「${m.name}」？`)) return;
    removeModel(m.id);
    toast.success('已删除');
  };

  const testConnection = async (m: ModelConfig) => {
    setTestStatus(s => ({ ...s, [m.id]: 'testing' }));
    try {
      await apiClient.post(`/api/models/test`, {
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

  const handlePatch = (patch: Partial<ModelConfig>) => setEditing((e) => (e ? { ...e, ...patch } : e));
  const handleAddAux = () =>
    setEditing((e) => (e ? { ...e, auxiliary: [...(e.auxiliary ?? []), { id: uid(), role: 'planner', label: '规划', modelRef: textModels[0]?.id ?? '', enabled: true }] } : e));
  const handleUpdateAux = (idx: number, patch: Partial<AuxiliaryModel>) =>
    setEditing((e) => (e ? { ...e, auxiliary: (e.auxiliary ?? []).map((a, i) => (i === idx ? { ...a, ...patch } : a)) } : e));
  const handleRemoveAux = (id: string) =>
    setEditing((e) => (e ? { ...e, auxiliary: (e.auxiliary ?? []).filter((a) => a.id !== id) } : e));

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>模型自定义</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <Button onClick={startNew} size="sm">
            <Plus className="w-4 h-4 mr-1.5" /> 添加模型
          </Button>
        </div>

        {category === 'embedding' && (
          <EmbedModelManager onDownloaded={setEmbedTierId} />
        )}

        {list.length === 0 ? (
          <div className="text-center py-10 rounded-xl border border-dashed border-border/60 text-muted-foreground">
            <p className="text-sm">暂无模型，点击右上角添加</p>
          </div>
        ) : (
          <div className="grid gap-3 stagger">
            {list.map((m) => (
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
                  <Button variant="ghost" size="sm" onClick={() => startEdit(m)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => remove(m)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ModelEditDialog
        editing={editing}
        open={open}
        textModels={textModels}
        onOpenChange={setOpen}
        onPatch={handlePatch}
        onTemplateChange={handleTemplateChange}
        onAddAux={handleAddAux}
        onUpdateAux={handleUpdateAux}
        onRemoveAux={handleRemoveAux}
        onSave={save}
      />
    </Card>
  );
}
