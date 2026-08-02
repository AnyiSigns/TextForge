import { apiClient } from './client';
import type { WritingSession, WritingStatsSummary, WritingTrendPoint, CharacterFrequency, PlotProgress } from './types';

export async function createWritingSession(body: { book_id: number; chapter_id?: number; character_ids?: number[] }): Promise<WritingSession> {
  const { data } = await apiClient.post<WritingSession>('/writing-sessions/', body);
  return data;
}

export async function endWritingSession(sessionId: number, body: { words_written: number; duration_seconds: number }): Promise<WritingSession> {
  const { data } = await apiClient.put<WritingSession>(`/writing-sessions/${sessionId}/end`, body);
  return data;
}

export async function fetchWritingSessions(bookId: number, chapterId?: number): Promise<WritingSession[]> {
  const params = new URLSearchParams({ book_id: String(bookId) });
  if (chapterId) params.set('chapter_id', String(chapterId));
  const { data } = await apiClient.get<{ items: WritingSession[] }>(`/writing-sessions/?${params}`);
  return data.items ?? [];
}

export async function fetchWritingSession(sessionId: number): Promise<WritingSession> {
  const { data } = await apiClient.get<WritingSession>(`/writing-sessions/${sessionId}`);
  return data;
}

export async function deleteWritingSession(sessionId: number): Promise<void> {
  await apiClient.delete(`/writing-sessions/${sessionId}`);
}

export async function fetchWritingSummary(bookId: number, chapterId?: number): Promise<WritingStatsSummary> {
  const params = new URLSearchParams({ book_id: String(bookId) });
  if (chapterId) params.set('chapter_id', String(chapterId));
  const { data } = await apiClient.get<WritingStatsSummary>(`/writing-sessions/statistics/summary?${params}`);
  return data;
}

export async function fetchWritingTrend(bookId: number, days = 7): Promise<WritingTrendPoint[]> {
  const { data } = await apiClient.get<{ trend: WritingTrendPoint[] }>(`/writing-sessions/statistics/writing-trend?book_id=${bookId}&days=${days}`);
  return data.trend ?? [];
}

export async function fetchCharacterFrequency(bookId: number): Promise<CharacterFrequency[]> {
  const { data } = await apiClient.get<{ frequency: CharacterFrequency[] }>(`/writing-sessions/statistics/character-frequency?book_id=${bookId}`);
  return data.frequency ?? [];
}

export async function fetchPlotProgress(bookId: number): Promise<PlotProgress[]> {
  const { data } = await apiClient.get<{ progress: PlotProgress[] }>(`/writing-sessions/statistics/plot-progress?book_id=${bookId}`);
  return data.progress ?? [];
}
