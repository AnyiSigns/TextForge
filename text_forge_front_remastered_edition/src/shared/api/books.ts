import { apiClient } from './client';
import type { Book, Volume, Chapter, SceneEvent, CreativeSetting, WritingStats, BookContextConfig } from './types';

export async function fetchBooks(): Promise<Book[]> {
  const { data } = await apiClient.get<{ books: Book[] }>('/books/');
  return data.books ?? [];
}

export async function fetchBook(id: number): Promise<Book> {
  const { data } = await apiClient.get<{ book: Book }>(`/books/${id}`);
  return data.book;
}

export async function createBook(body: {
  title: string;
  genre?: string;
  description?: string;
  time_unit?: string;
  epoch_label?: string;
}): Promise<Book> {
  const { data } = await apiClient.post<Book>('/books/', body);
  return data;
}

export async function updateBook(id: number, patch: Partial<Book>): Promise<Book> {
  const { data } = await apiClient.put<Book>(`/books/${id}`, patch);
  return data;
}

export async function deleteBook(id: number): Promise<void> {
  await apiClient.delete(`/books/${id}`);
}

export async function fetchVolumes(bookId: number): Promise<Volume[]> {
  const { data } = await apiClient.get<{ volumes: Volume[] }>(`/books/${bookId}/volumes`);
  return data.volumes ?? [];
}

export async function fetchChaptersTree(bookId: number): Promise<(Volume & { chapters: Chapter[] })[]> {
  const { data } = await apiClient.get<{ volumes: (Volume & { chapters: Chapter[] })[] }>(`/books/${bookId}/chapters`);
  return data.volumes ?? [];
}

export async function createVolume(bookId: number, title: string, summary?: string, sortOrder?: number): Promise<Volume> {
  const { data } = await apiClient.post<Volume>(`/volumes/books/${bookId}`, { title, summary, ...(sortOrder != null ? { sortOrder } : {}) });
  return data;
}

export async function updateVolume(volumeId: number, patch: Partial<Volume>): Promise<Volume> {
  const { data } = await apiClient.put<Volume>(`/volumes/${volumeId}`, patch);
  return data;
}

export async function deleteVolume(volumeId: number): Promise<void> {
  await apiClient.delete(`/volumes/${volumeId}`);
}

export async function createChapter(
  volumeId: number,
  body: { title: string; summary?: string; locked?: boolean; sortOrder?: number },
): Promise<Chapter> {
  const { data } = await apiClient.post<Chapter>(`/chapters/volumes/${volumeId}`, body);
  return data;
}

export async function updateChapter(chapterId: number, patch: Partial<Chapter>): Promise<Chapter> {
  const { data } = await apiClient.put<Chapter>(`/chapters/${chapterId}`, patch);
  return data;
}

export async function fetchOutlineTree(bookId: number): Promise<{ volumes: Volume[]; chapters: Chapter[]; nodes: SceneEvent[] }> {
  const { data } = await apiClient.get<{ volumes: Volume[]; chapters: Chapter[]; nodes: SceneEvent[] }>(`/books/${bookId}/outline-tree`);
  return { volumes: data.volumes ?? [], chapters: data.chapters ?? [], nodes: data.nodes ?? [] };
}

export async function deleteChapter(chapterId: number): Promise<void> {
  await apiClient.delete(`/chapters/${chapterId}`);
}

export async function fetchCreativeSetting(bookId: number): Promise<CreativeSetting> {
  const { data } = await apiClient.get<CreativeSetting>(`/creative-settings/books/${bookId}`);
  return data;
}

export async function updateCreativeSetting(bookId: number, setting: Partial<CreativeSetting>): Promise<CreativeSetting> {
  const { data } = await apiClient.put<CreativeSetting>(`/creative-settings/books/${bookId}`, setting);
  return data;
}

export async function fetchBookContextConfig(bookId: number): Promise<BookContextConfig> {
  const { data } = await apiClient.get<BookContextConfig>(`/books/${bookId}/context-config`);
  return data;
}

export async function saveBookContextConfig(bookId: number, config: Partial<BookContextConfig>): Promise<BookContextConfig> {
  const { data } = await apiClient.put<BookContextConfig>(`/books/${bookId}/context-config`, config);
  return data;
}

export async function fetchWritingStats(bookId: number): Promise<WritingStats> {
  const { data } = await apiClient.get<{
    session_count: number;
    total_words: number;
    total_duration_seconds: number;
    active_days: number;
  }>(`/writing-sessions/statistics/summary?book_id=${bookId}`);
  return {
    summary: {
      totalWords: data.total_words ?? 0,
      totalSessions: data.session_count ?? 0,
      totalDurationSeconds: data.total_duration_seconds ?? 0,
      activeDays: data.active_days ?? 0,
    },
  };
}

export async function fetchWritingTrend(bookId: number, days = 7): Promise<{ date: string; words: number }[]> {
  const { data } = await apiClient.get<{ trend: { date: string; words: number }[] }>(`/writing-sessions/statistics/writing-trend?book_id=${bookId}&days=${days}`);
  return data.trend ?? [];
}
