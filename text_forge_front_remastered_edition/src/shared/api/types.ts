export interface Book {
  id: number;
  title: string;
  genre?: string;
  description?: string;
  pinned?: boolean;
  workflowId?: string;
  totalWordGoal?: number;
  currentWordCount?: number;
  timeUnit?: string;
  epochLabel?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Volume {
  id: number;
  bookId: number;
  title: string;
  summary?: string;
  sortOrder: number;
  createdAt?: string;
}

export interface Chapter {
  id: number;
  volumeId: number;
  title: string;
  summary?: string | null;
  sortOrder: number;
  characterIds?: number[];
  locked: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SceneEvent {
  id: number;
  bookId: number;
  chapterId: number | null;
  title: string;
  content: string | null;
  sortOrder: number;
  eventType: 'scene' | 'event' | 'milestone';
  storyTs: number;
  storyLabel: string | null;
  locationId: number | null;
  characterIds: number[];
  plotThreadIds?: number[];
  resolvedForeshadowingIds?: number[];
  completedPlotThreadIds?: number[];
  locked: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChapterNode {
  id: number;
  chapterId: number;
  title: string;
  content?: string | null;
  sortOrder: number;
  characterIds: number[];
  locked: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Character {
  id: number;
  bookId?: number;
  name: string;
  description: string;
  avatarUrl: string | null;
  aliases?: string[];
  roleType: string;
  status: string;
  relationshipChain?: Array<{ targetId: number; type: string; description: string }>;
  locked: boolean;
  spawnLocationId?: number | null;
  baseLocationId?: number | null;
  customFields: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Location {
  id: number;
  bookId: number;
  name: string;
  type: string;
  description: string;
  parentId: number | null;
  positionX: number | null;
  positionY: number | null;
  backgroundUrl?: string | null;
  alternateOfId: number | null;
  mapIcon?: string | null;
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
  plantedAtChapterId?: number | null;
  resolvedAtChapterId?: number | null;
  relatedCharacterIds: number[];
  relatedEventId?: number | null;
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
  parentThreadId?: number | null;
  type: string;
  relatedCharacterIds: number[];
  startChapterId?: number | null;
  endChapterId?: number | null;
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
  /** 任务 32：事件卡片消息（review-card 等）持久化还原 */
  type?: string;
  token?: string;
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

export interface SSEEvent {
  type: 'token' | 'agent_token' | 'agent_reasoning' | 'think_start' | 'agent_think_end' | 'tool_start' | 'tool_end' | 'progress' |
        'node_start' | 'node_stream' | 'node_end' | 'node_fail' | 'subgraph_start' |
        'propose_cards' | 'review_card' | 'suggestions' | 'extend_outline' | 'title_update' | 'compress_done' | 'end' | 'error';
  token?: string;
  tool?: string;
  step?: string;
  node_id?: string;
  label?: string;
  subgraph?: string;
  n?: number;
  total?: number;
  message?: string;
  reply?: string;
  cards?: unknown[];
  card_types?: string[];
  reason?: string;
  content?: string;
  elapsed?: number;
  user_id?: number;
  tokens?: number;
  output_preview?: string;
  chapters_created?: number;
  chapter_ids?: number[];
  events_created?: number;
  generation_batch?: number;
  new_chapter_count?: number;
  thread_id?: string;
  title?: string;
  summary?: string;
  removed_count?: number;
  remaining_count?: number;
  items?: Array<{ type?: string; message?: string; suggestion?: string }>;
}

export interface BookContextConfig {
  character_ids: number[];
  chapter_content_ids: number[];
  chapter_summary_ids: number[];
  volume_ids: number[];
  outline_node_ids: number[];
}
