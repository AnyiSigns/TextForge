import { apiClient } from './client';

interface ChapterContentLatest {
  id: number;
  chapterId: number;
  content: string;
  version: number;
  createdAt: string;
}

interface ChapterVersion {
  version: number;
  content: string;
  createdAt: string;
}

interface DiffResult {
  fromVersion: number;
  toVersion: number;
  fromContent: string;
  toContent: string;
}

export async function fetchLatestContent(chapterId: number): Promise<ChapterContentLatest> {
  const { data } = await apiClient.get<ChapterContentLatest>(`/chapter-contents/chapters/${chapterId}/latest`);
  return data;
}

export async function saveContent(chapterId: number, content: string): Promise<ChapterContentLatest> {
  const { data } = await apiClient.post<ChapterContentLatest>(`/chapter-contents/chapters/${chapterId}`, { content });
  return data;
}

export async function fetchContentVersions(chapterId: number): Promise<ChapterVersion[]> {
  const { data } = await apiClient.get<{ contents: ChapterVersion[] }>(`/chapter-contents/chapters/${chapterId}`);
  return data.contents ?? [];
}

export async function fetchVersionDiff(
  chapterId: number,
  fromVersion: number,
  toVersion: number,
): Promise<DiffResult> {
  const { data } = await apiClient.get<DiffResult>(
    `/chapter-contents/chapters/${chapterId}/diff?from_version=${fromVersion}&to_version=${toVersion}`,
  );
  return data;
}
