import { apiClient } from './client';
import type { Location, SceneEvent, Foreshadowing, PlotThread } from './types';

export async function fetchLocations(bookId: number): Promise<Location[]> {
  const { data } = await apiClient.get<Location[] | { items: Location[] }>(`/world/locations?book_id=${bookId}&page_size=100`);
  if (Array.isArray(data)) return data;
  if (data?.items) return data.items;
  return [];
}

function unwrapItems<T>(data: T[] | { items: T[] } | null | undefined): T[] {
  if (Array.isArray(data)) return data;
  if (data && 'items' in data && Array.isArray(data.items)) return data.items;
  return [];
}

export async function fetchSceneEvents(bookId: number): Promise<SceneEvent[]> {
  const { data } = await apiClient.get<SceneEvent[] | { items: SceneEvent[] }>(`/world/timeline-events?book_id=${bookId}&page_size=100`);
  return unwrapItems(data);
}

export async function fetchForeshadowings(bookId: number, status?: string): Promise<Foreshadowing[]> {
  const params = new URLSearchParams({ book_id: String(bookId), page_size: '100' });
  if (status) params.set('status', status);
  const { data } = await apiClient.get<Foreshadowing[] | { items: Foreshadowing[] }>(`/world/foreshadowings?${params}`);
  return unwrapItems(data);
}

export async function fetchPlotThreads(bookId: number): Promise<PlotThread[]> {
  const { data } = await apiClient.get<PlotThread[] | { items: PlotThread[] }>(`/world/plot-threads?book_id=${bookId}&page_size=100`);
  return unwrapItems(data);
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
