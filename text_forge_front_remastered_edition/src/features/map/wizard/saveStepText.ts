import {
  parseLocations,
  parseCharacters,
  parsePlotThreads,
  parseOutline,
  parseEvents,
  parseForeshadowings,
  parseStepJson,
} from '@/features/map/lib/wizardMarkdown';
import type {
  ParsedLocation,
  ParsedCharacter,
  ParsedPlotThread,
  ParsedOutlineVolume,
  ParsedEvent,
  ParsedForeshadowing,
  ParsedStepResult,
} from '@/features/map/lib/wizardMarkdown';

/**
 * 初始化/追加共用落库层：优先消费 Markdown 方案末尾的 JSON 数据块，
 * JSON 缺失/损坏时回退 Markdown 解析。
 * 追加不覆盖：先查库按名称去重，重复实体一律跳过（只新增缺失项）。
 * 引用字段合法性校验：解析不到合法引用（章节/角色/地点/情节线/事件）时
 * 抛出 WizardValidationError 携带明细，中止整步落库，由用户微调后重试。
 */

export class WizardValidationError extends Error {
  constructor(public errors: string[]) {
    super(`方案数据校验失败（${errors.length} 处）：\n` + errors.join('\n'));
    this.name = 'WizardValidationError';
  }
}

function cnToNum(s: string): number | null {
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const cleaned = s.replace(/[^一二三四五六七八九十\d]/g, '');
  if (/^\d+$/.test(cleaned)) return parseInt(cleaned, 10);
  if (cleaned === '十') return 10;
  if (cleaned.length === 2 && cleaned.startsWith('十')) return 10 + (map[cleaned[1]] ?? 0);
  if (cleaned.length === 2 && cleaned.endsWith('十')) return (map[cleaned[0]] ?? 0) * 10;
  if (cleaned.length === 3) return (map[cleaned[0]] ?? 0) * 10 + (map[cleaned[2]] ?? 0);
  return map[cleaned] ?? null;
}

function mapRevealType(raw: string): string {
  if (raw.includes('突然') || raw.includes('反转') || raw.includes('背叛')) return 'sudden';
  if (raw.includes('转折') || raw.includes('悬念') || raw.includes('谜团') || raw.includes('秘密') || raw.includes('预言') || raw.includes('身份')) return 'twist';
  return 'gradual';
}

/** 名称模糊匹配：LLM 输出与实际名称不完全一致时双向子串兜底。 */
function nameMatches(actual: string, ref: string): boolean {
  return actual === ref || actual.includes(ref) || ref.includes(actual);
}

/**
 * 引用匹配：JSON 路径优先按 [id] 精确匹配（refId），否则名称匹配。
 * 返回匹配到的实体；未匹配返回 undefined。
 */
function matchEntity<T extends { id: number; name: string }>(
  entities: T[],
  refName: string | undefined,
  refId: number | undefined,
): T | undefined {
  if (refId != null) {
    const byId = entities.find((e) => e.id === refId);
    if (byId) return byId;
  }
  if (refName) {
    const exact = entities.find((e) => e.name === refName);
    if (exact) return exact;
    return entities.find((e) => nameMatches(e.name, refName));
  }
  return undefined;
}

/**
 * 卷内章节匹配：序号（"第一章"/"1" → 卷内 sortOrder）→ 精确标题 → 双向子串。
 */
function matchChapterInVolume(
  volChapters: Array<{ id: number; title: string; sortOrder: number }>,
  ref: string,
): { id: number } | undefined {
  if (!ref) return undefined;
  const num = cnToNum(ref);
  if (num != null) {
    const byOrder = volChapters.find((c) => c.sortOrder === num);
    if (byOrder) return byOrder;
  }
  const byTitle = volChapters.find((c) => c.title === ref);
  if (byTitle) return byTitle;
  return volChapters.find((c) => nameMatches(c.title, ref));
}

/**
 * 章节引用匹配（Step 5 事件归属）：
 * 1. 优先「卷标题·章标题」组合引用（提示词要求 LLM 输出，多卷同名章靠卷消歧）
 * 2. 失败回退全局匹配：序号 → 精确标题 → 双向子串
 */
function matchChapterRef(
  vols: Array<{ id: number; title: string; sortOrder: number; chapters: Array<{ id: number; title: string; sortOrder: number }> }>,
  ref: string,
): number | undefined {
  if (!ref) return undefined;
  const parts = ref.split(/[·・|｜]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const volPart = parts[0];
    const vol = vols.find((v) => nameMatches(v.title, volPart))
      ?? (() => {
        const n = cnToNum(volPart);
        return n != null ? vols.find((v) => v.sortOrder === n) : undefined;
      })();
    if (vol) {
      const ch = matchChapterInVolume(vol.chapters, parts.slice(1).join('·'));
      if (ch) return ch.id;
    }
  }
  const allChapters = vols.flatMap((v) => v.chapters);
  const num = cnToNum(ref);
  if (num != null) {
    const byOrder = allChapters.find((c) => c.sortOrder === num);
    if (byOrder) return byOrder.id;
  }
  const byTitle = allChapters.find((c) => c.title === ref);
  if (byTitle) return byTitle.id;
  return allChapters.find((c) => nameMatches(c.title, ref))?.id;
}

/** 名称→id 映射（校验阶段已保证存在，落库阶段名称匹配必须成功）。 */
function charNameToId(chars: Array<{ id: number; name: string }>, name: string): number | undefined {
  return matchEntity(chars, name, undefined)?.id;
}

function threadNameToId(threads: Array<{ id: number; name: string }>, name: string): number | undefined {
  return matchEntity(threads, name, undefined)?.id;
}

/* ── Step 1：地点 ── */

async function persistLocations(bookId: number, locations: ParsedLocation[]): Promise<void> {
  if (locations.length === 0) return;
  const { createLocation, updateLocation, fetchLocations } = await import('@/shared/api/world');
  const existing = await fetchLocations(bookId).catch(() => []);
  const errors: string[] = [];
  const toCreate: ParsedLocation[] = [];
  const existingNames = new Set(existing.map((l) => l.name));
  for (const loc of locations) {
    if (!loc.name) {
      errors.push('存在名称为空的地点条目');
      continue;
    }
    if (existingNames.has(loc.name)) continue; // 重复落库防护（追加不覆盖）
    if (loc.parentName || loc.parentRefId != null) {
      const parentInBatch = loc.parentName != null && locations.some((x) => x.name === loc.parentName);
      const parentExisting = loc.parentRefId != null
        ? existing.some((l) => l.id === loc.parentRefId)
        : loc.parentName != null && [...existing].some((l) => nameMatches(l.name, loc.parentName!));
      if (!parentInBatch && !parentExisting) {
        errors.push(`地点「${loc.name}」的父地点「${loc.parentName ?? `[${loc.parentRefId}]`}」不存在，请输入已有地点名或置空`);
      }
    }
    toCreate.push(loc);
  }
  if (errors.length > 0) throw new WizardValidationError(errors);

  const idMap: Record<string, number> = {};
  const byId = new Map(existing.map((l) => [l.id, l]));
  for (const loc of toCreate) {
    try {
      const created = await createLocation({
        bookId,
        name: loc.name,
        type: loc.type || '城镇',
        description: loc.description || undefined,
        attributes: Object.keys(loc.customFields).length > 0 ? loc.customFields : undefined,
      } as Parameters<typeof createLocation>[0]);
      idMap[loc.name] = created.id;
    } catch { /* 单个地点失败不中断 */ }
  }
  const allIds: Record<string, number> = {
    ...Object.fromEntries(existing.map((l) => [l.name, l.id])),
    ...idMap,
  };
  const parentUpdates: Array<Promise<unknown>> = [];
  for (const loc of toCreate) {
    const id = idMap[loc.name];
    if (!id) continue;
    let parentId: number | undefined;
    if (loc.parentRefId != null && byId.has(loc.parentRefId)) {
      parentId = loc.parentRefId;
    } else if (loc.parentName) {
      parentId = allIds[loc.parentName];
    }
    if (parentId != null) {
      parentUpdates.push(updateLocation(id, { parentId }, bookId));
    }
  }
  await Promise.allSettled(parentUpdates);
}

/* ── Step 2：角色 ── */

async function persistCharacters(bookId: number, characters: ParsedCharacter[]): Promise<void> {
  if (characters.length === 0) return;
  const { createCharacter, updateCharacter, fetchCharacters } = await import('@/shared/api/characters');
  const { fetchLocations } = await import('@/shared/api/world');
  const [existing, locs] = await Promise.all([
    fetchCharacters(bookId).catch(() => []),
    fetchLocations(bookId).catch(() => []),
  ]);
  const errors: string[] = [];
  const existingNames = new Set(existing.map((c) => c.name));
  const toCreate: ParsedCharacter[] = [];
  for (const ch of characters) {
    if (!ch.name) {
      errors.push('存在名称为空的角色条目');
      continue;
    }
    if (existingNames.has(ch.name)) continue; // 重复落库防护（追加不覆盖）
    if (ch.spawnLocationName || ch.spawnLocationRefId != null) {
      const ok = matchEntity(locs, ch.spawnLocationName, ch.spawnLocationRefId);
      if (!ok) {
        errors.push(`角色「${ch.name}」的首次出场地点「${ch.spawnLocationName ?? `[${ch.spawnLocationRefId}]`}」不存在，请输入已有地点名或置空`);
      }
    }
    for (const rel of ch.relationships) {
      if (!rel.targetName) continue;
      // 目标可能在本批新建（关系链创建后统一回填）
      const inBatch = characters.some((x) => x.name === rel.targetName);
      const inExisting = [...existing].some((c) => nameMatches(c.name, rel.targetName));
      if (!inBatch && !inExisting) {
        errors.push(`角色「${ch.name}」的关系目标「${rel.targetName}」不存在，请输入已有角色名或置空`);
      }
    }
    toCreate.push(ch);
  }
  if (errors.length > 0) throw new WizardValidationError(errors);

  const idMap: Record<string, number> = {};
  const existingById = new Map(existing.map((c) => [c.id, c]));
  for (const ch of toCreate) {
    const spawnRef = matchEntity(locs, ch.spawnLocationName, ch.spawnLocationRefId);
    try {
      const created = await createCharacter({
        bookId,
        name: ch.name,
        roleType: ch.roleType || '配角',
        aliases: ch.aliases,
        status: ch.status || '活跃',
        // 后端 description 必填：空描述兜底空串，避免 422 静默丢角色
        description: ch.description || '',
        customFields: Object.keys(ch.customFields).length > 0 ? ch.customFields : undefined,
        ...(spawnRef ? { spawnLocationId: spawnRef.id } : {}),
      } as Parameters<typeof createCharacter>[0]);
      idMap[ch.name] = created.id;
    } catch { /* 单个角色失败不中断 */ }
  }
  const allIds: Record<string, number> = {
    ...Object.fromEntries(existing.map((c) => [c.name, c.id])),
    ...idMap,
  };
  const chainUpdates: Array<Promise<unknown>> = [];
  for (const ch of toCreate) {
    const id = idMap[ch.name];
    if (!id || ch.relationships.length === 0) continue;
    const chain = ch.relationships
      .map((r) => {
        // JSON 路径优先 targetRefId（[id] 精确），否则按名称
        const targetId = r.targetRefId != null && existingById.has(r.targetRefId)
          ? r.targetRefId
          : allIds[r.targetName];
        return { targetId, type: r.type, description: r.description };
      })
      .filter((r) => r.targetId != null);
    if (chain.length === 0) continue;
    chainUpdates.push(
      updateCharacter(id, { relationshipChain: chain } as Parameters<typeof updateCharacter>[1]),
    );
  }
  await Promise.allSettled(chainUpdates);
}

/* ── Step 3：情节线 ── */

async function persistPlotThreads(bookId: number, threads: ParsedPlotThread[]): Promise<void> {
  if (threads.length === 0) return;
  const { createPlotThread, fetchPlotThreads } = await import('@/shared/api/world');
  const existing = await fetchPlotThreads(bookId).catch(() => []);
  const errors: string[] = [];
  const existingNames = new Set(existing.map((t) => t.name));
  const toCreate: ParsedPlotThread[] = [];
  for (const t of threads) {
    if (!t.name) {
      errors.push('存在名称为空的情节线条目');
      continue;
    }
    if (existingNames.has(t.name)) continue; // 重复落库防护（追加不覆盖）
    if (t.parentName) {
      const inBatch = threads.some((x) => x.name === t.parentName);
      const inExisting = [...existing].some((x) => nameMatches(x.name, t.parentName!));
      if (!inBatch && !inExisting) {
        errors.push(`情节线「${t.name}」的父线「${t.parentName}」不存在，请输入已有线名或置空`);
      }
    }
    toCreate.push(t);
  }
  if (errors.length > 0) throw new WizardValidationError(errors);

  const allNames: Record<string, number> = {
    ...Object.fromEntries(existing.map((t) => [t.name, t.id])),
  };
  const existingById = new Map(existing.map((t) => [t.id, t]));
  let mainId: number | null = null;
  for (const t of toCreate) {
    try {
      // 父线优先：parentRefId（JSON 路径 [id]）→ parentName → 本批最近主线
      const parentByRef = t.parentRefId != null ? existingById.get(t.parentRefId) : undefined;
      const parentId = parentByRef?.id
        ?? allNames[t.parentName ?? '']
        ?? (t.level === 2 && mainId != null ? mainId : undefined);
      const created = await createPlotThread({
        bookId,
        name: t.name,
        description: t.description || undefined,
        status: 'active',
        type: t.type || (t.level === 1 ? '主线' : '支线'),
        parentThreadId: parentId,
      } as Parameters<typeof createPlotThread>[0]);
      existingNames.add(t.name);
      allNames[t.name] = created.id;
      if (t.level === 1) mainId = created.id;
    } catch { /* 单个情节线失败不中断 */ }
  }
}

/* ── Step 4：大纲 ── */

async function persistOutline(bookId: number, volumes: ParsedOutlineVolume[]): Promise<void> {
  if (volumes.length === 0) return;
  const { createVolume, createChapter, fetchChaptersTree } = await import('@/shared/api/books');
  const { createSceneEvent, fetchPlotThreads, fetchLocations } = await import('@/shared/api/world');
  const { fetchCharacters } = await import('@/shared/api/characters');
  const [chars, threads, locs, tree] = await Promise.all([
    fetchCharacters(bookId).catch(() => []),
    fetchPlotThreads(bookId).catch(() => []),
    fetchLocations(bookId).catch(() => []),
    fetchChaptersTree(bookId).catch(() => []),
  ]);
  const errors: string[] = [];
  for (const vol of volumes) {
    if (!vol.title) {
      errors.push('存在标题为空的卷条目');
      continue;
    }
    for (const [ci, ch] of vol.chapters.entries()) {
      if (!ch.title) {
        errors.push(`卷「${vol.title}」中存在标题为空的章条目`);
        continue;
      }
      for (const [si, sc] of ch.scenes.entries()) {
        const at = `卷「${vol.title}」第${ci + 1}章场景「${sc.title || si + 1}」`;
        if (sc.location || sc.locationRefId != null) {
          const ok = matchEntity(locs, sc.location, sc.locationRefId);
          if (!ok) errors.push(`${at}：地点「${sc.location ?? `[${sc.locationRefId}]`}」不存在，请输入已有地点名或置空`);
        }
        sc.characters.forEach((n, idx) => {
          const refId = sc.charactersRefIds?.[idx];
          if (!matchEntity(chars, n, refId)) {
            errors.push(`${at}：角色「${n || `[${refId}]`}」不存在，请输入已有角色名或置空`);
          }
        });
        sc.plotThreads.forEach((n, idx) => {
          const refId = sc.plotThreadsRefIds?.[idx];
          if (!matchEntity(threads, n, refId)) {
            errors.push(`${at}：情节线「${n || `[${refId}]`}」不存在，请输入已有情节线名或置空`);
          }
        });
      }
    }
  }
  if (errors.length > 0) throw new WizardValidationError(errors);

  const existingVolByTitle = new Map(tree.map((v) => [v.title, v]));
  const existingChByVolTitle = new Map<string, Set<string>>(
    tree.map((v) => [v.title, new Set(v.chapters.map((c) => c.title))]),
  );

  for (const [vi, vol] of volumes.entries()) {
    let existingVol = existingVolByTitle.get(vol.title);
    if (!existingVol) {
      const created = await createVolume(bookId, vol.title, vol.summary || undefined, vi + 1);
      // 本批去重：后续同名卷标题直接复用（LLM 偶尔重复输出卷块）；章集合同步注册
      existingVol = { ...created, chapters: [] };
      existingVolByTitle.set(vol.title, existingVol);
      existingChByVolTitle.set(vol.title, new Set<string>());
    }
    const volId = existingVol.id;
    const existingChTitles = existingChByVolTitle.get(vol.title) ?? new Set<string>();
    for (const [ci, ch] of vol.chapters.entries()) {
      if (existingChTitles.has(ch.title)) continue; // 重复章跳过
      const createdCh = await createChapter(volId, { title: ch.title, summary: ch.summary || undefined, sortOrder: ci + 1 });
      existingChTitles.add(ch.title);
      for (const sc of ch.scenes) {
        try {
          const loc = matchEntity(locs, sc.location, sc.locationRefId);
          const matchedChars = sc.characters.map((n, idx) => {
            const refId = sc.charactersRefIds?.[idx];
            return refId != null ? (chars.find((c) => c.id === refId)?.id) : charNameToId(chars, n);
          }).filter((x): x is number => x != null);
          const matchedThreads = sc.plotThreads.map((n, idx) => {
            const refId = sc.plotThreadsRefIds?.[idx];
            return refId != null ? (threads.find((t) => t.id === refId)?.id) : threadNameToId(threads, n);
          }).filter((x): x is number => x != null);
          await createSceneEvent({
            bookId,
            title: sc.title,
            content: sc.summary || undefined,
            eventType: 'scene',
            sortOrder: 0,
            chapterId: createdCh.id,
            storyLabel: sc.timeLabel || undefined,
            locationId: loc?.id,
            characterIds: matchedChars,
            plotThreadIds: matchedThreads,
          } as Parameters<typeof createSceneEvent>[0]);
        } catch { /* 单个场景失败不影响主流程 */ }
      }
    }
  }
}

/* ── Step 5：事件 ── */

async function persistEvents(bookId: number, events: ParsedEvent[]): Promise<void> {
  if (events.length === 0) return;
  const { createSceneEvent, fetchLocations, fetchPlotThreads, fetchSceneEvents } = await import('@/shared/api/world');
  const { fetchChaptersTree } = await import('@/shared/api/books');
  const { fetchCharacters } = await import('@/shared/api/characters');
  const [locs, tree, chars, threads, existingEvents] = await Promise.all([
    fetchLocations(bookId).catch(() => []),
    fetchChaptersTree(bookId).catch(() => []),
    fetchCharacters(bookId).catch(() => []),
    fetchPlotThreads(bookId).catch(() => []),
    fetchSceneEvents(bookId).catch(() => []),
  ]);
  const existingTitles = new Set(existingEvents.map((e) => e.title));
  const allChapterIds = new Set(tree.flatMap((v) => v.chapters).map((c) => c.id));
  const errors: string[] = [];
  for (const ev of events) {
    if (!ev.title) {
      errors.push('存在名称为空的事件条目');
      continue;
    }
    if (existingTitles.has(ev.title)) continue; // 重复落库防护（追加不覆盖）
    // 章节引用校验：JSON 路径优先 [id]，否则「卷·章」/标题/序号匹配
    if (ev.chapterRef || ev.chapterRefId != null) {
      const chapterId = ev.chapterRefId != null
        ? (allChapterIds.has(ev.chapterRefId) ? ev.chapterRefId : undefined)
        : matchChapterRef(tree, ev.chapterRef);
      if (chapterId == null) {
        errors.push(`事件「${ev.title}」的章节引用「${ev.chapterRef || `[${ev.chapterRefId}]`}」未匹配到任何章节，请输入已有章标题或「卷·章」组合（如 卷一·初入江湖）`);
      }
    }
    if (ev.location || ev.locationRefId != null) {
      const ok = matchEntity(locs, ev.location, ev.locationRefId);
      if (!ok) errors.push(`事件「${ev.title}」的地点「${ev.location ?? `[${ev.locationRefId}]`}」不存在，请输入已有地点名或置空`);
    }
    ev.characters.forEach((n, idx) => {
      const refId = ev.charactersRefIds?.[idx];
      if (!matchEntity(chars, n, refId)) {
        errors.push(`事件「${ev.title}」的角色「${n || `[${refId}]`}」不存在，请输入已有角色名或置空`);
      }
    });
    ev.plotThreads.forEach((n, idx) => {
      const refId = ev.plotThreadsRefIds?.[idx];
      if (!matchEntity(threads, n, refId)) {
        errors.push(`事件「${ev.title}」的情节线「${n || `[${refId}]`}」不存在，请输入已有情节线名或置空`);
      }
    });
  }
  if (errors.length > 0) throw new WizardValidationError(errors);

  for (const ev of events) {
    if (existingTitles.has(ev.title)) continue;
    const chapterId = ev.chapterRefId != null
      ? (allChapterIds.has(ev.chapterRefId) ? ev.chapterRefId : undefined)
      : (ev.chapterRef ? matchChapterRef(tree, ev.chapterRef) : undefined);
    const loc = matchEntity(locs, ev.location, ev.locationRefId);
    const matchedChars = ev.characters.map((n, idx) => {
      const refId = ev.charactersRefIds?.[idx];
      return refId != null ? (chars.find((c) => c.id === refId)?.id) : charNameToId(chars, n);
    }).filter((x): x is number => x != null);
    const matchedThreads = ev.plotThreads.map((n, idx) => {
      const refId = ev.plotThreadsRefIds?.[idx];
      return refId != null ? (threads.find((t) => t.id === refId)?.id) : threadNameToId(threads, n);
    }).filter((x): x is number => x != null);
    try {
      await createSceneEvent({
        bookId,
        title: ev.title,
        content: ev.summary || undefined,
        eventType: 'event',
        sortOrder: 0,
        chapterId,
        storyLabel: ev.timeLabel || undefined,
        locationId: loc?.id,
        characterIds: matchedChars,
        plotThreadIds: matchedThreads,
      } as Parameters<typeof createSceneEvent>[0]);
      existingTitles.add(ev.title);
    } catch { /* 单个事件失败不影响主流程 */ }
  }
}

/* ── Step 6：伏笔 ── */

async function persistForeshadowings(bookId: number, items: ParsedForeshadowing[]): Promise<void> {
  if (items.length === 0) return;
  const { createForeshadowing, fetchSceneEvents, fetchForeshadowings } = await import('@/shared/api/world');
  const { fetchCharacters } = await import('@/shared/api/characters');
  const [events, chars, existing] = await Promise.all([
    fetchSceneEvents(bookId).catch(() => []),
    fetchCharacters(bookId).catch(() => []),
    fetchForeshadowings(bookId).catch(() => []),
  ]);
  // 重复落库防护（追加不覆盖）：按标题前缀匹配，LLM 重生成描述变化时也能防重
  const existingDescriptions = new Set(existing.map((f) => f.description));
  const isDuplicate = (it: ParsedForeshadowing) => [...existingDescriptions].some((d) => d.startsWith(it.title));
  const errors: string[] = [];
  for (const it of items) {
    if (!it.title) {
      errors.push('存在名称为空的伏笔条目');
      continue;
    }
    if (isDuplicate(it)) continue;
    if (it.relatedEvent || it.relatedEventRefId != null) {
      const ok = it.relatedEventRefId != null
        ? events.some((e) => e.id === it.relatedEventRefId)
        : [...events].some((e) => nameMatches(e.title, it.relatedEvent));
      if (!ok) {
        errors.push(`伏笔「${it.title}」的埋下事件「${it.relatedEvent}」不存在，请输入已有事件名或置空`);
      }
    }
    for (const n of it.characters) {
      if (!matchEntity(chars, n, undefined)) errors.push(`伏笔「${it.title}」的角色「${n}」不存在，请输入已有角色名或置空`);
    }
  }
  if (errors.length > 0) throw new WizardValidationError(errors);

  for (const it of items) {
    const description = `${it.title}${it.description ? '：' + it.description : ''}`;
    if (isDuplicate(it)) continue;
    const relatedEvent = it.relatedEventRefId != null
      ? events.find((e) => e.id === it.relatedEventRefId)
      : (it.relatedEvent
        ? events.find((e) => e.title === it.relatedEvent) ?? events.find((e) => nameMatches(e.title, it.relatedEvent))
        : undefined);
    const body: Record<string, unknown> = {
      bookId,
      description,
      status: 'planted',
      revealType: mapRevealType(it.type),
      type: it.type || undefined,
      relatedCharacterIds: it.characters.map((n) => charNameToId(chars, n)).filter(Boolean),
    };
    if (relatedEvent) body.relatedEventId = relatedEvent.id;
    if (it.revealTiming) body.notes = `建议揭示时机：${it.revealTiming}`;
    try {
      await createForeshadowing(body as Parameters<typeof createForeshadowing>[0]);
      existingDescriptions.add(description);
    } catch { /* 单个伏笔失败不中断 */ }
  }
}

/* ── 入口：结构化数据 / Markdown 文本 ── */

const ITEM_PERSISTERS: Record<number, (bookId: number, items: never) => Promise<void>> = {
  1: persistLocations as never,
  2: persistCharacters as never,
  3: persistPlotThreads as never,
  4: persistOutline as never,
  5: persistEvents as never,
  6: persistForeshadowings as never,
};

/** 结构化落库（表单确认/微调后直接调用；引用不合法抛 WizardValidationError）。 */
export async function saveStepItems(bookId: number, step: number, items: unknown): Promise<void> {
  if (!items) return;
  const persister = ITEM_PERSISTERS[step];
  if (persister) await persister(bookId, items as never);
}

/** 统一解析入口：优先 Markdown 末尾 JSON 数据块，缺失/损坏回退 Markdown 解析器。 */
export function parseStepItems(
  text: string,
  step: number,
): ParsedStepResult | null {
  if (!text || !text.trim()) return null;
  const jsonItems = parseStepJson(text, step);
  if (jsonItems != null) return jsonItems;
  switch (step) {
    case 1: return parseLocations(text);
    case 2: return parseCharacters(text);
    case 3: return parsePlotThreads(text);
    case 4: return parseOutline(text);
    case 5: return parseEvents(text);
    case 6: return parseForeshadowings(text);
    default: return null;
  }
}

/** Markdown 文本落库：优先解析末尾 JSON 数据块，缺失/损坏回退 Markdown 解析器。 */
export async function saveStepText(bookId: number, step: number, text: string): Promise<void> {
  const items = parseStepItems(text, step);
  await saveStepItems(bookId, step, items);
}
