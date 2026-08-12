import { apiClient } from './client';
import type { Location, SceneEvent, Foreshadowing, PlotThread } from './types';

interface PageResult<T> {
  items?: T[];
  total?: number;
}

/**
 * 翻页拉全列表（后端 PageParams.page_size 上限 100）。
 * 初始化器落库去重依赖完整实体清单：只取第一页（原 page_size=100 单次拉取）
 * 在实体数 >100 时去重集不完整，会把已存在实体重复落库。
 */
async function fetchAllPages<T>(path: string, baseParams: Record<string, string | number>): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page += 1) {
    const params = new URLSearchParams({
      ...Object.fromEntries(Object.entries(baseParams).map(([k, v]) => [k, String(v)])),
      page: String(page),
      page_size: '100',
    });
    const { data } = await apiClient.get<T[] | PageResult<T>>(`${path}?${params}`);
    const pageItems = Array.isArray(data) ? data : (data?.items ?? []);
    items.push(...pageItems);
    const total = Array.isArray(data) ? pageItems.length : (data?.total ?? pageItems.length);
    if (items.length >= total || pageItems.length === 0) break;
  }
  return items;
}

export async function fetchLocations(bookId: number): Promise<Location[]> {
  return fetchAllPages<Location>('/world/locations', { book_id: bookId });
}

export async function fetchSceneEvents(bookId: number): Promise<SceneEvent[]> {
  return fetchAllPages<SceneEvent>('/world/timeline-events', { book_id: bookId });
}

export async function fetchForeshadowings(bookId: number, status?: string): Promise<Foreshadowing[]> {
  const params: Record<string, string | number> = { book_id: bookId };
  if (status) params.status = status;
  return fetchAllPages<Foreshadowing>('/world/foreshadowings', params);
}

export async function fetchPlotThreads(bookId: number): Promise<PlotThread[]> {
  return fetchAllPages<PlotThread>('/world/plot-threads', { book_id: bookId });
}

export async function createLocation(body: Partial<Location>): Promise<Location> {
  const { data } = await apiClient.post<Location>('/world/locations', body);
  return data;
}

export async function updateLocation(id: number, body: Partial<Location>, bookId?: number): Promise<Location> {
  const params = bookId ? `?book_id=${bookId}` : '';
  const { data } = await apiClient.put<Location>(`/world/locations/${id}${params}`, body);
  return data;
}

export async function deleteLocation(id: number, bookId: number): Promise<void> {
  await apiClient.delete(`/world/locations/${id}`, { params: { book_id: bookId } });
}

export async function createSceneEvent(body: Partial<SceneEvent>): Promise<SceneEvent> {
  const { data } = await apiClient.post<SceneEvent>('/world/timeline-events', body);
  return data;
}

export async function updateSceneEvent(id: number, body: Partial<SceneEvent>, bookId?: number): Promise<SceneEvent> {
  const params = bookId ? `?book_id=${bookId}` : '';
  const { data } = await apiClient.put<SceneEvent>(`/world/timeline-events/${id}${params}`, body);
  return data;
}

export async function deleteSceneEvent(id: number, bookId: number): Promise<void> {
  await apiClient.delete(`/world/timeline-events/${id}`, { params: { book_id: bookId } });
}

export async function createForeshadowing(body: Partial<Foreshadowing>): Promise<Foreshadowing> {
  const { data } = await apiClient.post<Foreshadowing>('/world/foreshadowings', body);
  return data;
}

export async function updateForeshadowing(id: number, body: Partial<Foreshadowing>, bookId?: number): Promise<Foreshadowing> {
  const params = bookId ? `?book_id=${bookId}` : '';
  const { data } = await apiClient.put<Foreshadowing>(`/world/foreshadowings/${id}${params}`, body);
  return data;
}

export async function deleteForeshadowing(id: number, bookId: number): Promise<void> {
  await apiClient.delete(`/world/foreshadowings/${id}`, { params: { book_id: bookId } });
}

export async function createPlotThread(body: Partial<PlotThread>): Promise<PlotThread> {
  const { data } = await apiClient.post<PlotThread>('/world/plot-threads', body);
  return data;
}

export async function updatePlotThread(id: number, body: Partial<PlotThread>, bookId?: number): Promise<PlotThread> {
  const params = bookId ? `?book_id=${bookId}` : '';
  const { data } = await apiClient.put<PlotThread>(`/world/plot-threads/${id}${params}`, body);
  return data;
}

export async function deletePlotThread(id: number, bookId: number): Promise<void> {
  await apiClient.delete(`/world/plot-threads/${id}`, { params: { book_id: bookId } });
}
