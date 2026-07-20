// src/components/projects/PortfolioGallery.tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/shared/components';
import { EmptyState } from '@/shared/components';
import { fetchProjectPortfolio, type MediaTask } from '@/lib/api/generation';
import { Image as ImageIcon, Clapperboard, Link as LinkIcon, Loader2, Play } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export function PortfolioGallery({ projectId }: { projectId?: string }) {
  const [items, setItems] = useState<MediaTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchProjectPortfolio(projectId)
      .then((list) => { if (active) setItems(list); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  const sorted = [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="space-y-4">
      <PageHeader icon={Clapperboard} title="作品集" description="图片与视频混合时间线" />
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clapperboard className="w-4 h-4 text-primary" /> 全部作品（{sorted.length}）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : sorted.length === 0 ? (
            <EmptyState icon={ImageIcon} title="还没有作品" description="在 AI 绘画 / AI 视频 中生成，作品会自动汇总到这里" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 stagger">
              {sorted.map((it) => (
                <div key={it.id} className="rounded-xl border border-border/40 overflow-hidden bg-background/40">
                  <div className="aspect-square bg-gradient-to-br from-primary/10 to-accent/30 grid place-items-center relative">
                    {it.status === 'processing' || it.status === 'pending' ? (
                      <div className="text-center text-muted-foreground">
                        <Loader2 className="w-6 h-6 mx-auto mb-1 animate-spin opacity-60" />
                        <span className="text-xs">生成中</span>
                      </div>
                    ) : it.status === 'failed' ? (
                      <span className="text-xs text-destructive">失败</span>
                    ) : it.result_url ? (
                      it.kind === 'video' ? (
                        <video src={it.result_url} className="w-full h-full object-cover" controls preload="metadata" />
                      ) : (
                        <Image src={it.result_url} alt={it.prompt} fill className="object-cover" />
                      )
                    ) : (
                      <ImageIcon className="w-6 h-6 opacity-40" />
                    )}
                    {it.kind === 'video' && it.result_url && (
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] bg-black/50 text-white rounded px-1.5 py-0.5">
                        <Play className="w-3 h-3" /> 视频
                      </span>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs truncate">{it.prompt}</p>
                    {it.result_url && (
                      <a href={it.result_url} target="_blank" rel="noopener noreferrer" className={cn('text-xs text-primary hover:underline flex items-center gap-1 mt-1')}>
                        <LinkIcon className="w-3 h-3" /> 查看原文件
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
