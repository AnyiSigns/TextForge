// src/features/projects/api/volumes.ts
// 卷（Volume）CRUD API。

import apiClient from '@/shared/lib/apiClient';
import type { Volume, VolumeRequest, VolumeResponse } from '@/types';

export interface ListVolumesResponse {
  volumes: VolumeResponse[];
}

export async function listVolumes(bookId: number): Promise<Volume[]> {
  const { data } = await apiClient.get<ListVolumesResponse>(`/api/volumes/books/${bookId}`);
  return data.volumes || [];
}

export async function createVolume(bookId: number, body: VolumeRequest): Promise<Volume> {
  const { data } = await apiClient.post<VolumeResponse>(`/api/volumes/books/${bookId}`, body);
  return data;
}

export async function updateVolume(volumeId: number, body: VolumeRequest): Promise<Volume> {
  const { data } = await apiClient.put<VolumeResponse>(`/api/volumes/${volumeId}`, body);
  return data;
}

export async function deleteVolume(volumeId: number): Promise<boolean> {
  const { data } = await apiClient.delete<{ ok: boolean }>(`/api/volumes/${volumeId}`);
  return data.ok ?? false;
}
