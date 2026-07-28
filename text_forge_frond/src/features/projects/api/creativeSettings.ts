// src/features/projects/api/creativeSettings.ts
// 创作设定（CreativeSetting）API。

import apiClient from '@/shared/lib/apiClient';
import type { BookCreativeSetting, CustomDimension } from '@/types';

export interface CreativeSettingResponse {
  bookId: number;
  tone?: string;
  worldview?: string;
  writingTaboos?: string;
  customDimensions?: Record<string, unknown>;
  updatedAt?: string;
}

function toBackendCustomDimensions(dimensions: CustomDimension[] | undefined): Record<string, unknown> | undefined {
  if (!dimensions?.length) return undefined;
  const result: Record<string, unknown> = {};
  for (const d of dimensions) {
    result[d.id] = {
      title: d.title,
      content: d.content,
      pinned: d.pinned,
      origin: d.origin,
      updatedAt: d.updatedAt,
    };
  }
  return result;
}

function toFrontendCustomDimensions(dimensions: Record<string, unknown> | undefined): CustomDimension[] | undefined {
  if (!dimensions) return undefined;
  return Object.entries(dimensions).map(([id, value]) => {
    const obj = value as Record<string, unknown>;
    return {
      id,
      title: (obj.title as string) || '',
      content: (obj.content as string) || '',
      pinned: obj.pinned as boolean | undefined,
      origin: obj.origin as string | undefined,
      updatedAt: obj.updatedAt as string | undefined,
    } as CustomDimension;
  });
}

export async function getCreativeSetting(bookId: number): Promise<BookCreativeSetting> {
  const { data } = await apiClient.get<CreativeSettingResponse>(`/api/creative-settings/books/${bookId}`);
  return {
    bookId: data.bookId,
    tone: data.tone,
    worldview: data.worldview,
    writingTaboos: data.writingTaboos,
    customDimensions: toFrontendCustomDimensions(data.customDimensions),
    updatedAt: data.updatedAt,
  };
}

export async function updateCreativeSetting(bookId: number, body: Partial<BookCreativeSetting>): Promise<BookCreativeSetting> {
  const payload: Record<string, unknown> = {
    tone: body.tone,
    worldview: body.worldview,
    writing_taboos: body.writingTaboos,
    custom_dimensions: toBackendCustomDimensions(body.customDimensions),
  };
  const { data } = await apiClient.put<CreativeSettingResponse>(`/api/creative-settings/books/${bookId}`, payload);
  return {
    bookId: data.bookId,
    tone: data.tone,
    worldview: data.worldview,
    writingTaboos: data.writingTaboos,
    customDimensions: toFrontendCustomDimensions(data.customDimensions),
    updatedAt: data.updatedAt,
  };
}
