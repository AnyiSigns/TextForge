export interface Book {
  id: number;
  title: string;
  genre?: string;
  description?: string;
  pinned?: boolean;
  workflowId?: string;
  totalWordGoal?: number;
  currentWordCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Volume {
  id: number;
  bookId: number;
  title: string;
  summary?: string;
  sortOrder: number;
  createdAt: string;
}

export interface Chapter {
  id: number;
  volumeId: number;
  title: string;
  summary?: string | null;
  sortOrder: number;
  characterIds: number[];
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterNode {
  id: number;
  chapterId: number;
  title: string;
  content?: string | null;
  sortOrder: number;
  characterIds: number[];
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Character {
  id: number;
  bookId?: number;
  name: string;
  description: string;
  avatarUrl?: string;
  aliases?: string[];
  roleType?: string;
  status?: string;
  relationshipChain?: Record<string, unknown>[];
  locked: boolean;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  id: number;
  bookId: number;
  name: string;
  type: string;
  description?: string;
  parentId?: number;
  attributes: Record<string, unknown>;
  locked: boolean;
  children?: Location[];
}

export interface TimelineEvent {
  id: number;
  bookId: number;
  name: string;
  description?: string;
  sortOrder: number;
  chapterId?: number;
  eventType: string;
  relatedCharacterIds: number[];
  relatedLocationId?: number;
  locked: boolean;
}

export interface Foreshadowing {
  id: number;
  bookId: number;
  description: string;
  status: string;
  plantedAtChapterId?: number;
  resolvedAtChapterId?: number;
  relatedCharacterIds: number[];
  relatedEventId?: number;
  revealType?: string;
  notes?: string;
  locked: boolean;
}

export interface PlotThread {
  id: number;
  bookId: number;
  name: string;
  description?: string;
  status: string;
  parentThreadId?: number;
  type: string;
  relatedCharacterIds: number[];
  startChapterId?: number;
  endChapterId?: number;
  progressNote?: string;
  locked: boolean;
  children?: PlotThread[];
}

export interface CreativeSetting {
  bookId: number;
  tone?: string;
  worldview?: string;
  writingTaboos?: string;
  customDimensions: Record<string, unknown>;
}

export interface WritingStats {
  summary?: {
    totalWords: number;
    totalSessions: number;
    totalDurationSeconds: number;
    activeDays: number;
  };
  trend?: { date: string; words: number }[];
}

export interface WritingSession {
  id: number;
  userId: number;
  bookId: number;
  chapterId?: number;
  characterIds: number[];
  wordsWritten: number;
  durationSeconds: number;
  startedAt?: string;
  endedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WritingStatsSummary {
  totalWords: number;
  totalSessions: number;
  totalDurationSeconds: number;
  activeDays: number;
}

export interface WritingTrendPoint {
  date: string;
  words: number;
}

export interface CharacterFrequency {
  characterId: number;
  characterName: string;
  count: number;
}

export interface ChapterProgressDetail {
  chapter_id: number;
  title: string;
  has_summary: boolean;
  session_count: number;
  total_words: number;
}

export interface PlotProgress {
  total_chapters: number;
  chapters_with_content: number;
  completion_rate: number;
  chapter_details: ChapterProgressDetail[];
}

export interface AgentConversation {
  id: number;
  userId: number;
  title: string;
  threadId: string;
  updatedAt: string;
}

export interface AgentMessage {
  conversationId: number;
  role: string;
  content: string;
  think?: string;
  createdAt: string;
}

export interface AgentMemory {
  id: number;
  userId: number;
  bookId?: number;
  memoryType: string;
  content: string;
  relatedChapterId?: number;
  relatedCharacterIds: number[];
  priority: number;
  source: string;
  meta?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  distance?: number;
}

export interface KnowledgeDoc {
  id: number;
  name: string;
  status: 'indexing' | 'indexed' | 'failed';
  createdAt: string;
  scope: 'personal' | 'public';
  uploaderId?: string;
  uploaderName?: string;
  content?: string;
}

export interface CardSession {
  cardId: string;
  cardType: string;
  title: string;
  wsEndpoint: string;
}

export interface LockResult {
  entityType: string;
  entityId: number;
  locked: boolean;
}

export interface SSEEvent {
  type: 'token' | 'think_start' | 'agent_think_end' | 'tool_start' | 'tool_end' | 'progress' |
        'node_start' | 'node_stream' | 'node_end' |
        'propose_cards' | 'review_card' | 'suggestions' | 'end' | 'error';
  token?: string;
  tool?: string;
  step?: string;
  node_id?: string;
  label?: string;
  message?: string;
  reply?: string;
  cards?: unknown[];
  card_types?: string[];
  reason?: string;
  content?: string;
  elapsed?: number;
  user_id?: number;
}

export interface BookContextConfig {
  bookId: number;
  contextIds: number[];
}
