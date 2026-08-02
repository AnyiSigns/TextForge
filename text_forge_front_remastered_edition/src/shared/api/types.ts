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
  summary?: string;
  sortOrder: number;
  characterIds: number[];
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

export interface OutlineNode {
  id: number;
  bookId: number;
  parentId?: number;
  targetVolumeId?: number;
  targetChapterId?: number;
  nodeType: string;
  title: string;
  content?: string;
  sortOrder: number;
  children?: OutlineNode[];
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

export interface SSEEvent {
  type: 'token' | 'agent_think' | 'tool_start' | 'tool_end' | 'progress' |
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
}
