'use client';

import { useMemo } from 'react';
import { Card } from '@/shared/ui/card';
import { useBookDetailStore } from '../store';

export function OverviewTab() {
  const book = useBookDetailStore((s) => s.book);
  const chapters = useBookDetailStore((s) => s.chapters);
  const characters = useBookDetailStore((s) => s.characters);
  const writingStats = useBookDetailStore((s) => s.writingStats);
  const writingTrend = useBookDetailStore((s) => s.writingTrend);
  const characterFrequency = useBookDetailStore((s) => s.characterFrequency);
  const plotProgress = useBookDetailStore((s) => s.plotProgress);
  const volumes = useBookDetailStore((s) => s.volumes);

  const totalChapters = useMemo(
    () => chapters.reduce((sum, v) => sum + v.chapters.length, 0) || volumes.length * 4,
    [chapters, volumes],
  );

  const wordGoal = book?.totalWordGoal ?? 0;
  const currentWords = book?.currentWordCount ?? 0;
  const progress = wordGoal > 0 ? Math.min(100, Math.round((currentWords / wordGoal) * 100)) : 0;

  const recentChapters = useMemo(
    () =>
      chapters
        .flatMap((v) => v.chapters.map((ch) => ({ ...ch, volumeTitle: v.title })))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5),
    [chapters],
  );

  const trendDays = writingTrend.length > 0 ? writingTrend : [];
  const maxWords = Math.max(1, ...trendDays.map((d) => d.words));

  const topCharacters = useMemo(() => {
    const charMap = new Map<number, { name: string; count: number }>();
    for (const cf of characterFrequency) {
      const ch = characters.find((c) => c.id === cf.characterId);
      if (ch) charMap.set(cf.characterId, { name: ch.name, count: cf.count });
    }
    return Array.from(charMap.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [characterFrequency, characters]);

  const progressList = useMemo(() => plotProgress.slice(0, 8), [plotProgress]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold mb-1">{book?.title}</h1>
        <p className="text-xs text-muted-foreground">{book?.description || '暂无简介'}</p>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          [currentWords.toLocaleString(), '总字数'],
          [String(totalChapters), '章节'],
          [String(characters.length), '角色'],
          [String(writingStats?.summary?.activeDays ?? 0), '写作天数'],
        ].map(([v, l]) => (
          <Card key={l} className="p-3 text-center">
            <div className="text-lg font-semibold tabular-nums">{v}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{l}</div>
          </Card>
        ))}
      </div>

      {wordGoal > 0 && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>写作进度</span>
            <span>{currentWords.toLocaleString()} / {wordGoal.toLocaleString()} ({progress}%)</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-foreground rounded-full transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">最近章节</div>
          <div className="space-y-1.5">
            {recentChapters.map((ch) => (
              <div
                key={ch.id}
                className="flex items-center gap-3 p-2 rounded-md bg-card border border-border hover:border-foreground/10 cursor-pointer transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{ch.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex gap-2">
                    <span>{ch.volumeTitle}</span>
                    {ch.characterIds?.length > 0 && <span>{ch.characterIds.length} 角色</span>}
                  </div>
                </div>
              </div>
            ))}
            {recentChapters.length === 0 && (
              <div className="text-xs text-muted-foreground p-3 text-center">暂无章节</div>
            )}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {trendDays.length > 0 ? '写作趋势' : ''}
          </div>
          {trendDays.length > 0 ? (
            <div className="flex items-end gap-1 h-20 px-1">
              {trendDays.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div
                    className="w-full bg-foreground/15 rounded-t-sm transition-all"
                    style={{ height: `${Math.max(4, (d.words / maxWords) * 100)}%` }}
                    title={`${d.date}: ${d.words}字`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground p-3 text-center">暂无数据</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">角色出现频率</div>
          {topCharacters.length > 0 ? (
            <div className="space-y-1.5">
              {topCharacters.map((ch) => (
                <div key={ch.id} className="flex items-center justify-between p-2 rounded-md bg-card border border-border">
                  <span className="text-sm truncate">{ch.name}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{ch.count} 次</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground p-3 text-center">暂无数据</div>
          )}
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">情节进度</div>
          {progressList.length > 0 ? (
            <div className="space-y-1.5">
              {progressList.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-md bg-card border border-border">
                  <span className="text-sm truncate">{p.chapterTitle || `章节 ${p.chapterId ?? ''}`}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{p.progress}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground p-3 text-center">暂无数据</div>
          )}
        </div>
      </div>
    </div>
  );
}
