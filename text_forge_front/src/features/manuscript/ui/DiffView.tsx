'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { fetchDiff } from '@/features/projects/api/chapterContents';
import type { ChapterContentDiff } from '@/types';

interface DiffViewProps {
  chapterId: number;
  fromVersion: number;
  toVersion: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept?: () => void;
  onReject?: () => void;
}

function computeSimpleDiff(oldText: string, newText: string): { type: 'added' | 'removed' | 'unchanged'; text: string }[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: { type: 'added' | 'removed' | 'unchanged'; text: string }[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    if (oldLine === undefined) {
      result.push({ type: 'added', text: newLine });
    } else if (newLine === undefined) {
      result.push({ type: 'removed', text: oldLine });
    } else if (oldLine === newLine) {
      result.push({ type: 'unchanged', text: oldLine });
    } else {
      result.push({ type: 'removed', text: oldLine });
      result.push({ type: 'added', text: newLine });
    }
  }
  return result;
}

export function DiffView({ chapterId, fromVersion, toVersion, open, onOpenChange, onAccept, onReject }: DiffViewProps) {
  const [diff, setDiff] = useState<ChapterContentDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetchDiff(chapterId, fromVersion, toVersion)
      .then(setDiff)
      .catch((e) => setError(e.message || '加载失败'))
      .finally(() => setLoading(false));
  }, [open, chapterId, fromVersion, toVersion]);

  if (!open) return null;

  const lines = diff ? computeSimpleDiff(diff.fromContent, diff.toContent) : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-3xl mx-4 rounded-2xl border border-border/60 bg-background shadow-elegant overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 shrink-0">
          <p className="text-sm font-medium">
            Diff: v{fromVersion} → v{toVersion}
          </p>
          <Button variant="ghost" size="sm" onClick={() => { onOpenChange(false); onReject?.(); }}>关闭</Button>
        </div>
        <div className="flex-1 overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">加载中...</div>
          )}
          {error && (
            <div className="flex items-center justify-center h-64 text-xs text-destructive">{error}</div>
          )}
          {!loading && !error && (
            <ScrollArea className="h-full">
              <div className="p-4 font-mono text-xs leading-relaxed">
                {lines.map((line, idx) => (
                  <div
                    key={idx}
                    className={`flex ${
                      line.type === 'added'
                        ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                        : line.type === 'removed'
                        ? 'bg-red-500/10 text-red-700 dark:text-red-400 line-through'
                        : 'text-foreground'
                    }`}
                  >
                    <span className="w-8 shrink-0 text-right text-muted-foreground select-none mr-3">
                      {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                    </span>
                    <span className="whitespace-pre-wrap break-all">{line.text || ' '}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
        {(onAccept || onReject) && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border/30 shrink-0">
            <p className="text-xs text-muted-foreground">
              绿色=新增，红色删除线=删除
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); onReject?.(); }}>取消</Button>
              {onReject && (
                <Button size="sm" variant="destructive" onClick={() => { onReject?.(); onOpenChange(false); }}>
                  保留旧稿
                </Button>
              )}
              {onAccept && (
                <Button size="sm" onClick={() => { onAccept(); onOpenChange(false); }}>
                  接受新稿
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
