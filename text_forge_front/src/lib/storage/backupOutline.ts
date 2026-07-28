// src/lib/storage/backupOutline.ts
// 项目级附属文档（大纲、章节摘要）的本地读写，统一存 IndexedDB。
import { getItem, setItem } from './indexedDB';
import type { OutlineVolume, OutlineSection, InspirationItem } from './backupSchema';

const outlineKey = (bookId: string) => `outline-${bookId}`;
const inspirationKey = (bookId: string) => `inspiration-${bookId}`;

export async function loadOutline(bookId: string): Promise<OutlineVolume[]> {
  const raw = await getItem<OutlineVolume[]>(outlineKey(bookId));
  if (Array.isArray(raw) && raw.length) return raw;
  // 兼容旧扁平结构：title+content → 单卷单章单节点
  const legacy = (await getItem<OutlineSection[]>(outlineKey(bookId))) ?? [];
  if (legacy.length) {
    return [{
      id: `vol-legacy-${bookId}`,
      title: '大纲',
      chapters: [{
        id: `ch-legacy-${bookId}`,
        title: '正文',
        nodes: legacy.map((s) => ({ id: s.id, title: s.title, content: s.content })),
      }],
    }];
  }
  return [];
}

export async function saveOutline(bookId: string, volumes: OutlineVolume[]): Promise<void> {
  if (volumes.length > 0) await setItem(outlineKey(bookId), volumes);
  else await setItem(outlineKey(bookId), []);
}

export async function loadInspiration(bookId: string): Promise<InspirationItem[]> {
  return (await getItem<InspirationItem[]>(inspirationKey(bookId))) || [];
}

export async function saveInspiration(bookId: string, items: InspirationItem[]): Promise<void> {
  await setItem(inspirationKey(bookId), items);
}
