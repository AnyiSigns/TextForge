// src/lib/storage/backupSchema.ts
// 导入结构校验（防篡改 JSON 注入/data 注入）与整包备份类型定义。
import { z } from 'zod';
import type { Origin } from '@/types';

export type OutlineNodeStatus = 'todo' | 'writing' | 'done';

// 大纲三级树：卷 → 章 → 节点（情节节拍）
export interface OutlineNode {
  id: string;
  title: string;
  content?: string;          // 摘要/要点
  status?: OutlineNodeStatus;
  targetWords?: number;       // 目标字数
  charIds?: string[];        // 关联角色
  sectionIds?: string[];     // 关联设定维度
  origin?: Origin;           // 来源（种子/用户），增量合并用
}

const outlineNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().optional(),
  status: z.enum(['todo', 'writing', 'done']).optional(),
  targetWords: z.number().optional(),
  charIds: z.array(z.string()).optional(),
  sectionIds: z.array(z.string()).optional(),
  origin: z.enum(['seed', 'user', 'init']).optional(),
});

const outlineChapterSchema = outlineNodeSchema
  .omit({ targetWords: true, charIds: true, sectionIds: true, origin: true })
  .extend({
    nodes: z.array(outlineNodeSchema),
    origin: z.enum(['seed', 'user', 'init']).optional(),
  });

const outlineVolumeSchema = outlineChapterSchema
  .omit({ nodes: true, origin: true })
  .extend({
    chapters: z.array(outlineChapterSchema),
    origin: z.enum(['seed', 'user', 'init']).optional(),
  });

const inspirationItemSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'image', 'link']),
  content: z.string(),
  note: z.string().optional(),
  createdAt: z.string(),
});

export const workspaceBackupSchema = z
  .object({
    version: z.literal(1),
    exportedAt: z.string(),
    projects: z.unknown().optional(),
    characters: z.unknown().optional(),
    briefs: z.unknown().optional(),
    models: z.unknown().optional(),
    settings: z.unknown().optional(),
    outlines: z.record(z.string(), z.array(outlineVolumeSchema)).optional(),
    inspirations: z.record(z.string(), z.array(inspirationItemSchema)).optional(),
    drafts: z.record(z.string(), z.unknown()).optional(),
    versionHistories: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ParsedWorkspaceBackup = z.infer<typeof workspaceBackupSchema>;

/** 解析并校验导入的备份 JSON，失败抛出含中文说明的 Error。 */
export function parseWorkspaceBackup(text: string): ParsedWorkspaceBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('文件不是合法的 JSON');
  }
  const result = workspaceBackupSchema.safeParse(raw);
  if (!result.success) {
    throw new Error('备份格式不合法或已被篡改');
  }
  if (result.data.version !== 1) {
    throw new Error('不支持的备份版本');
  }
  return result.data;
}

export interface OutlineChapter {
  id: string;
  title: string;
  nodes: OutlineNode[];
  origin?: Origin;
}

export interface OutlineVolume {
  id: string;
  title: string;
  chapters: OutlineChapter[];
  origin?: Origin;
}

// 兼容旧扁平结构（迁移用）：title+content 视作单卷单章单节点
export interface OutlineSection {
  id: string;
  title: string;
  content?: string;
}

export interface InspirationItem {
  id: string;
  type: 'text' | 'image' | 'link';
  content: string;
  note?: string;
  createdAt: string;
}
