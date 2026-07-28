// src/lib/storage/backupWorkspace.ts
// 整包工作区备份/导入：结构校验后的数据落盘到各 store + IndexedDB。
import { downloadText } from '@/lib/utils/download';
import { loadOutline, saveOutline, loadInspiration, saveInspiration } from './backupOutline';
import type { OutlineVolume, ParsedWorkspaceBackup, InspirationItem } from './backupSchema';

export interface WorkspaceBackup {
  version: 1;
  exportedAt: string;
  projects?: unknown;
  characters?: unknown;
  creativeSettings?: unknown;
  models?: unknown;
  settings?: unknown;
  outlines?: Record<string, OutlineVolume[]>;
  inspirations?: Record<string, InspirationItem[]>;
  drafts?: Record<string, unknown>;
  versionHistories?: Record<string, unknown>;
}

export async function exportWorkspace(
  stores: {
    projects?: unknown;
    characters?: unknown;
    creativeSettings?: unknown;
    models?: unknown;
    settings?: unknown;
  },
  bookIds: string[],
): Promise<WorkspaceBackup> {
  const outlines: Record<string, OutlineVolume[]> = {};
  const inspirations: Record<string, InspirationItem[]> = {};
  for (const bid of bookIds) {
    outlines[bid] = await loadOutline(bid);
    inspirations[bid] = await loadInspiration(bid);
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: stores.projects,
    characters: stores.characters,
    creativeSettings: stores.creativeSettings,
    models: stores.models,
    settings: stores.settings,
    outlines,
    inspirations,
    drafts: {},
    versionHistories: {},
  };
}

export function downloadBackup(backup: WorkspaceBackup, filename?: string): void {
  const data = JSON.stringify(backup, null, 2);
  downloadText(data, filename || `text-forge-backup-${backup.exportedAt.split('T')[0]}.json`, 'application/json');
}

export async function importWorkspace(
  backup: ParsedWorkspaceBackup,
  apply: {
    projects?: (data: unknown) => void | Promise<void>;
    characters?: (data: unknown) => void | Promise<void>;
    creativeSettings?: (data: unknown) => void | Promise<void>;
    models?: (data: unknown) => void | Promise<void>;
    settings?: (data: unknown) => void | Promise<void>;
  },
  bookIds: string[],
): Promise<void> {
  if (backup.projects !== undefined && apply.projects) await apply.projects(backup.projects);
  if (backup.characters !== undefined && apply.characters) await apply.characters(backup.characters);
  if (backup.creativeSettings !== undefined && apply.creativeSettings) await apply.creativeSettings(backup.creativeSettings);
  if (backup.models !== undefined && apply.models) await apply.models(backup.models);
  if (backup.settings !== undefined && apply.settings) await apply.settings(backup.settings);

  for (const bid of bookIds) {
    if (backup.outlines?.[bid]) await saveOutline(bid, backup.outlines[bid]);
    if (backup.inspirations?.[bid]) await saveInspiration(bid, backup.inspirations[bid]);
  }
}
