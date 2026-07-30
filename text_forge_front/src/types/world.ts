export interface Location {
  id: number
  bookId: number
  name: string
  type: string
  description?: string
  parentId?: number
  attributes: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface TimelineEvent {
  id: number
  bookId: number
  name: string
  description?: string
  sortOrder: number
  chapterId?: number
  eventType: string
  relatedCharacterIds: number[]
  relatedLocationId?: number
  createdAt: string
  updatedAt: string
}

export interface Foreshadowing {
  id: number
  bookId: number
  description: string
  status: 'planted' | 'hinted' | 'revealed' | 'paid_off'
  plantedAtChapterId?: number
  resolvedAtChapterId?: number
  relatedCharacterIds: number[]
  relatedEventId?: number
  revealType?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface PlotThread {
  id: number
  bookId: number
  name: string
  description?: string
  status: string
  parentThreadId?: number
  type: string
  relatedCharacterIds: number[]
  startChapterId?: number
  endChapterId?: number
  progressNote?: string
  createdAt: string
  updatedAt: string
}

export interface AgentRuleSet {
  id: number
  bookId: number
  planStyle: 'structured' | 'flexible' | 'minimal'
  maxSteps: number
  autoStartChecklist: boolean
  defaultPOV: 'first' | 'second' | 'third'
  defaultTense: 'past' | 'present' | 'future'
  defaultPace: 'slow' | 'moderate' | 'fast'
  sentencePreference: 'short' | 'medium' | 'long' | 'mixed'
  dialogueRatio: 'low' | 'balanced' | 'high'
  agentPersona: 'balanced' | 'analytical' | 'creative' | 'strict'
  maxGenerationLength: number
  autoCompressLongText: boolean
  pauseBetweenSteps: boolean
  checklistConsistencyTimeline: boolean
  checklistConsistencyCharacters: boolean
  checklistConsistencyForeshadowing: boolean
  checklistPace: boolean
  checklistWordCount: boolean
  autoFixIssues: boolean
  createdAt: string
  updatedAt: string
}