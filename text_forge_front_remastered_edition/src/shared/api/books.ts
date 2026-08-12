import { apiClient } from './client';
import type { Book, Volume, Chapter, CreativeSetting, BookContextConfig } from './types';

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

// P0-3：改用 PATCH。后端 PATCH /books/{id} 为 exclude_none 语义，
// 局部更新（如改标题/置顶）不会清空未传字段（含 workflow 绑定）。
export async function updateBook(id: number, patch: Partial<Book>): Promise<Book> {
  const { data } = await apiClient.patch<Book>(`/books/${id}`, patch);
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
  // P0-4：不再透传 locked。锁定状态改用专用 lockChapter 接口，
  // 否则 PUT /chapters/{id} 会因后端锁校验（item.locked and not request.locked）误报 409。
  const { locked: _locked, ...rest } = patch;
  const { data } = await apiClient.put<Chapter>(`/chapters/${chapterId}`, rest);
  return data;
}

export interface LockChapterResult {
  id: number;
  locked: boolean;
}

// P0-4：章节锁定/解锁走专用 PATCH 接口（/books/{id}/chapters/{chapter_id}/lock），
// 不受 update_chapter 的锁校验限制，从而支持解锁。
export async function lockChapter(
  bookId: number,
  chapterId: number,
  locked: boolean,
): Promise<LockChapterResult> {
  const { data } = await apiClient.patch<LockChapterResult>(
    `/books/${bookId}/chapters/${chapterId}/lock`,
    { locked },
  );
  return data;
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

export async function saveBookContextConfig(bookId: number, config: Partial<BookContextConfig>): Promise<BookContextConfig> {
  const { data } = await apiClient.put<BookContextConfig>(`/books/${bookId}/context-config`, config);
  return data;
}

