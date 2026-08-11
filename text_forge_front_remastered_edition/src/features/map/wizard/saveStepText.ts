import {
  parseLocations,
  parseCharacters,
  parsePlotThreads,
  parseOutline,
  parseEvents,
  parseForeshadowings,
} from '@/features/map/lib/wizardMarkdown';

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

async function saveStep1(bookId: number, text: string): Promise<void> {
  // 地点：标题层级 → Location（父级按名字解析 parentId，自定义字段 → attributes）
  const { createLocation, updateLocation, fetchLocations } = await import('@/shared/api/world');
  const locations = parseLocations(text);
  if (locations.length === 0) return;
  const existing = await fetchLocations(bookId).catch(() => []);
  const existingNames = new Set(existing.map((l) => l.name));
  const idMap: Record<string, number> = {};
  for (const loc of locations) {
    if (existingNames.has(loc.name)) continue; // 重复落库防护
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
    if (existingNames.has(ch.name)) continue; // 重复落库防护
    const spawnId = ch.spawnLocationName ? locationNameToId[ch.spawnLocationName] : undefined;
    try {
      const created = await createCharacter({
        bookId,
        name: ch.name,
        roleType: ch.roleType || '配角',
        aliases: ch.aliases,
        status: ch.status || '活跃',
        description: ch.description || undefined,
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
  // 情节线：Markdown 层级（# 主线 / ## 支线）→ PlotThread
  const { createPlotThread } = await import('@/shared/api/world');
  const threads = parsePlotThreads(text);
  let mainId: number | null = null;
  for (const t of threads) {
    const created = await createPlotThread({
      bookId,
      name: t.name,
      description: t.description || undefined,
      status: 'active',
      type: t.type || (t.level === 1 ? '主线' : '支线'),
      parentThreadId: t.level === 2 && mainId != null ? mainId : undefined,
    } as Parameters<typeof createPlotThread>[0]);
    if (t.level === 1) mainId = created.id;
  }
}

async function saveStep4(bookId: number, text: string): Promise<void> {
  // 大纲：卷 → 章 → 场景节点 → SceneEvent（时间/地点/角色/情节线）
  const { createVolume, createChapter } = await import('@/shared/api/books');
  const { createSceneEvent, fetchPlotThreads, fetchLocations } = await import('@/shared/api/world');
  const { fetchCharacters } = await import('@/shared/api/characters');
  const volumes = parseOutline(text);
  const [chars, threads, locs] = await Promise.all([
    fetchCharacters(bookId).catch(() => []),
    fetchPlotThreads(bookId).catch(() => []),
    fetchLocations(bookId).catch(() => []),
  ]);
  const charNameToId = Object.fromEntries(chars.map((c: { name: string; id: number }) => [c.name, c.id]));
  const threadNameToId = Object.fromEntries(threads.map((t: { name: string; id: number }) => [t.name, t.id]));
  for (const vol of volumes) {
    const createdVol = await createVolume(bookId, vol.title, vol.summary || undefined);
    for (const ch of vol.chapters) {
      const createdCh = await createChapter(createdVol.id, { title: ch.title, summary: ch.summary || undefined });
      for (const sc of ch.scenes) {
        try {
          const loc = sc.location
            ? locs.find((l) => l.name === sc.location || sc.location.includes(l.name) || l.name.includes(sc.location))
            : undefined;
          await createSceneEvent({
            bookId,
            title: sc.title,
            content: sc.summary || undefined,
            eventType: 'scene',
            sortOrder: 0,
            chapterId: createdCh.id,
            storyLabel: sc.timeLabel || undefined,
            locationId: loc?.id,
            characterIds: sc.characters.map((n) => charNameToId[n]).filter(Boolean),
            plotThreadIds: sc.plotThreads.map((n) => threadNameToId[n]).filter(Boolean),
          } as Parameters<typeof createSceneEvent>[0]);
        } catch { /* 单个场景失败不影响主流程 */ }
      }
    }
  }
}

async function saveStep5(bookId: number, text: string): Promise<void> {
  // 事件：章节/时间/地点/角色/情节线 → SceneEvent
  const { createSceneEvent, fetchLocations, fetchPlotThreads } = await import('@/shared/api/world');
  const { fetchChaptersTree } = await import('@/shared/api/books');
  const { fetchCharacters } = await import('@/shared/api/characters');
  const events = parseEvents(text);
  const [locs, tree, chars, threads] = await Promise.all([
    fetchLocations(bookId).catch(() => []),
    fetchChaptersTree(bookId).catch(() => []),
    fetchCharacters(bookId).catch(() => []),
    fetchPlotThreads(bookId).catch(() => []),
  ]);
  const chapters = tree.flatMap((v) => v.chapters);
  const charNameToId = Object.fromEntries(chars.map((c: { name: string; id: number }) => [c.name, c.id]));
  const threadNameToId = Object.fromEntries(threads.map((t: { name: string; id: number }) => [t.name, t.id]));
  for (const ev of events) {
    let chapterId: number | undefined;
    if (ev.chapterRef) {
      // 优先按序号匹配（"第一章"/"1" → sortOrder），再精确标题，最后才允许子串兜底
      // 子串兜底排除可解析为序号的引用，避免"第十一章"误挂到"第一章"
      const num = cnToNum(ev.chapterRef);
      if (num != null) {
        chapterId = chapters.find((c) => c.sortOrder === num)?.id;
      }
      if (chapterId == null && num == null) {
        chapterId = chapters.find((c) => c.title === ev.chapterRef)?.id;
        if (chapterId == null) {
          chapterId = chapters.find((c) => ev.chapterRef.includes(c.title) || c.title.includes(ev.chapterRef))?.id;
        }
      }
    }
    const loc = ev.location
      ? locs.find((l) => l.name === ev.location || ev.location.includes(l.name) || l.name.includes(ev.location))
      : undefined;
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
        characterIds: ev.characters.map((n) => charNameToId[n]).filter(Boolean),
        plotThreadIds: ev.plotThreads.map((n) => threadNameToId[n]).filter(Boolean),
      } as Parameters<typeof createSceneEvent>[0]);
    } catch { /* 单个事件失败不影响主流程 */ }
  }
}

async function saveStep6(bookId: number, text: string): Promise<void> {
  // 伏笔：类型/角色/埋下事件/揭示建议 → Foreshadowing（埋下事件关联 → planted 由后端派生）
  const { createForeshadowing, fetchSceneEvents } = await import('@/shared/api/world');
  const { fetchCharacters } = await import('@/shared/api/characters');
  const items = parseForeshadowings(text);
  const [events, chars] = await Promise.all([
    fetchSceneEvents(bookId).catch(() => []),
    fetchCharacters(bookId).catch(() => []),
  ]);
  const charNameToId = Object.fromEntries(chars.map((c: { name: string; id: number }) => [c.name, c.id]));
  for (const it of items) {
    const relatedEvent = it.relatedEvent ? events.find((e) => e.title === it.relatedEvent) : undefined;
    const body: Record<string, unknown> = {
      bookId,
      description: `${it.title}${it.description ? '：' + it.description : ''}`,
      status: 'planted',
      revealType: mapRevealType(it.type),
      relatedCharacterIds: it.characters.map((n) => charNameToId[n]).filter(Boolean),
    };
    if (relatedEvent) body.relatedEventId = relatedEvent.id;
    if (it.revealTiming) body.notes = `建议揭示时机：${it.revealTiming}`;
    await createForeshadowing(body as Parameters<typeof createForeshadowing>[0]);
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
