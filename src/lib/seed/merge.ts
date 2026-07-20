// src/lib/seed/merge.ts
//
// 种子回填的「增量合并」适配器：把后端返回的 ProjectSeed 合并进本地 store 数据，
// 原则是「用户改过的单元原地保留，种子只填用户没碰过的」。
//
// 来源标记（Origin）：
//   seed  种子生成的，用户未手动改 → 可被后续种子覆盖
//   user  用户手动编辑/自建 → 种子回填跳过
//   init  本地从零创建（未经过种子）→ 等同 user 语义，种子不覆盖
//
// 合并单元：
//   Brief       → 平铺字段级（fieldOrigins）+ sections 按 id 级
//   Outline     → 卷/章/节点按 id 级
//   Characters  → 按 id 级
//
// 所有写入都采用后端返回的 id（信任后端，不前端造 uid），保证跨端/RAG 关联一致。

import type {
  ProjectBrief, Origin, SeedBrief, SeedOutline, SeedCharacter,
} from '@/types';
import type { OutlineVolume } from '@/lib/storage/backup';
import type { Character } from '@/types';

// Brief 可合并的平铺字段
const BRIEF_FIELDS = [
  'genre', 'worldview', 'tone', 'forbidden', 'styleGuide',
  'defaultVisionModel', 'defaultStyle', 'wordCountGoal', 'dailyWordCountGoal',
] as const;

// 该字段是否允许用户覆盖（user 来源则跳过）
function isUserOwned(origin?: Origin): boolean {
  return origin === 'user' || origin === 'init';
}

// ---------- Brief 合并 ----------
export function mergeBrief(local: ProjectBrief | undefined, seed: SeedBrief, projectId: string): ProjectBrief {
  const now = new Date().toISOString();
  const base: ProjectBrief = local ?? { projectId, updatedAt: now };
  const fieldOrigins: NonNullable<ProjectBrief['fieldOrigins']> = { ...(base.fieldOrigins ?? {}) };

  // 平铺字段：用户改过的保留，未动的用种子值
  for (const f of BRIEF_FIELDS) {
    const seedVal = seed[f] as string | number | undefined;
    const owned = isUserOwned(fieldOrigins[f]);
      if (!owned && seedVal !== undefined && seedVal !== '') {
        (base as unknown as Record<string, unknown>)[f] = seedVal;
        fieldOrigins[f] = 'seed';
      }
    // 用户改过或无种子值：保留现状，不动 fieldOrigins
  }

  // sections：按 id 合并
  const localSections = base.sections ?? [];
  const seedSections = seed.sections ?? [];
  const mergedSections = [...localSections];
  for (const s of seedSections) {
    const idx = mergedSections.findIndex((x) => x.id === s.id);
    if (idx >= 0) {
      const cur = mergedSections[idx];
      // 用户改过的维度保留，未动的用种子值
      if (!isUserOwned(cur.origin)) {
        mergedSections[idx] = { ...cur, title: s.title, content: s.content, pinned: s.pinned, origin: 'seed' };
      }
    } else {
      // 种子新增维度 → 追加
      mergedSections.push({ id: s.id, title: s.title, content: s.content, pinned: s.pinned, origin: 'seed' });
    }
  }
  // 本地多余维度（用户自建）保留，不动

  return {
    ...base,
    projectId,
    sections: mergedSections,
    fieldOrigins,
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
                    nodes[nIdx] = { ...nodes[nIdx], title: sn.title, content: sn.content, targetWords: sn.targetWords, charIds: sn.charIds, sectionIds: sn.sectionIds, origin: 'seed' };
                  }
                } else {
                  nodes.push({ ...sn, origin: 'seed' });
                }
                nIds.add(sn.id);
              }
              chapters[cIdx] = { ...ch, title: sc.title, nodes, origin: 'seed' };
            }
          } else {
            chapters.push({ id: sc.id, title: sc.title, nodes: sc.nodes.map((n) => ({ ...n, origin: 'seed' as Origin })), origin: 'seed' });
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
  // 本地多余卷/章/节点（用户自建）保留
  return result;
}

// ---------- Characters 合并 ----------
export function mergeCharacters(
  local: Character[] | undefined,
  seed: SeedCharacter[],
  projectId: string,
): Character[] {
  const base = local ?? [];
  const result: Character[] = [...base];

  for (const sc of seed) {
    const idx = result.findIndex((c) => c.id === sc.id);
    if (idx >= 0) {
      const cur = result[idx];
      // 角色整体以 origin 判断：用户改过的整条保留，未动的用种子刷新
      if (!isUserOwned(cur.origin)) {
        result[idx] = { ...cur, name: sc.name, description: sc.description, role: sc.role, status: sc.status, currentProfile: sc.currentProfile, origin: 'seed' };
      }
    } else {
      result.push({
        id: sc.id,
        name: sc.name,
        description: sc.description,
        role: sc.role,
        status: sc.status,
        currentProfile: sc.currentProfile,
        projectId,
        origin: 'seed',
        createdAt: new Date().toISOString(),
      });
    }
  }
  // 本地多余角色（用户自建）保留
  return result;
}
