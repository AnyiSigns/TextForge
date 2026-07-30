import apiClient from '@/shared/lib/apiClient';
import type { Foreshadowing } from '@/types';

interface ForeshadowingsResponse {
  foreshadowings: Foreshadowing[];
}

interface ForeshadowingResponse {
  foreshadowing: Foreshadowing;
}

export async function fetchForeshadowings(bookId: number): Promise<Foreshadowing[]> {
  const { data } = await apiClient.get<ForeshadowingsResponse>(`/api/world/foreshadowings?book_id=${bookId}`);
  return data.foreshadowings || [];
}

export async function createForeshadowing(bookId: number, body: Partial<Foreshadowing>): Promise<Foreshadowing> {
  const { data } = await apiClient.post<ForeshadowingResponse>('/api/world/foreshadowings', { ...body, bookId });
  return data.foreshadowing;
}

export async function updateForeshadowing(id: number, body: Partial<Foreshadowing>): Promise<Foreshadowing> {
  const { data } = await apiClient.put<ForeshadowingResponse>(`/api/world/foreshadowings/${id}`, body);
  return data.foreshadowing;
}

export async function deleteForeshadowing(id: number, bookId: number): Promise<void> {
  await apiClient.delete(`/api/world/foreshadowings/${id}?book_id=${bookId}`);
}