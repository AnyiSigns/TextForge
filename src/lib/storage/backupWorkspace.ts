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
  briefs?: unknown;
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
    briefs?: unknown;
    models?: unknown;
    settings?: unknown;
  },
  projectIds: string[],
): Promise<WorkspaceBackup> {
  const outlines: Record<string, OutlineVolume[]> = {};
  const inspirations: Record<string, InspirationItem[]> = {};
  for (const pid of projectIds) {
    outlines[pid] = await loadOutline(pid);
    inspirations[pid] = await loadInspiration(pid);
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: stores.projects,
    characters: stores.characters,
    briefs: stores.briefs,
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
    briefs?: (data: unknown) => void | Promise<void>;
    models?: (data: unknown) => void | Promise<void>;
    settings?: (data: unknown) => void | Promise<void>;
  },
  projectIds: string[],
): Promise<void> {
  if (backup.projects !== undefined && apply.projects) await apply.projects(backup.projects);
  if (backup.characters !== undefined && apply.characters) await apply.characters(backup.characters);
  if (backup.briefs !== undefined && apply.briefs) await apply.briefs(backup.briefs);
  if (backup.models !== undefined && apply.models) await apply.models(backup.models);
  if (backup.settings !== undefined && apply.settings) await apply.settings(backup.settings);

  for (const pid of projectIds) {
    if (backup.outlines?.[pid]) await saveOutline(pid, backup.outlines[pid]);
    if (backup.inspirations?.[pid]) await saveInspiration(pid, backup.inspirations[pid]);
  }
}
