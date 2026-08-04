import { apiClient } from './client';
import type { Location, SceneEvent, Foreshadowing, PlotThread } from './types';

export async function fetchLocations(bookId: number): Promise<Location[]> {
  const { data } = await apiClient.get<Location[]>(`/world/locations?book_id=${bookId}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchSceneEvents(bookId: number): Promise<SceneEvent[]> {
  const { data } = await apiClient.get<SceneEvent[]>(`/world/timeline-events?book_id=${bookId}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchForeshadowings(bookId: number, status?: string): Promise<Foreshadowing[]> {
  const params = new URLSearchParams({ book_id: String(bookId) });
  if (status) params.set('status', status);
  const { data } = await apiClient.get<Foreshadowing[]>(`/world/foreshadowings?${params}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchPlotThreads(bookId: number): Promise<PlotThread[]> {
  const { data } = await apiClient.get<PlotThread[]>(`/world/plot-threads?book_id=${bookId}`);
  return Array.isArray(data) ? data : [];
}

export async function createLocation(body: Partial<Location>): Promise<Location> {
  const { data } = await apiClient.post<Location>('/world/locations', body);
  return data;
}

export async function updateLocation(id: number, body: Partial<Location>): Promise<Location> {
  const { data } = await apiClient.put<Location>(`/world/locations/${id}`, body);
  return data;
}

export async function deleteLocation(id: number, bookId: number): Promise<void> {
  await apiClient.delete(`/world/locations/${id}`, { params: { book_id: bookId } });
}

export async function createSceneEvent(body: Partial<SceneEvent>): Promise<SceneEvent> {
  const { data } = await apiClient.post<SceneEvent>('/world/timeline-events', body);
  return data;
}

export async function updateSceneEvent(id: number, body: Partial<SceneEvent>): Promise<SceneEvent> {
  const { data } = await apiClient.put<SceneEvent>(`/world/scene-events/${id}`, body);
  return data;
}

export async function deleteSceneEvent(id: number, bookId: number): Promise<void> {
  await apiClient.delete(`/world/scene-events/${id}`, { params: { book_id: bookId } });
}

export async function createForeshadowing(body: Partial<Foreshadowing>): Promise<Foreshadowing> {
  const { data } = await apiClient.post<Foreshadowing>('/world/foreshadowings', body);
  return data;
}

export async function updateForeshadowing(id: number, body: Partial<Foreshadowing>): Promise<Foreshadowing> {
  const { data } = await apiClient.put<Foreshadowing>(`/world/foreshadowings/${id}`, body);
  return data;
}

export async function deleteForeshadowing(id: number, bookId: number): Promise<void> {
  await apiClient.delete(`/world/foreshadowings/${id}`, { params: { book_id: bookId } });
}

export async function createPlotThread(body: Partial<PlotThread>): Promise<PlotThread> {
  const { data } = await apiClient.post<PlotThread>('/world/plot-threads', body);
  return data;
}

export async function updatePlotThread(id: number, body: Partial<PlotThread>): Promise<PlotThread> {
  const { data } = await apiClient.put<PlotThread>(`/world/plot-threads/${id}`, body);
  return data;
}

export async function deletePlotThread(id: number, bookId: number): Promise<void> {
  await apiClient.delete(`/world/plot-threads/${id}`, { params: { book_id: bookId } });
}
