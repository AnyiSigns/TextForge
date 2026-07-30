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