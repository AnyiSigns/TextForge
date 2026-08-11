import { apiClient } from './client';
import type { AgentMemory } from './types';

/** 2.7：消费后端 PageResult 分页契约（total/total_pages/has_next）。 */
export interface AgentMemoryPage {
  items: AgentMemory[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
}

export async function fetchAgentMemories(
  bookId?: number,
  page = 1,
  pageSize = 20,
): Promise<AgentMemoryPage> {
  const url = bookId
    ? `/agent-memories/?book_id=${bookId}&page=${page}&page_size=${pageSize}`
    : `/agent-memories/?page=${page}&page_size=${pageSize}`;
  const { data } = await apiClient.get<AgentMemoryPage>(url);
  return {
    items: data?.items ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? page,
    page_size: data?.page_size ?? pageSize,
    total_pages: data?.total_pages ?? 0,
    has_next: data?.has_next ?? false,
  };
}

export async function createAgentMemory(body: Partial<AgentMemory>): Promise<AgentMemory> {
  const { data } = await apiClient.post<AgentMemory>('/agent-memories/', body);
  return data;
}

export async function deleteAgentMemory(memoryId: number): Promise<void> {
  await apiClient.delete(`/agent-memories/${memoryId}`);
}
