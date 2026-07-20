// src/components/projects/PortfolioGrid.tsx
'use client';

import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/states';
import { Sparkles, User, BookOpen, Link as LinkIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isSafeMediaUrl } from '@/lib/utils/url';
import { chapterLabel } from '@/lib/utils/chapter';
import { useCharacterStore } from '@/lib/stores/characterStore';
import type { MediaTask } from '@/lib/api/generation';

interface PortfolioGridProps {
  items: MediaTask[];
  mode: 'character' | 'chapter';
  chapterMap: Map<string, { index: number; content: string }>;
  onSetAvatar: (charId: string, url: string) => void;
}

export function PortfolioGrid(props: PortfolioGridProps) {
  const { items, mode, chapterMap, onSetAvatar } = props;
  const characters = useCharacterStore((s) => s.characters);

  if (items.length === 0) {
    return (
      <EmptyState icon={Sparkles} title="暂无作品" description={mode === 'character' ? '本项目的角色立绘将在此展示' : '本项目的章节动画将在此展示'} />
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 stagger">
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border border-border/40 overflow-hidden bg-background/40">
          <div className={cn('bg-gradient-to-br from-primary/20 to-accent/40 dark:from-primary/30 dark:to-accent/50 grid place-items-center', item.kind === 'video' ? 'aspect-video' : 'aspect-square')}>
            {item.status === 'completed' && item.result_url && isSafeMediaUrl(item.result_url) ? (
              item.kind === 'video' ? (
                <video src={item.result_url} className="w-full h-full object-cover" controls />
              ) : (
                <div className="relative w-full h-full">
                  <Image src={item.result_url} alt={item.prompt} fill className="object-cover" />
                </div>
              )
            ) : item.status === 'completed' ? (
              <span className="text-xs text-destructive">来源不可用</span>
            ) : item.status === 'failed' ? (
              <span className="text-xs text-destructive">失败</span>
            ) : (
              <div className="text-center text-muted-foreground">
                {item.kind === 'video' ? <Loader2 className="w-6 h-6 mx-auto mb-1 animate-spin opacity-60" /> : <Loader2 className="w-6 h-6 mx-auto mb-1 animate-spin opacity-60" />}
                <span className="text-xs">{item.status === 'processing' ? `进度 ${item.progress ?? 0}%` : '待生成'}</span>
              </div>
            )}
          </div>
          <div className="p-2.5 space-y-1.5">
            <p className="text-xs truncate">{item.prompt}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant={item.status === 'completed' ? 'default' : item.status === 'failed' ? 'destructive' : 'secondary'}>
                {item.kind === 'video' ? '视频' : '图片'}
              </Badge>
              {item.source === 'character' && (
                <Badge variant="outline" className="gap-1"><User className="w-3 h-3" /> 角色</Badge>
              )}
              {item.source === 'chapter' && item.source_ref && (() => {
                const ch = chapterMap.get(item.source_ref);
                const idx = ch ? ch.index : null;
                return idx ? <Badge variant="outline" className="gap-1"><BookOpen className="w-3 h-3" /> {chapterLabel(undefined, idx - 1, ch?.content).short}</Badge> : <Badge variant="outline" className="gap-1"><BookOpen className="w-3 h-3" /> 章节</Badge>;
              })()}
              {item.status === 'completed' && item.result_url && (
                <a href={item.result_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                  <LinkIcon className="w-3 h-3" /> 查看
                </a>
              )}
              {item.source === 'character' && item.status === 'completed' && item.result_url && (() => {
                const char = characters.find((c) => c.id === item.source_ref);
                return char ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => onSetAvatar(char.id, item.result_url!)}
                  >
                    设为头像
                  </Button>
                ) : null;
              })()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
