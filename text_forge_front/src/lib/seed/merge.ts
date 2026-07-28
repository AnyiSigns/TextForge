// src/lib/seed/merge.ts
//
// 种子回填的「增量合并」适配器：把后端返回的 BookSeed 合并进本地 store 数据，
// 原则是「用户改过的单元原地保留，种子只填用户没碰过的」。
//
// 来源标记（Origin）：
//   seed  种子生成的，用户未手动改 → 可被后续种子覆盖
//   user  用户手动编辑/自建 → 种子回填跳过
//   init  本地从零创建（未经过种子）→ 等同 user 语义，种子不覆盖

import type {
  BookCreativeSetting, Origin, SeedCreativeSetting, SeedOutline, SeedCharacter,
} from '@/types';
import type { OutlineVolume } from '@/lib/storage/backup';
import type { Character } from '@/types';

// CreativeSetting 可合并的字段
const CREATIVE_SETTING_FIELDS = [
  'worldview', 'tone', 'writingTaboos',
] as const;

function isUserOwned(origin?: Origin): boolean {
  return origin === 'user' || origin === 'init';
}

// ---------- CreativeSetting 合并 ----------
export function mergeCreativeSetting(local: BookCreativeSetting | undefined, seed: SeedCreativeSetting, bookId: number): BookCreativeSetting {
  const now = new Date().toISOString();
  const base: BookCreativeSetting = local ?? { bookId, updatedAt: now };

  for (const f of CREATIVE_SETTING_FIELDS) {
    const seedVal = seed[f] as string | undefined;
    if (seedVal !== undefined && seedVal !== '') {
      (base as unknown as Record<string, unknown>)[f] = seedVal;
    }
  }

  const localDimensions = base.customDimensions ?? [];
  const seedDimensions = seed.customDimensions ?? [];
  const mergedDimensions = [...localDimensions];
  for (const s of seedDimensions) {
    const idx = mergedDimensions.findIndex((x) => x.id === s.id);
    if (idx >= 0) {
      const cur = mergedDimensions[idx];
      if (!isUserOwned(cur.origin)) {
        mergedDimensions[idx] = { ...cur, title: s.title, content: s.content, pinned: s.pinned, origin: 'seed' };
      }
    } else {
      mergedDimensions.push({ id: s.id, title: s.title, content: s.content, pinned: s.pinned, origin: 'seed' });
    }
  }

  return {
    ...base,
    customDimensions: mergedDimensions,
    updatedAt: now,
  };
}

// ---------- Outline 合并 ----------
export function mergeOutline(local: OutlineVolume[] | undefined, seed: SeedOutline): OutlineVolume[] {
  const base = local ?? [];
  const result: OutlineVolume[] = [...base];
  const baseVolIds = new Set(base.map((v) => v.id));

  for (const sv of seed.volumes) {
    const vIdx = result.findIndex((v) => v.id === sv.id);
    if (vIdx >= 0) {
      const vol = result[vIdx];
      if (!isUserOwned(vol.origin)) {
        const chapters = [...vol.chapters];
        const chIds = new Set(chapters.map((c) => c.id));
        for (const sc of sv.chapters) {
          const cIdx = chapters.findIndex((c) => c.id === sc.id);
          if (cIdx >= 0) {
            const ch = chapters[cIdx];
            if (!isUserOwned(ch.origin)) {
              const nodes = [...ch.nodes];
              const nIds = new Set(nodes.map((n) => n.id));
              for (const sn of sc.nodes) {
                const nIdx = nodes.findIndex((n) => n.id === sn.id);
                if (nIdx >= 0) {
                  if (!isUserOwned(nodes[nIdx].origin)) {
                    nodes[nIdx] = { ...nodes[nIdx], title: sn.title, content: sn.content, origin: 'seed' };
                  }
                } else {
                  nodes.push({ ...sn, origin: 'seed' });
                }
                nIds.add(sn.id);
              }
              chapters[cIdx] = { ...ch, title: sc.title, nodes, origin: 'seed' };
            }
          } else {
            chapters.push({ id: sc.id, title: sc.title, origin: 'seed', nodes: sc.nodes.map((n) => ({ ...n, origin: 'seed' as Origin })) });
          }
          chIds.add(sc.id);
        }
        result[vIdx] = { ...vol, title: sv.title, chapters, origin: 'seed' };
      }
    } else {
      result.push({
        id: sv.id,
        title: sv.title,
        origin: 'seed',
        chapters: sv.chapters.map((c) => ({
          id: c.id,
          title: c.title,
          origin: 'seed',
          nodes: c.nodes.map((n) => ({ ...n, origin: 'seed' as Origin })),
        })),
      });
    }
    baseVolIds.add(sv.id);
  }
  return result;
}

// ---------- Characters 合并 ----------
export function mergeCharacters(
  local: Character[] | undefined,
  seed: SeedCharacter[],
  bookId: number,
): Character[] {
  const base = local ?? [];
  const result: Character[] = [...base];

  for (const sc of seed) {
    const idx = result.findIndex((c) => c.id === sc.id);
    if (idx >= 0) {
      result[idx] = { ...result[idx], name: sc.name, description: sc.description, roleType: sc.roleType, status: sc.status, updatedAt: new Date().toISOString() };
    } else {
      result.push({
        id: sc.id,
        name: sc.name,
        description: sc.description,
        roleType: sc.roleType,
        status: sc.status,
        bookId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return result;
}
