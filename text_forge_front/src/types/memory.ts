export interface AgentMemory {
  id: number
  userId: number
  bookId?: number
  memoryType: 'preference' | 'rule' | 'fact' | 'user_manual' | 'agent_self_reflection'
  content: string
  relatedChapterId?: number
  relatedCharacterIds: number[]
  priority: number
  source: string
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}