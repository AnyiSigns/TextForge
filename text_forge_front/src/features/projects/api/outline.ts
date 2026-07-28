import apiClient from '@/shared/lib/apiClient';
import type { OutlineVolume } from '@/lib/storage/backup';

export interface OutlineItem {
  id: number;
  bookId: number;
  data?: OutlineVolume[];
  createdAt: string;
  updatedAt: string;
}

export interface ListOutlinesResponse {
  outlines: OutlineItem[];
}

export async function listOutlines(bookId: number): Promise<OutlineItem[]> {
  const { data } = await apiClient.get<ListOutlinesResponse>(`/api/outlines/books/${bookId}`);
  return data.outlines || [];
}

export async function getOutline(bookId: number, outlineId: number): Promise<OutlineItem | null> {
  const { data } = await apiClient.get<OutlineItem>(`/api/outlines/books/${bookId}/${outlineId}`);
  return data || null;
}

export async function createOutline(bookId: number, data: OutlineVolume[]): Promise<OutlineItem> {
  const { data: result } = await apiClient.post<OutlineItem>(`/api/outlines/books/${bookId}`, { data });
  return result;
}

export async function updateOutline(
  bookId: number,
  outlineId: number,
  data?: OutlineVolume[],
  chapterId?: string,
  summary?: string,
): Promise<OutlineItem> {
  const payload: Record<string, unknown> = {};
  if (data !== undefined) payload.data = data;
  if (chapterId !== undefined) payload.chapterId = chapterId;
  if (summary !== undefined) payload.summary = summary;
  const { data: result } = await apiClient.put<OutlineItem>(`/api/outlines/books/${bookId}/${outlineId}`, payload);
  return result;
}

export async function deleteOutline(bookId: number, outlineId: number): Promise<void> {
  await apiClient.delete(`/api/outlines/books/${bookId}/${outlineId}`);
}
