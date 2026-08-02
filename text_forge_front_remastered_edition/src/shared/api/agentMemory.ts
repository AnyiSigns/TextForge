import { apiClient } from './client';
import type { AgentMemory } from './types';

export async function fetchAgentMemories(bookId?: number): Promise<AgentMemory[]> {
  const url = bookId ? `/agent-memories/?book_id=${bookId}` : '/agent-memories/';
  const { data } = await apiClient.get<{ memories: AgentMemory[] }>(url);
  return data.memories ?? [];
}

export async function createAgentMemory(body: Partial<AgentMemory>): Promise<AgentMemory> {
  const { data } = await apiClient.post<AgentMemory>('/agent-memories/', body);
  return data;
}

export async function updateAgentMemory(memoryId: number, body: Partial<AgentMemory>): Promise<AgentMemory> {
  const { data } = await apiClient.put<AgentMemory>(`/agent-memories/${memoryId}`, body);
  return data;
}

export async function deleteAgentMemory(memoryId: number): Promise<void> {
  await apiClient.delete(`/agent-memories/${memoryId}`);
}

export async function searchAgentMemories(query: string, bookId?: number): Promise<AgentMemory[]> {
  const { data } = await apiClient.post<{ results: AgentMemory[] }>('/agent-memories/search', { query, book_id: bookId });
  return data.results ?? [];
}
