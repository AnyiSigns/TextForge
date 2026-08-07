import { create } from 'zustand';
import { useEntityStore } from './entityStore';
import {
  parsePlotThreads,
  parseOutline,
  parseEvents,
  parseForeshadowings,
} from '@/features/map/lib/wizardMarkdown';

interface Candidate {
  id: string;
  title: string;
  fields: Array<{ key: string; value: string }>;
}

const STEP_LABELS = [
  '世界观', '地点', '角色', '情节线', '大纲', '事件', '伏笔',
];

interface InitializerState {
  isOpen: boolean;
  currentStep: number;
  candidates: Candidate[][];
  lockedIds: Set<string>;
  confirmedIds: Set<string>;
  saving: boolean;
  error: string | null;
  generating: boolean;
  streaming: boolean;
  stepText: Record<number, string>;
  creativeForm: { name: string; tone: string; worldview: string; taboos: string; customFields: Array<{ key: string; value: string }> };

  open: () => void;
  close: () => void;
  nextStep: () => Promise<void>;
  prevStep: () => void;
  toggleLock: (step: number, candidateId: string) => void;
  toggleConfirm: (step: number, candidateId: string) => void;
  setCreativeForm: (data: Partial<InitializerState['creativeForm']>) => void;
  regenerateCandidates: (extraInstruction?: string) => Promise<void>;
  finish: () => Promise<void>;
  clearError: () => void;
}

function generateCandidates(step: number): Candidate[] {
  // 不再内置硬编码候选：初始为空，候选全部由 AI 生成（regenerateCandidates 调后端 wizard/generate），
  // 避免用户误锁假数据写入真实书籍。
  void step;
  return [];
}

interface InitError extends Error {
  step?: string;
}

/**
 * 将锁定的卡片批量写入后端。
 */
async function saveLockedCards(
  bookId: number,
  step: number,
  cards: Candidate[],
): Promise<void> {
  console.log(`[wizard:store] saveLockedCards step=${step} count=${cards.length}`);
  if (step === 1) {
    // 地点
    const { createLocation } = await import('@/shared/api/world');
    const results = await Promise.all(cards.map(async (c) => {
      const type = c.fields.find((f) => f.key === '类型')?.value ?? '城镇';
      const desc = c.fields.find((f) => f.key === '描述')?.value ?? '';
      const body = { bookId, name: c.title, type, description: desc };
      console.log(`[wizard:store] createLocation body=`, body);
      const result = await createLocation(body as Parameters<typeof createLocation>[0]);
      console.log(`[wizard:store] createLocation result=`, result);
      return result;
    }));
    console.log(`[wizard:store] saveLockedCards locations done`, results);
  } else if (step === 2) {
    // 角色
    const { createCharacter } = await import('@/shared/api/characters');
    await Promise.all(cards.map((c) => {
      const roleType = c.fields.find((f) => f.key === '角色类型')?.value ?? '配角';
      const desc = c.fields.find((f) => f.key === '描述')?.value ?? '';
      // 别名（JSON 数组或顿号/逗号分隔文本）
      const aliasesRaw = c.fields.find((f) => f.key === '别名')?.value ?? '';
      let aliases: string[] = [];
      try {
        const parsed = JSON.parse(aliasesRaw);
        if (Array.isArray(parsed)) aliases = parsed.map(String).filter(Boolean);
      } catch {
        aliases = aliasesRaw.split(/[、,，]/).map((s) => s.trim()).filter(Boolean);
      }
      // 角色状态（当前身份/处境）
      const status = c.fields.find((f) => f.key === '角色状态')?.value ?? '活跃';
      // 自定义字段（key-value 对象）
      const customRaw = c.fields.find((f) => f.key === '自定义字段')?.value ?? '';
      let customFields: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(customRaw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) customFields = parsed;
      } catch { /* 文本格式忽略 */ }
      return createCharacter({
        bookId, name: c.title, description: desc, roleType,
        status,
        aliases,
        customFields,
      } as Parameters<typeof createCharacter>[0]);
    }));
  }
}

/* ── Step 3-6：Markdown 单份方案解析落库 ── */

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

async function saveStepText(bookId: number, step: number, text: string): Promise<void> {
  if (!text || !text.trim()) return;

  if (step === 3) {
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
    return;
  }

  if (step === 4) {
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
    return;
  }

  if (step === 5) {
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
    return;
  }

  if (step === 6) {
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
}

export const useInitializerStore = create<InitializerState>((set, get) => ({
  isOpen: false,
  currentStep: 0,
  candidates: Array.from({ length: 7 }, (_, i) => generateCandidates(i)),
  lockedIds: new Set<string>(),
  confirmedIds: new Set<string>(),
  saving: false,
  error: null,
  generating: false,
  streaming: false,
  stepText: {},
  creativeForm: { name: '', tone: '', worldview: '', taboos: '', customFields: [{ key: '战力体系', value: '' }, { key: '势力', value: '' }, { key: '交易单位', value: '' }] },

  open: () => set({ isOpen: true, currentStep: 0, saving: false, error: null }),

  close: () => set({ isOpen: false, saving: false, error: null }),

  nextStep: async () => {
    const { currentStep, candidates, lockedIds, creativeForm, generating, streaming } = get();
    // 生成/流式进行中禁止前进：streaming 状态会泄漏到下一步骤，导致误显示"生成中"
    if (generating || streaming) return;
    if (currentStep < 6) {
      // Step 0 → Step 1: 保存创意设定（失败时提示，不再静默吞掉）
      if (currentStep === 0) {
        const bookId = (await import('@/app/(dashboard)/books/[id]/store')).useBookDetailStore.getState().bookId;
        if (bookId && creativeForm.worldview) {
          const { updateCreativeSetting } = await import('@/shared/api/books');
          try {
            await updateCreativeSetting(bookId, {
              tone: creativeForm.tone,
              worldview: creativeForm.worldview,
              writingTaboos: creativeForm.taboos,
              customDimensions: Object.fromEntries(
                creativeForm.customFields.filter((f) => f.key && f.value).map((f) => [f.key, f.value]),
              ),
            });
          } catch {
            set({ error: '创意设定保存失败，请重试或检查网络' });
          }
        }
      }

      // 卡片步骤（1-2）：锁定卡片写入后端
      if (currentStep === 1 || currentStep === 2) {
        const lockedCards = candidates[currentStep].filter((c) => lockedIds.has(c.id));
        console.log(`[wizard:store] nextStep step=${currentStep} lockedCards=${lockedCards.length}`, lockedCards.map(c => c.title));
        if (lockedCards.length > 0) {
          const bookId = (await import('@/app/(dashboard)/books/[id]/store')).useBookDetailStore.getState().bookId;
          console.log(`[wizard:store] nextStep saving bookId=${bookId}`);
          if (bookId) {
            try {
              await saveLockedCards(bookId, currentStep, lockedCards);
              await useEntityStore.getState().loadFromApi(bookId);
            } catch (e) {
              console.error(`[wizard:store] nextStep save FAILED`, e);
              set({ error: '候选保存失败，请重试' });
            }
            // 保存后移除已入库卡片，回退再前进不会重复
            const savedIds = new Set(lockedCards.map((c) => c.id));
            const newCandidates = [...get().candidates];
            newCandidates[currentStep] = newCandidates[currentStep].filter((c) => !savedIds.has(c.id));
            // 同时清理 lockedIds
            const newLocked = new Set(get().lockedIds);
            savedIds.forEach((id) => newLocked.delete(id));
            set({ candidates: newCandidates, lockedIds: newLocked });
          }
        }
      }

      // Markdown 步骤（3-6）：解析流式生成的方案文本落库
      if (currentStep >= 3 && currentStep <= 6) {
        const text = get().stepText[currentStep] ?? '';
        if (text && text.trim()) {
          const bookId = (await import('@/app/(dashboard)/books/[id]/store')).useBookDetailStore.getState().bookId;
          if (bookId) {
            try {
              await saveStepText(bookId, currentStep, text);
              await useEntityStore.getState().loadFromApi(bookId);
            } catch (e) {
              console.error(`[wizard:store] nextStep saveStepText FAILED`, e);
              set({ error: '方案保存失败，请重试' });
            }
          }
        }
      }

      const confirmedInStep = candidates[currentStep]
        .filter((c) => lockedIds.has(c.id))
        .map((c) => c.id);
      const newConfirmed = new Set(get().confirmedIds);
      confirmedInStep.forEach((id) => newConfirmed.add(id));
      set({ currentStep: currentStep + 1, confirmedIds: newConfirmed });
    }
  },

  prevStep: () => {
    const { currentStep } = get();
    if (currentStep > 0) set({ currentStep: currentStep - 1 });
  },

  toggleLock: (step, candidateId) => {
    const newLocked = new Set(get().lockedIds);
    if (newLocked.has(candidateId)) {
      newLocked.delete(candidateId);
    } else {
      newLocked.add(candidateId);
    }
    set({ lockedIds: newLocked });
  },

  toggleConfirm: (step, candidateId) => {
    const newConfirmed = new Set(get().confirmedIds);
    if (newConfirmed.has(candidateId)) {
      newConfirmed.delete(candidateId);
    } else {
      newConfirmed.add(candidateId);
    }
    set({ confirmedIds: newConfirmed });
  },

  setCreativeForm: (data) => {
    set((s) => ({ creativeForm: { ...s.creativeForm, ...data } }));
  },

  regenerateCandidates: async (extraInstruction?: string) => {
    const { currentStep, candidates, lockedIds, confirmedIds, creativeForm } = get();
    const { useBookDetailStore } = await import('@/app/(dashboard)/books/[id]/store');
    const bookId = useBookDetailStore.getState().bookId;
    if (!bookId) {
      set({ error: '未找到当前书籍' });
      return;
    }

    // 收集前序步骤中 locked/confirmed 的卡片
    const previousCards: Array<{ step: number; title: string; fields: Array<{ key: string; value: string }> }> = [];
    for (let s = 0; s < currentStep; s++) {
      for (const c of candidates[s]) {
        if (lockedIds.has(c.id) || confirmedIds.has(c.id)) {
          previousCards.push({ step: s, title: c.title, fields: c.fields });
        }
      }
    }

    console.log(`[wizard:store] step=${currentStep} previousCards=${JSON.stringify(previousCards.map(p => ({ step: p.step, title: p.title })))}`);

    // 当前步已锁定的标题，传给后端避免重复生成
    const excludeTitles = candidates[currentStep]
      .filter((c) => lockedIds.has(c.id) || confirmedIds.has(c.id))
      .map((c) => c.title);

    set({ generating: true, streaming: currentStep >= 3, error: null });

    // Step 3-6：流式生成单份 Markdown 方案，文本累积到 stepText
    if (currentStep >= 3) {
      try {
        const { streamGenerateMarkdown } = await import('@/shared/api/wizard');
        set({ stepText: { ...get().stepText, [currentStep]: '' } });
        // 节流合并 delta 更新，避免每个 SSE 行都触发 zustand set 造成高频重渲染
        let pendingText = '';
        let flushTimer: ReturnType<typeof setTimeout> | null = null;
        const flushPending = () => {
          if (pendingText) {
            const chunk = pendingText;
            pendingText = '';
            set((s) => ({
              stepText: { ...s.stepText, [currentStep]: (s.stepText[currentStep] ?? '') + chunk },
            }));
          }
          flushTimer = null;
        };
        const fullText = await streamGenerateMarkdown(bookId, currentStep, {
          extraInstruction,
          previousCards,
          onEvent: (ev) => {
            if (ev.type === 'delta' && ev.text) {
              pendingText += ev.text;
              if (!flushTimer) flushTimer = setTimeout(flushPending, 100);
            }
            if (ev.type === 'error' && ev.message) set({ error: ev.message });
          },
        });
        if (flushTimer) clearTimeout(flushTimer);
        flushPending();
        if (fullText) {
          set((s) => ({ stepText: { ...s.stepText, [currentStep]: fullText } }));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'AI 生成失败，请检查模型配置后重试';
        set({ error: msg });
      } finally {
        set({ generating: false, streaming: false });
      }
      return;
    }

    try {
      const { generateWizardCards } = await import('@/shared/api/wizard');
      const cards = await generateWizardCards(bookId, currentStep, previousCards, excludeTitles, extraInstruction);

      // Step 0: 取第一个卡片填入表单
      if (currentStep === 0 && cards.length > 0) {
        const first = cards[0];
        const form = get().creativeForm;
        const name = first.title || '';
        const tone = first.fields.find((f) => f.key === '文风基调')?.value ?? '';
        const worldview = first.fields.find((f) => f.key === '世界观')?.value ?? '';
        const taboos = first.fields.find((f) => f.key === '写作禁忌')?.value ?? '';
        const customRaw = first.fields.find((f) => f.key === '自定义字段')?.value ?? '';

        let customFields: Array<{ key: string; value: string }> = [];
        try {
          const parsed = JSON.parse(customRaw);
          if (Array.isArray(parsed)) {
            customFields = parsed.map((x: Record<string, string>) => ({ key: x.key || '', value: x.value || '' }));
          }
        } catch {
          // 文本格式："键：值" 每行
          customFields = customRaw
            .split('\n')
            .map((line) => {
              const idx = line.indexOf('：') >= 0 ? line.indexOf('：') : line.indexOf(':');
              if (idx >= 0) return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
              return null;
            })
            .filter((x): x is { key: string; value: string } => x !== null && x.key.length > 0);
        }
        set({
          generating: false,
          creativeForm: { name, tone, worldview, taboos, customFields: customFields.length > 0 ? customFields : form.customFields },
        });
        return;
      }

      const mapped: Candidate[] = cards.map((c, i) => ({
        id: `${currentStep}-ai-${Date.now()}-${i}`,
        title: c.title,
        fields: c.fields,
      }));

      const newCandidates = [...get().candidates];
      // 保留已锁定/确认的卡片，新生成的追加到末尾
      const kept = newCandidates[currentStep].filter(
        (c) => lockedIds.has(c.id) || confirmedIds.has(c.id),
      );
      newCandidates[currentStep] = [...kept, ...mapped];
      set({ candidates: newCandidates, generating: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'AI 生成失败，请检查模型配置后重试';
      set({ generating: false, error: msg });
    }
  },

  clearError: () => set({ error: null }),

  finish: async () => {
    const { useBookDetailStore } = await import('@/app/(dashboard)/books/[id]/store');
    const bookId = useBookDetailStore.getState().bookId;

    if (!bookId) {
      set({ error: '未找到当前书籍' });
      return;
    }

    set({ saving: true, error: null });

    try {
      // Step 6 为最后一步（finish 仅在其显示），落库伏笔 Markdown 文本
      const text = get().stepText[6] ?? '';
      if (text && text.trim()) {
        await saveStepText(bookId, 6, text);
      }

      await useEntityStore.getState().loadFromApi(bookId);
      set({ isOpen: false, saving: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '保存失败';
      set({ saving: false, error: msg });
    }
  },
}));

export { STEP_LABELS };
export type { Candidate };
