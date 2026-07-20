// src/components/settings/EmbedModelManager.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Cpu, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  EMBED_TIERS, type EmbedDownloadProgress, deleteEmbedModel, cancelEmbedDownload,
} from '@/lib/rag/embed';
import { useEmbedDownloaded } from '@/lib/hooks/useEmbedDownloaded';

function formatSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toFixed(1)} MB`;
}

interface EmbedModelManagerProps {
  onDownloaded: (id: string) => void;
}

export function EmbedModelManager({ onDownloaded }: EmbedModelManagerProps) {
  const [embedDownloading, setEmbedDownloading] = useState(false);
  const [embedDownloadId, setEmbedDownloadId] = useState<string | null>(null);
  const [embedProgress, setEmbedProgress] = useState<EmbedDownloadProgress | null>(null);
  const [embedDeleting, setEmbedDeleting] = useState<string | null>(null);
  const downloadedIds = useEmbedDownloaded();

  const handleDownloadEmbed = async (id: string) => {
    const tier = EMBED_TIERS.find((t) => t.id === id);
    const name = tier?.label ?? id;
    setEmbedDownloading(true);
    setEmbedDownloadId(id);
    setEmbedProgress(null);
    try {
      const { downloadEmbedModel } = await import('@/lib/rag/embed');
      await downloadEmbedModel(id, (p) => setEmbedProgress(p));
      onDownloaded(id);
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
      toast.success('已删除本地模型');
    } catch {
      toast.error('删除失败');
    } finally {
      setEmbedDeleting(null);
    }
  };

  return (
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
  );
}
