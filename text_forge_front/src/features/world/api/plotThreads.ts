import apiClient from '@/shared/lib/apiClient';
import type { PlotThread } from '@/types';

interface PlotThreadsResponse {
  threads: PlotThread[];
}

interface PlotThreadResponse {
  thread: PlotThread;
}

export async function fetchPlotThreads(bookId: number): Promise<PlotThread[]> {
  const { data } = await apiClient.get<PlotThreadsResponse>(`/api/world/plot-threads?book_id=${bookId}`);
  return data.threads || [];
}

export async function createPlotThread(bookId: number, body: Partial<PlotThread>): Promise<PlotThread> {
  const { data } = await apiClient.post<PlotThreadResponse>('/api/world/plot-threads', { ...body, bookId });
  return data.thread;
}

export async function updatePlotThread(id: number, body: Partial<PlotThread>): Promise<PlotThread> {
  const { data } = await apiClient.put<PlotThreadResponse>(`/api/world/plot-threads/${id}`, body);
  return data.thread;
}

export async function deletePlotThread(id: number, bookId: number): Promise<void> {
  await apiClient.delete(`/api/world/plot-threads/${id}?book_id=${bookId}`);
}