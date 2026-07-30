'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { listChapterContents } from '@/features/projects/api/chapterContents';
import type { ChapterContent } from '@/types';

interface VersionHistoryProps {
  chapterId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectVersions: (fromVersion: number, toVersion: number) => void;
}

export function VersionHistory({ chapterId, open, onOpenChange, onSelectVersions }: VersionHistoryProps) {
  const [versions, setVersions] = useState<ChapterContent[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromVer, setFromVer] = useState<number | null>(null);
  const [toVer, setToVer] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listChapterContents(chapterId)
      .then(setVersions)
      .finally(() => setLoading(false));
  }, [open, chapterId]);

  const handleCompare = () => {
    if (fromVer === null || toVer === null) return;
    if (fromVer === toVer) return;
    onSelectVersions(fromVer, toVer);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-80 border-l border-border/60 bg-background shadow-elegant">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <p className="text-sm font-medium">版本历史</p>
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>关闭</Button>
      </div>
      <ScrollArea className="h-[calc(100%-52px)]">
        <div className="p-3 space-y-2">
          {loading && <p className="text-xs text-muted-foreground">加载中...</p>}
          {!loading && versions.length === 0 && (
            <p className="text-xs text-muted-foreground">暂无版本记录</p>
          )}
          {versions.map((v) => (
            <div
              key={v.id}
              className={`rounded-xl border p-3 text-xs cursor-pointer transition-colors ${
                fromVer === v.version || toVer === v.version
                  ? 'border-primary/60 bg-primary/[0.06]'
                  : 'border-border/40 hover:bg-accent/30'
              }`}
              onClick={() => {
                if (fromVer === v.version) {
                  setFromVer(null);
                } else if (toVer === v.version) {
                  setToVer(null);
                } else if (fromVer === null) {
                  setFromVer(v.version);
                } else if (toVer === null) {
                  setToVer(v.version);
                } else {
                  setFromVer(v.version);
                  setToVer(null);
                }
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">v{v.version}</span>
                <span className="text-muted-foreground">{new Date(v.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              <p className="text-muted-foreground mt-1 line-clamp-2">
                {(v.content || '').slice(0, 100) || '（空内容）'}
              </p>
              {(fromVer === v.version || toVer === v.version) && (
                <span className="inline-block mt-1 text-[10px] text-primary">
                  {fromVer === v.version ? '起始版本' : '目标版本'}
                </span>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="absolute bottom-0 left-0 right-0 border-t border-border/30 bg-background p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <span>起始: {fromVer ?? '未选'}</span>
          <span>→</span>
          <span>目标: {toVer ?? '未选'}</span>
        </div>
        <Button
          size="sm"
          className="w-full"
          disabled={fromVer === null || toVer === null || fromVer === toVer}
          onClick={handleCompare}
        >
          对比差异
        </Button>
      </div>
    </div>
  );
}
