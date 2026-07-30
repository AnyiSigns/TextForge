import apiClient from '@/shared/lib/apiClient';
import type { Location } from '@/types';

interface LocationsResponse {
  locations: Location[];
}

interface LocationResponse {
  location: Location;
}

export async function fetchLocations(bookId: number): Promise<Location[]> {
  const { data } = await apiClient.get<LocationsResponse>(`/api/world/locations?book_id=${bookId}`);
  return data.locations || [];
}

export async function createLocation(bookId: number, body: Partial<Location>): Promise<Location> {
  const { data } = await apiClient.post<LocationResponse>('/api/world/locations', { ...body, bookId });
  return data.location;
}

export async function updateLocation(id: number, body: Partial<Location>): Promise<Location> {
  const { data } = await apiClient.put<LocationResponse>(`/api/world/locations/${id}`, body);
  return data.location;
}

export async function deleteLocation(id: number, bookId: number): Promise<void> {
  await apiClient.delete(`/api/world/locations/${id}?book_id=${bookId}`);
}