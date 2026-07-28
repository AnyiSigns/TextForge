// src/types/volume.ts
// 卷（Volume）相关类型。

export interface Volume {
  id: number;
  bookId: number;
  title: string;
  summary?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface VolumeRequest {
  title: string;
  summary?: string;
}

export interface VolumeResponse {
  id: number;
  bookId: number;
  title: string;
  summary?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
