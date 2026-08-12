import {
  parseLocations,
  parseCharacters,
  parsePlotThreads,
  parseOutline,
  parseEvents,
  parseForeshadowings,
} from '@/features/map/lib/wizardMarkdown';

/**
 * 初始化/追加共用落库层：解析 Markdown 方案后增量写入。
 * 追加不覆盖：每个步骤先查库按名称去重，重复实体一律跳过（只新增缺失项）。
 */

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

/** 记录未匹配的引用名（LLM 编造/改名时告警，不中断落库）。 */
function warnUnmatched(kind: string, refs: string[], matchedNames: string[]) {
  const missing = refs.filter((r) => !matchedNames.includes(r));
  if (missing.length > 0) {
    console.warn(`[wizard:save] ${kind} 未匹配: ${missing.join('、')}`);
  }
}

async function saveStep1(bookId: number, text: string): Promise<void> {
  // 地点：标题层级 → Location（父级按名字解析 parentId，自定义字段 → attributes）
  const { createLocation, updateLocation, fetchLocations } = await import('@/shared/api/world');
  const locations = parseLocations(text);
  if (locations.length === 0) return;
  const existing = await fetchLocations(bookId).catch(() => []);
  const existingNames = new Set(existing.map((l) => l.name));
  const idMap: Record<string, number> = {};
  for (const loc of locations) {
    if (existingNames.has(loc.name)) continue; // 重复落库防护（追加不覆盖）
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
  // 父级按名字解析（本批 + 已有地点合并），并行更新
  const allIds: Record<string, number> = {
    ...Object.fromEntries(existing.map((l) => [l.name, l.id])),
    ...idMap,
  };
  const parentUpdates: Array<Promise<unknown>> = [];
  for (const loc of locations) {
    if (!idMap[loc.name] || !loc.parentName || !allIds[loc.parentName]) continue;
    parentUpdates.push(
      updateLocation(idMap[loc.name], { parentId: allIds[loc.parentName] }, bookId),
    );
  }
  await Promise.allSettled(parentUpdates);
}

async function saveStep2(bookId: number, text: string): Promise<void> {
  // 角色：别名/状态/自定义字段/首次出场/关系链 → Character
  const { createCharacter, updateCharacter, fetchCharacters } = await import('@/shared/api/characters');
  const { fetchLocations } = await import('@/shared/api/world');
  const characters = parseCharacters(text);
  if (characters.length === 0) return;
  const [existing, locs] = await Promise.all([
    fetchCharacters(bookId).catch(() => []),
    fetchLocations(bookId).catch(() => []),
  ]);
  const existingNames = new Set(existing.map((c) => c.name));
  const locationNameToId = Object.fromEntries(locs.map((l) => [l.name, l.id]));
  const idMap: Record<string, number> = {};
  for (const ch of characters) {
    if (existingNames.has(ch.name)) continue; // 重复落库防护（追加不覆盖）
    const spawnId = ch.spawnLocationName ? locationNameToId[ch.spawnLocationName] : undefined;
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
        ...(spawnId != null ? { spawnLocationId: spawnId } : {}),
      } as Parameters<typeof createCharacter>[0]);
      idMap[ch.name] = created.id;
    } catch { /* 单个角色失败不中断 */ }
  }
  // 关系链：targetName → id（本批 + 已有角色合并），并行更新
  const allIds: Record<string, number> = {
    ...Object.fromEntries(existing.map((c) => [c.name, c.id])),
    ...idMap,
  };
  const chainUpdates: Array<Promise<unknown>> = [];
  for (const ch of characters) {
    const id = idMap[ch.name];
    if (!id || ch.relationships.length === 0) continue;
    const chain = ch.relationships
      .filter((r) => allIds[r.targetName])
      .map((r) => ({ targetId: allIds[r.targetName], type: r.type, description: r.description }));
    if (chain.length === 0) continue;
    chainUpdates.push(
      updateCharacter(id, { relationshipChain: chain } as Parameters<typeof updateCharacter>[1]),
    );
  }
  await Promise.allSettled(chainUpdates);
}

async function saveStep3(bookId: number, text: string): Promise<void> {
  // 情节线：Markdown 层级（# 主线 / ## 支线）→ PlotThread（按名称去重）
  const { createPlotThread, fetchPlotThreads } = await import('@/shared/api/world');
  const threads = parsePlotThreads(text);
  if (threads.length === 0) return;
  const existing = await fetchPlotThreads(bookId).catch(() => []);
  const existingNames = new Set(existing.map((t) => t.name));
  let mainId: number | null = null;
  for (const t of threads) {
    if (existingNames.has(t.name)) continue; // 重复落库防护（追加不覆盖）
    try {
      const created = await createPlotThread({
        bookId,
        name: t.name,
        description: t.description || undefined,
        status: 'active',
        type: t.type || (t.level === 1 ? '主线' : '支线'),
        parentThreadId: t.level === 2 && mainId != null ? mainId : undefined,
      } as Parameters<typeof createPlotThread>[0]);
      existingNames.add(t.name);
      if (t.level === 1) mainId = created.id;
    } catch { /* 单个情节线失败不中断 */ }
  }
}

async function saveStep4(bookId: number, text: string): Promise<void> {
  // 大纲：卷 → 章 → 场景节点 → SceneEvent（时间/地点/角色/情节线）
  // 卷/章按标题去重：已有卷下追加新章，已有章跳过；创建时显式传 sortOrder。
  const { createVolume, createChapter, fetchChaptersTree } = await import('@/shared/api/books');
  const { createSceneEvent, fetchPlotThreads, fetchLocations } = await import('@/shared/api/world');
  const { fetchCharacters } = await import('@/shared/api/characters');
  const volumes = parseOutline(text);
  if (volumes.length === 0) return;
  const [chars, threads, locs, tree] = await Promise.all([
    fetchCharacters(bookId).catch(() => []),
    fetchPlotThreads(bookId).catch(() => []),
    fetchLocations(bookId).catch(() => []),
    fetchChaptersTree(bookId).catch(() => []),
  ]);
  const charNameToId = Object.fromEntries(chars.map((c: { name: string; id: number }) => [c.name, c.id]));
  const threadNameToId = Object.fromEntries(threads.map((t: { name: string; id: number }) => [t.name, t.id]));
  const existingVolByTitle = new Map(tree.map((v) => [v.title, v]));
  const existingChByVolTitle = new Map<string, Set<string>>(
    tree.map((v) => [v.title, new Set(v.chapters.map((c) => c.title))]),
  );

  for (const [vi, vol] of volumes.entries()) {
    let existingVol = existingVolByTitle.get(vol.title);
    if (!existingVol) {
      const created = await createVolume(bookId, vol.title, vol.summary || undefined, vi + 1);
      // 本批去重：后续同名卷标题直接复用（LLM 偶尔重复输出卷块）
      existingVol = { ...created, chapters: [] };
      existingVolByTitle.set(vol.title, existingVol);
    }
    const volId = existingVol.id;
    const existingChTitles = existingChByVolTitle.get(vol.title) ?? new Set<string>();
    for (const [ci, ch] of vol.chapters.entries()) {
      if (existingChTitles.has(ch.title)) continue; // 重复章跳过
      const createdCh = await createChapter(volId, { title: ch.title, summary: ch.summary || undefined, sortOrder: ci + 1 });
      existingChTitles.add(ch.title);
      for (const sc of ch.scenes) {
        try {
          const loc = sc.location
            ? locs.find((l) => l.name === sc.location || sc.location.includes(l.name) || l.name.includes(sc.location))
            : undefined;
          const matchedCharNames = sc.characters.filter((n) => charNameToId[n] != null);
          const matchedThreadNames = sc.plotThreads.filter((n) => threadNameToId[n] != null);
          const matchedChars = matchedCharNames.map((n) => charNameToId[n]);
          const matchedThreads = matchedThreadNames.map((n) => threadNameToId[n]);
          warnUnmatched('场景角色', sc.characters, matchedCharNames);
          warnUnmatched('场景情节线', sc.plotThreads, matchedThreadNames);
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

async function saveStep5(bookId: number, text: string): Promise<void> {
  // 事件：章节/时间/地点/角色/情节线 → SceneEvent（按标题去重）
  const { createSceneEvent, fetchLocations, fetchPlotThreads, fetchSceneEvents } = await import('@/shared/api/world');
  const { fetchChaptersTree } = await import('@/shared/api/books');
  const { fetchCharacters } = await import('@/shared/api/characters');
  const events = parseEvents(text);
  if (events.length === 0) return;
  const [locs, tree, chars, threads, existingEvents] = await Promise.all([
    fetchLocations(bookId).catch(() => []),
    fetchChaptersTree(bookId).catch(() => []),
    fetchCharacters(bookId).catch(() => []),
    fetchPlotThreads(bookId).catch(() => []),
    fetchSceneEvents(bookId).catch(() => []),
  ]);
  const existingTitles = new Set(existingEvents.map((e) => e.title));
  const charNameToId = Object.fromEntries(chars.map((c: { name: string; id: number }) => [c.name, c.id]));
  const threadNameToId = Object.fromEntries(threads.map((t: { name: string; id: number }) => [t.name, t.id]));
  for (const ev of events) {
    if (existingTitles.has(ev.title)) continue; // 重复落库防护（追加不覆盖）
    // 章节归属：优先「卷·章」组合引用，失败回退全局序号/标题/子串匹配
    const chapterId = ev.chapterRef ? matchChapterRef(tree, ev.chapterRef) : undefined;
    const loc = ev.location
      ? locs.find((l) => l.name === ev.location || ev.location.includes(l.name) || l.name.includes(ev.location))
      : undefined;
    const matchedCharNames = ev.characters.filter((n) => charNameToId[n] != null);
    const matchedThreadNames = ev.plotThreads.filter((n) => threadNameToId[n] != null);
    const matchedChars = matchedCharNames.map((n) => charNameToId[n]);
    const matchedThreads = matchedThreadNames.map((n) => threadNameToId[n]);
    warnUnmatched('事件角色', ev.characters, matchedCharNames);
    warnUnmatched('事件情节线', ev.plotThreads, matchedThreadNames);
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

async function saveStep6(bookId: number, text: string): Promise<void> {
  // 伏笔：类型/角色/埋下事件/揭示建议 → Foreshadowing（原始类型存 type，揭示建议存 notes）
  const { createForeshadowing, fetchSceneEvents, fetchForeshadowings } = await import('@/shared/api/world');
  const { fetchCharacters } = await import('@/shared/api/characters');
  const items = parseForeshadowings(text);
  if (items.length === 0) return;
  const [events, chars, existing] = await Promise.all([
    fetchSceneEvents(bookId).catch(() => []),
    fetchCharacters(bookId).catch(() => []),
    fetchForeshadowings(bookId).catch(() => []),
  ]);
  const existingDescriptions = new Set(existing.map((f) => f.description));
  const charNameToId = Object.fromEntries(chars.map((c: { name: string; id: number }) => [c.name, c.id]));
  for (const it of items) {
    const description = `${it.title}${it.description ? '：' + it.description : ''}`;
    // 重复落库防护（追加不覆盖）：按标题前缀匹配，LLM 重生成描述变化时也能防重
    if ([...existingDescriptions].some((d) => d.startsWith(it.title))) continue;
    // 埋下事件：精确标题 → 双向子串兜底
    const relatedEvent = it.relatedEvent
      ? events.find((e) => e.title === it.relatedEvent)
        ?? events.find((e) => nameMatches(e.title, it.relatedEvent))
      : undefined;
    const body: Record<string, unknown> = {
      bookId,
      description,
      status: 'planted',
      revealType: mapRevealType(it.type),
      type: it.type || undefined,
      relatedCharacterIds: it.characters.map((n) => charNameToId[n]).filter(Boolean),
    };
    if (relatedEvent) body.relatedEventId = relatedEvent.id;
    if (it.revealTiming) body.notes = `建议揭示时机：${it.revealTiming}`;
    try {
      await createForeshadowing(body as Parameters<typeof createForeshadowing>[0]);
      existingDescriptions.add(description);
    } catch { /* 单个伏笔失败不中断 */ }
  }
}

const STEP_SAVERS: Record<number, (bookId: number, text: string) => Promise<void>> = {
  1: saveStep1,
  2: saveStep2,
  3: saveStep3,
  4: saveStep4,
  5: saveStep5,
  6: saveStep6,
};

export async function saveStepText(bookId: number, step: number, text: string): Promise<void> {
  if (!text || !text.trim()) return;
  const saver = STEP_SAVERS[step];
  if (saver) await saver(bookId, text);
}
