// src/lib/storage/backupOutline.ts
// 项目级附属文档（大纲、灵感剪藏）的本地读写，统一存 IndexedDB。
import { getItem, setItem } from './indexedDB';
import type { OutlineVolume, OutlineSection, InspirationItem } from './backupSchema';

const outlineKey = (projectId: string) => `outline-${projectId}`;
const inspirationKey = (projectId: string) => `inspiration-${projectId}`;

export async function loadOutline(projectId: string): Promise<OutlineVolume[]> {
  const raw = await getItem<OutlineVolume[]>(outlineKey(projectId));
  if (Array.isArray(raw) && raw.length) return raw;
  // 兼容旧扁平结构：title+content → 单卷单章单节点
  const legacy = (await getItem<OutlineSection[]>(outlineKey(projectId))) ?? [];
  if (legacy.length) {
    return [{
      id: `vol-legacy-${projectId}`,
      title: '大纲',
      chapters: [{
        id: `ch-legacy-${projectId}`,
        title: '正文',
        nodes: legacy.map((s) => ({ id: s.id, title: s.title, content: s.content })),
      }],
    }];
  }
  return [];
}

export async function saveOutline(projectId: string, volumes: OutlineVolume[]): Promise<void> {
  if (volumes.length > 0) await setItem(outlineKey(projectId), volumes);
  else await setItem(outlineKey(projectId), []);
}

export async function loadInspiration(projectId: string): Promise<InspirationItem[]> {
  return (await getItem<InspirationItem[]>(inspirationKey(projectId))) || [];
}

export async function saveInspiration(projectId: string, items: InspirationItem[]): Promise<void> {
  await setItem(inspirationKey(projectId), items);
}
