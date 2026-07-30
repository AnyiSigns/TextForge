// src/app/(dashboard)/settings/sections/AiPrefSection.tsx
'use client';

import { useSettingsStore } from '@/features/settings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EMBED_TIERS, isTierDownloaded, downloadEmbedModel } from '@/lib/rag/embed';
import { useEmbedDownloaded } from '@/lib/hooks/useEmbedDownloaded';
import { toast } from 'sonner';
import { useSettingsStore as useSettingsStoreImport } from '@/features/settings';

export function AiPrefSection() {
  const suggestionFrequency = useSettingsStore((s) => s.suggestionFrequency);
  const setSuggestionFrequency = useSettingsStore((s) => s.setSuggestionFrequency);
  const embedTierId = useSettingsStore((s) => s.embedTierId);
  const setEmbedTierId = useSettingsStoreImport((s) => s.setEmbedTierId);
  const downloadedTiers = useEmbedDownloaded();

  const handleSwitchEmbedTier = (id: string) => {
    const t = EMBED_TIERS.find((x) => x.id === id);
    if (!t) return;
    if (isTierDownloaded(id)) {
      (async () => {
        try {
          const { resetForTier } = await import('@/lib/rag/vectorStore');
          const removed = await resetForTier(id);
          setEmbedTierId(id);
          toast.success(
            removed > 0
              ? `已切换到「${t.label}」，原有 ${removed} 篇文档需重新建库（在「知识库」中一键重建）`
              : `已切换到「${t.label}」`
          );
        } catch {
          toast.error('切换失败，请重试');
        }
      })();
      return;
    }
    const ok = window.confirm(
      `「${t.label}」尚未下载到本机（约 ${t.sizeMB}MB）。\n\n` +
      '确定现在下载吗？下载完成后会自动切到该精度；你已有的文档需要在「知识库」中重新建库一次。'
    );
    if (!ok) return;
    setEmbedTierId(id);
    (async () => {
      try {
        const { resetForTier } = await import('@/lib/rag/vectorStore');
        await resetForTier(id);
        await downloadEmbedModel(id);
        toast.success(`「${t.label}」已下载并启用。请到「知识库」重新建库以检索旧文档`);
      } catch {
        toast.error('下载失败，请重试或选择已下载的精度');
      }
    })();
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>AI 联想设置</CardTitle>
        <CardDescription>控制写作时 AI 建议的触发频率与本地检索精度</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>提示频率</Label>
          <Select
            value={suggestionFrequency}
            onValueChange={(value) => {
              if (value === null) return;
              setSuggestionFrequency(value as 'high' | 'medium' | 'manual');
            }}
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue placeholder="选择频率">
                {(value: string) => {
                  if (value === 'high') return '高频 (0.3秒)';
                  if (value === 'medium') return '均衡 (1.2秒)';
                  if (value === 'manual') return '手动 (Ctrl+Space)';
                  return value;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">高频 (0.3秒)</SelectItem>
              <SelectItem value="medium">均衡 (1.2秒)</SelectItem>
              <SelectItem value="manual">手动 (Ctrl+Space)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>个人文档库检索</Label>
          <p className="text-xs text-muted-foreground">
            个人文档存在你本机浏览器，用本机向量检索，不依赖任何外部服务、完全在本地完成。
            首次使用会下载本地模型，之后离线可用。公共文档库由服务端检索。
          </p>
        </div>
        <div className="space-y-1">
          <Label>检索精度（越高越准，但下载更大）</Label>
          <Select
            value={embedTierId}
            onValueChange={(v) => { if (v) handleSwitchEmbedTier(v); }}
          >
            <SelectTrigger className="max-w-xs">
              <SelectValue placeholder="选择精度">
                {(value: string) => {
                  const t = EMBED_TIERS.find((x) => x.id === value);
                  const dl = isTierDownloaded(value);
                  return t ? `${t.label} · ${t.desc}${dl ? '（已下载）' : ''}` : value;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {EMBED_TIERS.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label} · {t.desc}{downloadedTiers.includes(t.id) ? '（已下载）' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">精度越高，检索越准确，但首次下载会更大，占用更多内存。已下载的精度会保留在本机。</p>
        </div>
      </CardContent>
    </Card>
  );
}

