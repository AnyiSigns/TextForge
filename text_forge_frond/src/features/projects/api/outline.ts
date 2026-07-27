import apiClient from '@/shared/lib/apiClient';
import type { OutlineVolume } from '@/lib/storage/backup';

export interface OutlineItem {
  id: number;
  projectId: number;
  data?: OutlineVolume[];
  createdAt: string;
  updatedAt: string;
}

export interface ListOutlinesResponse {
  outlines: OutlineItem[];
}

export async function listOutlines(projectId: number): Promise<OutlineItem[]> {
  const { data } = await apiClient.get<ListOutlinesResponse>(`/api/outlines/projects/${projectId}`);
  return data.outlines || [];
}

export async function getOutline(projectId: number, outlineId: number): Promise<OutlineItem | null> {
  const { data } = await apiClient.get<OutlineItem>(`/api/outlines/projects/${projectId}/${outlineId}`);
  return data || null;
}

export async function createOutline(projectId: number, data: OutlineVolume[]): Promise<OutlineItem> {
  const { data: result } = await apiClient.post<OutlineItem>(`/api/outlines/projects/${projectId}`, { data });
  return result;
}

export async function updateOutline(projectId: number, outlineId: number, data: OutlineVolume[]): Promise<OutlineItem> {
  const { data: result } = await apiClient.put<OutlineItem>(`/api/outlines/projects/${projectId}/${outlineId}`, { data });
  return result;
}

export async function deleteOutline(projectId: number, outlineId: number): Promise<void> {
  await apiClient.delete(`/api/outlines/projects/${projectId}/${outlineId}`);
}
