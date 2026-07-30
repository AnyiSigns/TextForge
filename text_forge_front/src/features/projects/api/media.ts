// src/features/projects/api/media.ts
// 媒体生成 API（图像/视频）。

import apiClient from '@/shared/lib/apiClient';
import type { MediaKind, MediaTask, ImageRequest, VideoRequest, GenerationContext } from '@/types';

export type { MediaKind, MediaTask, ImageRequest, VideoRequest, GenerationContext };

interface MediaTaskResponse {
  task?: Partial<MediaTask>;
}

interface VideoTasksResponse {
  tasks?: Partial<MediaTask>[];
}

interface ImageResultsResponse {
  tasks?: Partial<MediaTask>[];
  results?: Partial<MediaTask>[];
}

interface PortfolioResponse {
  items?: Partial<MediaTask>[];
  tasks?: Partial<MediaTask>[];
}

export async function submitImage(req: ImageRequest): Promise<MediaTask | null> {
  const { data } = await apiClient.post<MediaTaskResponse>('/api/generate/image', req);
  return data?.task as MediaTask | null;
}

export async function submitVideo(req: VideoRequest): Promise<MediaTask | null> {
  const { data } = await apiClient.post<MediaTaskResponse>('/api/video/generate', req);
  return data?.task as MediaTask | null;
}

export async function fetchVideoTasks(): Promise<MediaTask[]> {
  const { data } = await apiClient.get<VideoTasksResponse>('/api/video/tasks');
  return (data.tasks || []).map((t) => ({ ...t, kind: 'video' as const }) as MediaTask);
}

export async function fetchImageResults(bookId?: string): Promise<MediaTask[]> {
  const { data } = await apiClient.get<ImageResultsResponse>('/api/generate/image/results', {
    params: bookId ? { project_id: bookId } : undefined,
  });
  const list = data.tasks || data.results || [];
  return list.map((t) => ({ ...t, kind: 'image' as const }) as MediaTask);
}

export function describeGenError(error: unknown): string {
  const err = error as { code?: string; message?: string };
  if (err?.code === 'ECONNABORTED' || err?.code === 'ERR_NETWORK' || /Failed to fetch|NetworkError|Load failed/i.test(err?.message || '')) {
    return '生成服务未连接（本地模式可用，登录后端后同步）';
  }
  return err?.message || '未知错误';
}

export async function fetchProjectPortfolio(bookId?: string): Promise<MediaTask[]> {
  try {
    const { data } = await apiClient.get<PortfolioResponse>(`/api/books/${bookId}/portfolio`);
    const list = data.items || data.tasks || [];
    if (Array.isArray(list) && list.length) {
      return list.map((t) => ({
        ...t,
        kind: (t.kind as MediaKind) || (t.result_url ? (/\.(mp4|webm|mov)$/i.test(String(t.result_url)) ? 'video' : 'image') : 'image'),
      }) as MediaTask);
    }
  } catch {
    /* 聚合接口未就绪，回退到子接口 */
  }

  const [videos, images] = await Promise.all([
    fetchVideoTasks().catch(() => []),
    fetchImageResults(bookId).catch(() => []),
  ]);
  return [...videos, ...images].filter((t) => t.project_id === bookId);
}