'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchStatisticsSummary, fetchWritingTrend, fetchCharacterFrequency, fetchPlotProgress } from '@/features/projects/api/stats';
import type { WritingTrendPoint, CharacterFrequency, PlotProgress, StatisticsSummary } from '@/features/projects/api/stats';
import { Line, LineChart, Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface StatsTabProps {
  bookId: number;
}

export function StatsTab({ bookId }: StatsTabProps) {
  const [summary, setSummary] = useState<StatisticsSummary | null>(null);
  const [trend, setTrend] = useState<WritingTrendPoint[]>([]);
  const [charFreq, setCharFreq] = useState<CharacterFrequency[]>([]);
  const [plotProgress, setPlotProgress] = useState<PlotProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchStatisticsSummary(bookId),
      fetchWritingTrend(bookId, 30),
      fetchCharacterFrequency(bookId),
      fetchPlotProgress(bookId),
    ])
      .then(([s, t, c, p]) => {
        setSummary(s);
        setTrend(t);
        setCharFreq(c.slice(0, 10));
        setPlotProgress(p);
      })
      .finally(() => setLoading(false));
  }, [bookId]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">加载统计中...</div>;
  }

  if (!summary || !plotProgress) {
    return <div className="flex items-center justify-center h-64 text-xs text-muted-foreground">暂无统计数据</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">总字数</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-semibold">{summary.total_words.toLocaleString()}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">写作会话</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-semibold">{summary.total_sessions}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">总时长</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-semibold">{Math.round(summary.total_duration_seconds / 60)} 分钟</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">连续写作</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-semibold">{summary.streak_days} 天</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">最近30天字数趋势</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="words" stroke="currentColor" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">角色出场频次</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charFreq}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="character_name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="currentColor" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">情节脉络进度</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>完成率</span>
                <span>{Math.round(plotProgress.completion_rate * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-border/60 overflow-hidden">
                <div className="h-full rounded-full bg-primary/80 transition-all" style={{ width: `${plotProgress.completion_rate * 100}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>已完成 {plotProgress.chapters_with_content} / {plotProgress.total_chapters} 章</span>
              </div>
              <div className="space-y-2 pt-2">
                {plotProgress.chapter_details.map((d) => (
                  <div key={d.chapter_id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate">{d.title}</span>
                      <span className="text-muted-foreground">{d.total_words} 字</span>
                    </div>
                  </div>
                ))}
                {plotProgress.chapter_details.length === 0 && (
                  <p className="text-xs text-muted-foreground">暂无情节脉络数据</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
