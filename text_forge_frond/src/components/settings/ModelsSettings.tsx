// src/components/settings/ModelsSettings.tsx
'use client';

import { useState, useEffect } from 'react';
import { useModelStore } from '@/lib/stores/modelStore';
import { useSettingsStore } from '@/lib/stores/settingsStore';
import {
  MODEL_TEMPLATES, CATEGORY_LABELS, AUX_ROLE_LABELS,
} from '@/lib/models/templates';
import type { AuxiliaryModel, ModelCategory, ModelConfig } from '@/types';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Star, Cloud, Cpu, X, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/client';
import { EMBED_TIERS, type EmbedDownloadProgress, getDownloadedTiers, deleteEmbedModel, cancelEmbedDownload, initDownloadedTiers } from '@/lib/rag/embed';

function formatSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toFixed(1)} MB`;
}

const CATEGORIES: ModelCategory[] = ['llm', 'vision', 'omni', 'speech', 'embedding'];

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function ModelsSettings() {
  const models = useModelStore((s) => s.models);
  const addModel = useModelStore((s) => s.addModel);
  const updateModel = useModelStore((s) => s.updateModel);
  const removeModel = useModelStore((s) => s.removeModel);
  const setDefault = useModelStore((s) => s.setDefault);
  const setEmbedTierId = useSettingsStore((s) => s.setEmbedTierId);

  const [category, setCategory] = useState<ModelCategory>('llm');
  const [editing, setEditing] = useState<ModelConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'success' | 'error'>>({});

  // 本地向量模型（个人文档库检索）管理
  const [embedDownloading, setEmbedDownloading] = useState(false);
  const [embedDownloadId, setEmbedDownloadId] = useState<string | null>(null);
  const [embedProgress, setEmbedProgress] = useState<EmbedDownloadProgress | null>(null);
  const [embedDeleting, setEmbedDeleting] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<string[]>([]);

  useEffect(() => {
    initDownloadedTiers().then(() => setDownloadedIds(getDownloadedTiers()));
  }, []);

  const refreshDownloaded = () => setDownloadedIds(getDownloadedTiers());

  const handleDownloadEmbed = async (id: string) => {
    const tier = EMBED_TIERS.find((t) => t.id === id);
    const name = tier?.label ?? id;
    setEmbedDownloading(true);
    setEmbedDownloadId(id);
    setEmbedProgress(null);
    try {
      const { downloadEmbedModel } = await import('@/lib/rag/embed');
      await downloadEmbedModel(id, (p) => setEmbedProgress(p));
      setEmbedTierId(id); // 下载即启用该精度，使 AI 偏好/知识库/运行时三者一致
      refreshDownloaded();
      toast.success(`本地向量模型「${name}」已就绪，离线可用`);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      toast.error('模型下载失败', { description: err.message });
    } finally {
      setEmbedDownloading(false);
      setEmbedDownloadId(null);
      setEmbedProgress(null);
    }
  };

  const handleDeleteEmbed = async (id: string) => {
    const tier = EMBED_TIERS.find((t) => t.id === id);
    if (!confirm(`确定删除本地向量模型「${tier?.label ?? id}」？删除后如需使用需重新下载。`)) return;
    setEmbedDeleting(id);
    try {
      await deleteEmbedModel(id);
      refreshDownloaded();
      toast.success('已删除本地模型');
    } catch {
      toast.error('删除失败');
    } finally {
      setEmbedDeleting(null);
    }
  };

  const list = models.filter((m) => m.category === category);

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

  const textModels = models.filter((m) => m.category === 'llm');

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>模型自定义</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 分类行 */}
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
          <div className="rounded-xl border border-border/40 bg-background/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium">本地向量模型（个人文档库检索）</p>
            </div>
            <p className="text-xs text-muted-foreground">
              本地向量模型在本机浏览器下载并缓存，之后离线可用，不依赖任何外部服务。可在「AI 偏好」中切换检索精度；已下载的精度会保留在本机，可随时删除。首次下载约 30~320MB。
            </p>
            <div className="space-y-2">
              {EMBED_TIERS.map((t) => {
                const active = embedDownloadId === t.id;
                const isDownloaded = downloadedIds.includes(t.id);
                return (
                  <div key={t.id} data-testid="embed-tier-row" data-tier-id={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/30 px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{t.label}</p>
                        {isDownloaded && (
                          <Badge variant="secondary" className="text-[10px] shrink-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                            已下载
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">约 {t.sizeMB}MB · {t.desc}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isDownloaded && !active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={embedDeleting === t.id}
                          onClick={() => handleDeleteEmbed(t.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={(embedDownloading && !active) || (!active && embedDownloading)}
                        onClick={() => (active && embedDownloading ? cancelEmbedDownload() : handleDownloadEmbed(t.id))}
                      >
                        {active && embedDownloading ? '取消' : isDownloaded ? '重新下载' : '下载'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            {embedDownloading && embedDownloadId && (
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(embedProgress && embedProgress.total > 0 ? Math.min(100, (embedProgress.loaded / embedProgress.total) * 100) : 0)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                  {embedProgress && embedProgress.total > 0
                    ? `${formatSize(embedProgress.loaded)} / ${formatSize(embedProgress.total)}`
                    : '准备中…'}
                </span>
              </div>
            )}
          </div>
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

      {/* 编辑弹窗 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>{models.some((m) => m.id === editing.id) ? '编辑模型' : '添加模型'}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>厂商 / 模板</Label>
                  <Select value={MODEL_TEMPLATES.find((t) => t.vendor === editing.vendor && t.adapter === editing.adapter)?.key} onValueChange={(v) => handleTemplateChange(v ?? '')}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="选择厂商模板" /></SelectTrigger>
                    <SelectContent>
                      {MODEL_TEMPLATES.filter((t) => t.category === editing.category).map((t) => (
                        <SelectItem key={t.key} value={t.key}>{t.vendor}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>名称</Label>
                    <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="模型显示名" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>模型 ID</Label>
                    <Input value={editing.modelId} onChange={(e) => setEditing({ ...editing, modelId: e.target.value })} placeholder="如 gpt-4o" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>部署方式</Label>
                  <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl">
                    <button onClick={() => setEditing({ ...editing, deployment: 'cloud' })}
                      className={cn('flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-all', editing.deployment === 'cloud' ? 'bg-primary/10 text-primary ring-1 ring-primary/15' : 'text-muted-foreground hover:bg-accent/60')}>
                      <Cloud className="w-4 h-4" /> 云端
                    </button>
                    <button onClick={() => setEditing({ ...editing, deployment: 'local' })}
                      className={cn('flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-all', editing.deployment === 'local' ? 'bg-primary/10 text-primary ring-1 ring-primary/15' : 'text-muted-foreground hover:bg-accent/60')}>
                      <Cpu className="w-4 h-4" /> 本地
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Base URL</Label>
                  <Input value={editing.baseUrl ?? ''} onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })} placeholder="https://" />
                </div>

                <div className="space-y-1.5">
                  <Label>API Key {editing.deployment === 'local' && <span className="text-muted-foreground">(本地可留空)</span>}</Label>
                  <Input type="password" value={editing.apiKey ?? ''} onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })} placeholder="sk-..." />
                </div>

                {/* 模板额外参数 */}
                {MODEL_TEMPLATES.find((t) => t.vendor === editing.vendor && t.adapter === editing.adapter)?.extraFields?.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label>{f.label}</Label>
                    <Input
                      type={f.type === 'number' ? 'number' : 'text'}
                      value={String(editing.extra?.[f.key] ?? '')}
                      onChange={(e) => setEditing({ ...editing, extra: { ...editing.extra, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value } })}
                      placeholder={f.placeholder}
                    />
                  </div>
                ))}

                {/* 辅助模型（仅文本类） */}
                {editing.category === 'llm' && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-muted-foreground">辅助模型（用于规划 / 校对 / 总结等子任务）</Label>
                      <Button variant="outline" size="sm" onClick={() => setEditing({
                        ...editing,
                        auxiliary: [...(editing.auxiliary ?? []), { id: uid(), role: 'planner', label: '规划', modelRef: textModels[0]?.id ?? '', enabled: true }],
                      })}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> 添加
                      </Button>
                    </div>
                    {(editing.auxiliary ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground">暂无辅助模型。可为该主模型挂载其它文本模型承担特定子任务。</p>
                    )}
                    {(editing.auxiliary ?? []).map((aux, idx) => (
                      <div key={aux.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/40 bg-background/40">
                        <Select value={aux.role} onValueChange={(v) => updateAux(editing, setEditing, idx, { role: v as AuxiliaryModel['role'], label: AUX_ROLE_LABELS[v as AuxiliaryModel['role']] })}>
                          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(AUX_ROLE_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={aux.modelRef} onValueChange={(v) => updateAux(editing, setEditing, idx, { modelRef: v ?? '' })}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="选择模型" /></SelectTrigger>
                          <SelectContent>
                            {textModels.map((tm) => (
                              <SelectItem key={tm.id} value={tm.id}>{tm.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Switch checked={aux.enabled} onCheckedChange={(c) => updateAux(editing, setEditing, idx, { enabled: c })} />
                        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setEditing({
                          ...editing,
                          auxiliary: (editing.auxiliary ?? []).filter((a) => a.id !== aux.id),
                        })}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
                <Button onClick={save}>保存</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function updateAux(
  editing: ModelConfig,
  setEditing: (m: ModelConfig) => void,
  idx: number,
  patch: Partial<AuxiliaryModel>,
) {
  const next = [...(editing.auxiliary ?? [])];
  next[idx] = { ...next[idx], ...patch };
  setEditing({ ...editing, auxiliary: next });
}