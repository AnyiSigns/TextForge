// src/lib/api/generation.ts
import apiClient from '@/shared/lib/apiClient';
import type { GenerationContext, MediaTask, MediaKind, ImageRequest, VideoRequest } from '@/types';

export type { MediaKind, MediaTask, GenerationContext, ImageRequest, VideoRequest };

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

export async function fetchImageResults(projectId?: string): Promise<MediaTask[]> {
  const { data } = await apiClient.get<ImageResultsResponse>('/api/generate/image/results', {
    params: projectId ? { project_id: projectId } : undefined,
  });
  const list = data.tasks || data.results || [];
  return list.map((t) => ({ ...t, kind: 'image' as const }) as MediaTask);
}

// 把生成提交的错误归类为可读提示：网络不可达 → 提示本地模式/服务未连接
export function describeGenError(error: unknown): string {
  const err = error as { code?: string; message?: string };
  if (err?.code === 'ECONNABORTED' || err?.code === 'ERR_NETWORK' || /Failed to fetch|NetworkError|Load failed/i.test(err?.message || '')) {
    return '生成服务未连接（本地模式可用，登录后端后同步）';
  }
  return err?.message || '未知错误';
}

export async function fetchProjectPortfolio(projectId?: string): Promise<MediaTask[]> {
  try {
    const { data } = await apiClient.get<PortfolioResponse>(`/api/projects/${projectId}/portfolio`);
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
    fetchImageResults(projectId).catch(() => []),
  ]);
  return [...videos, ...images].filter((t) => t.project_id === projectId);
}