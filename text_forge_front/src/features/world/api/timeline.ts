import apiClient from '@/shared/lib/apiClient';
import type { TimelineEvent } from '@/types';

interface TimelineEventsResponse {
  events: TimelineEvent[];
}

interface TimelineEventResponse {
  event: TimelineEvent;
}

export async function fetchTimelineEvents(bookId: number): Promise<TimelineEvent[]> {
  const { data } = await apiClient.get<TimelineEventsResponse>(`/api/world/timeline-events?book_id=${bookId}`);
  return data.events || [];
}

export async function createTimelineEvent(bookId: number, body: Partial<TimelineEvent>): Promise<TimelineEvent> {
  const { data } = await apiClient.post<TimelineEventResponse>('/api/world/timeline-events', { ...body, bookId });
  return data.event;
}

export async function updateTimelineEvent(id: number, body: Partial<TimelineEvent>): Promise<TimelineEvent> {
  const { data } = await apiClient.put<TimelineEventResponse>(`/api/world/timeline-events/${id}`, body);
  return data.event;
}

export async function deleteTimelineEvent(id: number, bookId: number): Promise<void> {
  await apiClient.delete(`/api/world/timeline-events/${id}?book_id=${bookId}`);
}