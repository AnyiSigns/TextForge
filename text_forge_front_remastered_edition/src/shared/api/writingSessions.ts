import { apiClient } from './client';
import type { WritingSession, WritingStatsSummary } from './types';

export async function createWritingSession(body: { book_id: number; chapter_id?: number; character_ids?: number[] }): Promise<WritingSession> {
  const { data } = await apiClient.post<WritingSession>('/writing-sessions/', body);
  return data;
}

export async function endWritingSession(sessionId: number, body: { words_written: number; duration_seconds: number }): Promise<WritingSession> {
  const { data } = await apiClient.put<WritingSession>(`/writing-sessions/${sessionId}/end`, body);
  return data;
}

export async function fetchWritingSessions(bookId: number, chapterId?: number): Promise<WritingSession[]> {
  const params = new URLSearchParams({ book_id: String(bookId), page_size: '100' });
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
  const { data } = await apiClient.get<{
    session_count: number;
    total_words: number;
    total_duration_seconds: number;
    active_days: number;
  }>(`/writing-sessions/statistics/summary?${params}`);
  return {
    totalWords: data.total_words ?? 0,
    totalSessions: data.session_count ?? 0,
    totalDurationSeconds: data.total_duration_seconds ?? 0,
    activeDays: data.active_days ?? 0,
  };
}
