import { apiClient } from './client';
import type { OutlineNode } from './types';

export async function fetchOutlines(bookId: number): Promise<OutlineNode[]> {
  const { data } = await apiClient.get<{ nodes: OutlineNode[] }>(`/books/${bookId}/outline-tree`);
  return data.nodes ?? [];
}

export async function createOutline(
  bookId: number,
  body: { title: string; content?: string; nodeType?: string; parentId?: number; targetVolumeId?: number; targetChapterId?: number },
): Promise<OutlineNode> {
  const { data } = await apiClient.post<OutlineNode>(`/outlines/books/${bookId}`, body);
  return data;
}

export async function updateOutline(
  bookId: number,
  outlineId: number,
  body: { title?: string; content?: string; nodeType?: string; sortOrder?: number; targetVolumeId?: number; targetChapterId?: number; parentId?: number },
): Promise<OutlineNode> {
  const { data } = await apiClient.put<OutlineNode>(`/outlines/books/${bookId}/${outlineId}`, body);
  return data;
}

export async function deleteOutline(bookId: number, outlineId: number): Promise<void> {
  await apiClient.delete(`/outlines/books/${bookId}/${outlineId}`);
}
