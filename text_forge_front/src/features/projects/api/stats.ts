// src/features/projects/api/stats.ts
// 写作统计 API。

import apiClient from '@/shared/lib/apiClient';

export interface WritingTrendPoint {
  date: string;
  words: number;
  sessions: number;
}

export interface CharacterFrequency {
  character_id: number;
  character_name: string;
  count: number;
}

export interface PlotProgress {
  outline_node_id: number;
  title: string;
  completed: boolean;
  progress: number;
}

export interface StatisticsSummary {
  total_words: number;
  total_sessions: number;
  total_duration_seconds: number;
  average_words_per_session: number;
  streak_days: number;
}

export async function fetchStatisticsSummary(bookId: number, chapterId?: number): Promise<StatisticsSummary> {
  const params = new URLSearchParams({ book_id: String(bookId) });
  if (chapterId !== undefined) params.set('chapter_id', String(chapterId));
  const { data } = await apiClient.get<StatisticsSummary>('/api/writing-sessions/statistics/summary', { params });
  return data;
}

export async function fetchWritingTrend(bookId: number, days = 30): Promise<WritingTrendPoint[]> {
  const { data } = await apiClient.get<{ trend: WritingTrendPoint[] }>('/api/writing-sessions/statistics/writing-trend', {
    params: { book_id: String(bookId), days: String(days) },
  });
  return data.trend ?? [];
}

export async function fetchCharacterFrequency(bookId: number): Promise<CharacterFrequency[]> {
  const { data } = await apiClient.get<{ frequency: CharacterFrequency[] }>('/api/writing-sessions/statistics/character-frequency', {
    params: { book_id: String(bookId) },
  });
  return data.frequency ?? [];
}

export async function fetchPlotProgress(bookId: number): Promise<PlotProgress[]> {
  const { data } = await apiClient.get<{ progress: PlotProgress[] }>('/api/writing-sessions/statistics/plot-progress', {
    params: { book_id: String(bookId) },
  });
  return data.progress ?? [];
}
