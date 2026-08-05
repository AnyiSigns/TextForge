export interface MockBook {
  id: number;
  userId: number;
  title: string;
  description: string;
  genre: string;
  pinned: boolean;
  workflowId: string | null;
  totalWordGoal: number;
  currentWordCount: number;
  timeUnit: 'day' | 'year' | 'hour';
  epochLabel: string;
}

export interface MockVolume {
  id: number;
  bookId: number;
  title: string;
  summary: string;
  sortOrder: number;
}

export interface MockChapter {
  id: number;
  volumeId: number;
  title: string;
  summary: string;
  sortOrder: number;
  characterIds: number[];
  locked: boolean;
}

export interface MockSceneEvent {
  id: number;
  bookId: number;
  chapterId: number | null;
  title: string;
  content: string | null;
  sortOrder: number;
  eventType: 'scene' | 'milestone';
  storyTs: number;
  storyLabel: string | null;
  locationId: number | null;
  characterIds: number[];
  plotThreadIds: number[];
  locked: boolean;
}

export interface MockLocation {
  id: number;
  bookId: number;
  name: string;
  type: string;
  description: string;
  parentId: number | null;
  positionX: number | null;
  positionY: number | null;
  backgroundUrl: string | null;
  alternateOfId: number | null;
  mapIcon: string | null;
  attributes: Record<string, unknown>;
  locked: boolean;
}

export interface MockCharacter {
  id: number;
  bookId: number;
  name: string;
  aliases: string[];
  description: string;
  roleType: string;
  status: string;
  relationshipChain: Array<{ targetId: number; type: string; description: string }>;
  locked: boolean;
  avatarUrl: string | null;
  role_type: string;
  spawnLocationId: number | null;
  baseLocationId: number | null;
  customFields: Record<string, unknown>;
  userId: number;
}

export interface MockForeshadowing {
  id: number;
  bookId: number;
  description: string;
  status: string;
  plantedAtChapterId: number | null;
  resolvedAtChapterId: number | null;
  relatedCharacterIds: number[];
  relatedEventId: number | null;
  revealType: string;
  notes: string;
  locked: boolean;
}

export interface MockPlotThread {
  id: number;
  bookId: number;
  name: string;
  description: string;
  status: string;
  parentThreadId: number | null;
  type: string;
  relatedCharacterIds: number[];
  startChapterId: number | null;
  endChapterId: number | null;
  progressNote: string;
  locked: boolean;
}

