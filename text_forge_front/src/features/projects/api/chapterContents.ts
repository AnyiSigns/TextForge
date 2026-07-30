// src/features/projects/api/chapterContents.ts
// 章节内容（ChapterContent）CRUD API。

import apiClient from '@/shared/lib/apiClient';
import type { ChapterContent, ChapterContentRequest, ChapterContentResponse, ChapterContentDiff } from '@/types';

export type { ChapterContent, ChapterContentRequest };

export interface ListChapterContentsResponse {
  contents: ChapterContentResponse[];
}

export async function listChapterContents(chapterId: number): Promise<ChapterContent[]> {
  const { data } = await apiClient.get<ListChapterContentsResponse>(`/api/chapter-contents/chapters/${chapterId}`);
  return data.contents || [];
}

export async function getLatestChapterContent(chapterId: number): Promise<ChapterContent | null> {
  const { data } = await apiClient.get<ChapterContentResponse>(`/api/chapter-contents/chapters/${chapterId}/latest`);
  return data || null;
}

export async function createChapterContent(chapterId: number, body: ChapterContentRequest): Promise<ChapterContent> {
  const { data } = await apiClient.post<ChapterContentResponse>(`/api/chapter-contents/chapters/${chapterId}`, body);
  return data;
}

export async function fetchDiff(chapterId: number, fromVersion: number, toVersion: number): Promise<ChapterContentDiff> {
  const { data } = await apiClient.get<ChapterContentDiff>(`/api/chapter-contents/chapters/${chapterId}/diff`, {
    params: { from_version: fromVersion, to_version: toVersion },
  });
  return data;
}
