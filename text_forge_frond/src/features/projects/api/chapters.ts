// src/features/projects/api/chapters.ts
// 章节（Chapter）CRUD API。

import apiClient from '@/shared/lib/apiClient';
import type { Chapter, ChapterRequest, ChapterResponse } from '@/types';

export interface ListChaptersResponse {
  chapters: ChapterResponse[];
}

export async function listChapters(volumeId: number): Promise<Chapter[]> {
  const { data } = await apiClient.get<ListChaptersResponse>(`/api/chapters/volumes/${volumeId}`);
  return data.chapters || [];
}

export async function createChapter(volumeId: number, body: ChapterRequest): Promise<Chapter> {
  const { data } = await apiClient.post<ChapterResponse>(`/api/chapters/volumes/${volumeId}`, body);
  return data;
}

export async function updateChapter(chapterId: number, body: ChapterRequest): Promise<Chapter> {
  const { data } = await apiClient.put<ChapterResponse>(`/api/chapters/${chapterId}`, body);
  return data;
}

export async function deleteChapter(chapterId: number): Promise<boolean> {
  const { data } = await apiClient.delete<{ ok: boolean }>(`/api/chapters/${chapterId}`);
  return data.ok ?? false;
}
