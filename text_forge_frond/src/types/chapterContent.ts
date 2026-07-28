// src/types/chapterContent.ts
// 章节内容（ChapterContent）相关类型。

export interface ChapterContent {
  id: number;
  chapterId: number;
  content?: string;
  createdAt: string;
}

export interface ChapterContentRequest {
  content: string;
}

export interface ChapterContentResponse {
  id: number;
  chapterId: number;
  content?: string;
  createdAt: string;
}
