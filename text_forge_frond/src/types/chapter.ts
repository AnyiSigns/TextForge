// src/types/chapter.ts
// 章节（Chapter）相关类型。

export interface Chapter {
  id: number;
  volumeId: number;
  title: string;
  summary?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterRequest {
  title: string;
  summary?: string;
}

export interface ChapterResponse {
  id: number;
  volumeId: number;
  title: string;
  summary?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
