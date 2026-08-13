'use client';

import { Cpu, Wifi, MessageSquareText, Search, Database, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/shared/ui/card';
import { TextInput } from '@/shared/ui/TextInput';
import { Button } from '@/shared/ui/Button';
import { cancelEmbedDownload } from '@/lib/rag/embed';
import {
  useModelSettings,
  TEXT_ROLES,
  PROVIDER_TEMPLATES,
  PROVIDER_LIST,
  DEFAULT_TEXT_ROLES,
} from '@/features/settings/hooks/useModelSettings';

export function ModelTab() {
  const {
    modelConfig,
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
  } = useModelSettings();

  const pickTemplate = (form: { adapter: string; base_url: string; model_id: string; api_key: string }, provider: string) => {
    const templates = PROVIDER_TEMPLATES[provider] || [];
    const tpl = templates[0] || { base_url: '', model_id: '' };
    return { ...form, adapter: provider, base_url: tpl.base_url, model_id: tpl.model_id };
  };

  return (
    <div className="space-y-5">
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquareText size={14} strokeWidth={1.8} className="text-muted-foreground" />
          <div>
            <div className="text-xs font-medium">文本模型</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">各角色使用的 LLM 配置，生成前按角色取用，编辑保存后自动持久到本地</div>
          </div>
        </div>
        <div className="space-y-2">
          {TEXT_ROLES.map((role) => {
            const cfg = modelConfig[role.key] || DEFAULT_TEXT_ROLES[role.key];
            const isEditing = editingRole === role.key;
            return (
              <div key={role.key} className="rounded-lg border border-border/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium">{role.label}</div>
                    <div className="text-[10px] text-muted-foreground">{role.desc} · {cfg.adapter} / {cfg.model_id}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="secondary" size="xs" type="button" onClick={() => handleTestRole(role.key)} disabled={testingRole === role.key} className="flex items-center gap-1">
                      <Wifi size={10} /> {testingRole === role.key ? '测试中...' : '测试'}
                    </Button>
                    <Button variant="secondary" size="xs" type="button" onClick={() => isEditing ? saveEditRole() : startEditRole(role.key)}>
                      {isEditing ? '保存' : '编辑'}
                    </Button>
                  </div>
                </div>
                {isEditing && (
                  <div className="space-y-2">
                    <select value={editForm.adapter} onChange={(e) => setEditForm(pickTemplate(editForm, e.target.value))}
                      className="w-full h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none">
                      {PROVIDER_LIST.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <TextInput value={editForm.base_url} onChange={(e) => setEditForm({ ...editForm, base_url: e.target.value })}
                        placeholder="base_url" size="sm" />
                      <TextInput value={editForm.model_id} onChange={(e) => setEditForm({ ...editForm, model_id: e.target.value })}
                        placeholder="model_id" size="sm" />
                      <TextInput value={editForm.api_key} onChange={(e) => setEditForm({ ...editForm, api_key: e.target.value })}
                        placeholder="api_key" type="password" size="sm" className="col-span-2" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Search size={14} strokeWidth={1.8} className="text-muted-foreground" />
          <div>
            <div className="text-xs font-medium">搜索配置</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">用于 Agent 的实时网页搜索（检索外部资料辅助创作）</div>
          </div>
        </div>
        <div className="rounded-lg border border-border/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium">{searchConfig.provider || 'bocha'}</div>
              <div className="text-[10px] text-muted-foreground">博查 Bocha · 网页搜索 API</div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="secondary" size="xs" type="button" onClick={() => {
                if (searchConfig.api_key.trim()) {
                  persistModelConfig();
                  toast.success('搜索配置已保存');
                } else {
                  toast.error('请输入搜索 API key');
                }
              }}>
                保存
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <TextInput value={searchConfig.api_key} onChange={(e) => setSearchConfig({ ...searchConfig, api_key: e.target.value })}
              placeholder="博查 api_key" type="password" size="sm" />
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Database size={14} strokeWidth={1.8} className="text-muted-foreground" />
          <div>
            <div className="text-xs font-medium">Embedding 模型</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">用于个人文档向量检索，生成时自动调用</div>
          </div>
        </div>
        <div className="rounded-lg border border-border/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium">{embeddingModel.adapter}</div>
              <div className="text-[10px] text-muted-foreground">{embeddingModel.base_url} · {embeddingModel.model_id}</div>
            </div>
            <Button variant="secondary" size="xs" type="button" onClick={() => setEditingEmbedding(!editingEmbedding)}>
              {editingEmbedding ? '保存' : '编辑'}
            </Button>
          </div>
          {editingEmbedding && (
            <div className="space-y-2">
              <select value={embedEditForm.adapter} onChange={(e) => setEmbedEditForm(pickTemplate(embedEditForm, e.target.value))}
                className="w-full h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none">
                {['dashscope', 'cohere', 'huggingface', 'baidu'].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <TextInput value={embedEditForm.model_id} onChange={(e) => setEmbedEditForm({ ...embedEditForm, model_id: e.target.value })}
                  placeholder="model_id" size="sm" />
                <TextInput value={embedEditForm.api_key} onChange={(e) => setEmbedEditForm({ ...embedEditForm, api_key: e.target.value })}
                  placeholder="api_key" type="password" size="sm" />
              </div>
              <p className="text-[10px] text-muted-foreground/60">Embedding 服务商端点固定，无需配置 base_url（dashscope/cohere/百度均由官方 SDK 直连）</p>
              <Button type="button" size="sm" onClick={() => { setEmbeddingModel(embedEditForm); setEditingEmbedding(false); persistModelConfig(modelConfig, embedEditForm); }}>
                保存
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Cpu size={14} className="text-muted-foreground" />
          <div>
            <div className="text-xs font-medium">本地检索模型</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">下载后保存在浏览器中，断网也能检索个人文档。精度切换请前往<span className="text-foreground font-medium">知识库</span>页面。</div>
          </div>
        </div>
        <div className="space-y-2">
          {EMBED_TIERS.map((t) => {
            const active = embedDownloadId === t.id;
            const isDownloaded = downloadedIds.includes(t.id);
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/30 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium truncate">{t.label}</p>
                    {isDownloaded && (
                      <span className="text-[10px] text-emerald-600 border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 rounded-full shrink-0">已下载</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">约 {t.sizeMB}MB · {t.desc}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isDownloaded && (
                    <Button variant="secondary" size="xs" type="button" onClick={() => handleEmbedDelete(t.id)} disabled={embedDeleting === t.id} className="text-destructive">
                      {embedDeleting === t.id ? '删除中...' : '删除'}
                    </Button>
                  )}
                  <Button variant="secondary" size="xs" type="button" onClick={() => (active && embedDownloading ? cancelEmbedDownload() : handleEmbedDownload(t.id))}
                    disabled={(embedDownloading && !active) || (!active && embedDownloading)}>
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
              <div className="h-full bg-foreground transition-all"
                style={{ width: `${embedProgress && embedProgress.total > 0 ? Math.min(100, (embedProgress.loaded / embedProgress.total) * 100) : 0}%` }} />
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
              {embedProgress && embedProgress.total > 0
                ? `${(embedProgress.loaded / 1024 / 1024).toFixed(1)} / ${(embedProgress.total / 1024 / 1024).toFixed(1)} MB`
                : '准备中…'}
            </span>
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles size={14} strokeWidth={1.8} className="text-muted-foreground" />
          <div>
            <div className="text-xs font-medium">图像生成模型</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">用于 AI 绘画，选择支持的图像生成服务</div>
          </div>
        </div>
        <div className="rounded-lg border border-border/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium">{visionModel.adapter}</div>
              <div className="text-[10px] text-muted-foreground">{visionModel.base_url} · {visionModel.model_id}</div>
            </div>
            <Button variant="secondary" size="xs" type="button" onClick={() => setEditingVision(!editingVision)}>
              {editingVision ? '保存' : '编辑'}
            </Button>
          </div>
          {editingVision && (
            <div className="space-y-2">
              <select value={visionEditForm.adapter} onChange={(e) => setVisionEditForm(pickTemplate(visionEditForm, e.target.value))}
                className="w-full h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none">
                {['openai', 'stability', 'replicate', 'modelslab', 'pollinations'].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <TextInput value={visionEditForm.base_url} onChange={(e) => setVisionEditForm({ ...visionEditForm, base_url: e.target.value })}
                  placeholder="base_url" size="sm" />
                <TextInput value={visionEditForm.model_id} onChange={(e) => setVisionEditForm({ ...visionEditForm, model_id: e.target.value })}
                  placeholder="model_id" size="sm" />
                <TextInput value={visionEditForm.api_key} onChange={(e) => setVisionEditForm({ ...visionEditForm, api_key: e.target.value })}
                  placeholder="api_key" type="password" size="sm" className="col-span-2" />
              </div>
              <Button type="button" size="sm" onClick={() => { setVisionModel(visionEditForm); setEditingVision(false); persistModelConfig(modelConfig, embeddingModel, visionEditForm); }}>
                保存
              </Button>
            </div>
          )}
        </div>
      </Card>

      <p className="text-[10px] leading-relaxed text-muted-foreground/70">
        API Key 等模型配置仅保存在你的本地浏览器中，不会上传到平台服务器。请遵守各模型服务商的使用条款与内容政策，并妥善保管你的凭据。
      </p>
    </div>
  );
}
