// src/app/(dashboard)/settings/sections/AiPrefSection.tsx
'use client';

import { useSettingsStore } from '@/features/settings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EMBED_TIERS, isTierDownloaded } from '@/lib/rag/embed';
import { useEmbedDownloaded } from '@/lib/hooks/useEmbedDownloaded';

interface AiPrefSectionProps {
  onSwitchEmbedTier: (id: string) => void;
}

export function AiPrefSection({ onSwitchEmbedTier }: AiPrefSectionProps) {
  const suggestionFrequency = useSettingsStore((s) => s.suggestionFrequency);
  const setSuggestionFrequency = useSettingsStore((s) => s.setSuggestionFrequency);
  const embedTierId = useSettingsStore((s) => s.embedTierId);
  const downloadedTiers = useEmbedDownloaded();

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
          <Label>检索精度（向量维度）</Label>
          <Select
            value={embedTierId}
            onValueChange={(v) => { if (v) onSwitchEmbedTier(v); }}
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
          <p className="text-[10px] text-muted-foreground">更高维度检索更准，但首次下载模型更大、更占内存。已下载的精度会保留在本机，可在「模型 → 向量模型」中删除。</p>
        </div>
      </CardContent>
    </Card>
  );
}
