import { apiClient } from './client';
import type { Location, TimelineEvent, Foreshadowing, PlotThread } from './types';

export async function fetchLocations(bookId: number): Promise<Location[]> {
  const { data } = await apiClient.get<Location[]>(`/world/locations?book_id=${bookId}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchTimelineEvents(bookId: number): Promise<TimelineEvent[]> {
  const { data } = await apiClient.get<TimelineEvent[]>(`/world/timeline-events?book_id=${bookId}`);
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

export async function createTimelineEvent(body: Partial<TimelineEvent>): Promise<TimelineEvent> {
  const { data } = await apiClient.post<TimelineEvent>('/world/timeline-events', body);
  return data;
}

export async function createForeshadowing(body: Partial<Foreshadowing>): Promise<Foreshadowing> {
  const { data } = await apiClient.post<Foreshadowing>('/world/foreshadowings', body);
  return data;
}

export async function createPlotThread(body: Partial<PlotThread>): Promise<PlotThread> {
  const { data } = await apiClient.post<PlotThread>('/world/plot-threads', body);
  return data;
}
