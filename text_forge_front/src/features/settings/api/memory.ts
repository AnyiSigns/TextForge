import apiClient from '@/shared/lib/apiClient';
import type { AgentMemory } from '@/types';

interface MemoriesResponse {
  memories: AgentMemory[];
}

interface MemoryResponse {
  memory: AgentMemory;
}

interface SearchMemoriesResponse {
  memories: AgentMemory[];
}

export async function fetchMemories(bookId?: number, memoryType?: string): Promise<AgentMemory[]> {
  const params = new URLSearchParams();
  if (bookId !== undefined) params.set('book_id', String(bookId));
  if (memoryType) params.set('memory_type', memoryType);
  const { data } = await apiClient.get<MemoriesResponse>(`/api/agent-memories?${params.toString()}`);
  return data.memories || [];
}

export async function createMemory(body: Partial<AgentMemory>): Promise<AgentMemory> {
  const { data } = await apiClient.post<MemoryResponse>('/api/agent-memories', body);
  return data.memory;
}

export async function updateMemory(id: number, body: Partial<AgentMemory>): Promise<AgentMemory> {
  const { data } = await apiClient.put<MemoryResponse>(`/api/agent-memories/${id}`, body);
  return data.memory;
}

export async function deleteMemory(id: number): Promise<void> {
  await apiClient.delete(`/api/agent-memories/${id}`);
}

export async function searchMemories(query: string, bookId?: number, memoryType?: string, topK: number = 5): Promise<AgentMemory[]> {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('mode', 'fulltext');
  params.set('top_k', String(topK));
  if (bookId !== undefined) params.set('book_id', String(bookId));
  if (memoryType) params.set('memory_type', memoryType);
  const { data } = await apiClient.get<SearchMemoriesResponse>(`/api/agent-memories/search?${params.toString()}`);
  return data.memories || [];
}