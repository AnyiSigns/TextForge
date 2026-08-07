import { create } from 'zustand';
import { useEntityStore } from './entityStore';

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
  } else if (step === 3) {
    // 情节线
    const { createPlotThread } = await import('@/shared/api/world');
    await Promise.all(cards.map((c) => {
      const type = c.fields.find((f) => f.key === '类型')?.value ?? '支线';
      const desc = c.fields.find((f) => f.key === '描述')?.value ?? '';
      return createPlotThread({ bookId, name: c.title, description: desc, status: 'active', type } as Parameters<typeof createPlotThread>[0]);
    }));
  } else if (step === 4) {
    // 大纲 → 卷+章（容错解析：识别"卷X："与"第X章："前缀，标题与摘要以「 - 」分隔）
    const { createVolume, createChapter } = await import('@/shared/api/books');
    const { createSceneEvent } = await import('@/shared/api/world');
    const { fetchCharacters } = await import('@/shared/api/characters');

    // 角色名 → id（用于「本章角色」关联）
    let charNameToId: Record<string, number> = {};
    try {
      const chars = await fetchCharacters(bookId);
      charNameToId = Object.fromEntries(chars.map((c: { id: number; name: string }) => [c.name, c.id]));
    } catch { /* 角色加载失败不影响卷章创建 */ }

    // 从「卷标题 - 卷摘要」中提取标题与摘要
    const splitTitleSummary = (raw: string): { title: string; summary: string } => {
      const s = raw.replace(/[\n\r]/g, ' ').trim();
      const m = s.match(/^卷[一二三四五六七八九十\d]+[：:]\s*(.+)$/);
      const body = m ? m[1] : s;
      const dash = body.indexOf(' - ');
      if (dash > 0) {
        return { title: body.slice(0, dash).trim().slice(0, 100), summary: body.slice(dash + 3).trim().slice(0, 500) };
      }
      return { title: body.slice(0, 100), summary: '' };
    };
    const splitChapter = (raw: string): { title: string; summary: string; scenes: string[]; characters: number[] } => {
      const s = raw.replace(/[\n\r]/g, ' ').trim();
      const m = s.match(/^第[一二三四五六七八九十\d]+章[：:]\s*(.+)$/);
      const body = m ? m[1] : s;
      // 提取括号标注：场景节点 / 本章角色
      const sceneM = body.match(/场景节点[：:]\s*([^（）()；;]+)/);
      const charM = body.match(/本章角色[：:]\s*([^（）()；;]+)/);
      const scenes = sceneM ? sceneM[1].split(/[、,，]/).map((x) => x.trim()).filter(Boolean) : [];
      const characters = charM
        ? charM[1].split(/[、,，]/).map((x) => x.trim()).map((n) => charNameToId[n]).filter((id): id is number => !!id)
        : [];
      const dash = body.indexOf(' - ');
      const core = dash > 0 ? body.slice(0, dash) : body;
      return { title: core.trim().slice(0, 200), summary: dash > 0 ? body.slice(dash + 3).trim().slice(0, 500) : '', scenes, characters };
    };

    for (const c of cards) {
      const text = c.fields.find((f) => f.key === '大纲')?.value ?? '';
      const volMatches = text.match(/卷[一二三四五六七八九十\d]+[：:][^\n]+/g) || [];
      const chMatches = text.match(/第[一二三四五六七八九十\d]+章[：:][^\n]+/g) || [];

      if (volMatches.length === 0 && chMatches.length === 0) {
        // 兜底：整段内容作为一卷一章，避免静默丢数据
        const createdVol = await createVolume(bookId, '第一卷', '');
        const title = (text.trim().slice(0, 200)) || '第一章';
        await createChapter(createdVol.id, { title, summary: '' } as Parameters<typeof createChapter>[1]);
        continue;
      }

      // 只有章节没有卷结构时，默认单卷
      const volInfos = volMatches.length > 0
        ? volMatches.map((v) => splitTitleSummary(v))
        : [{ title: '第一卷', summary: '' }];

      for (let vi = 0; vi < volInfos.length; vi++) {
        const createdVol = await createVolume(bookId, volInfos[vi].title, volInfos[vi].summary);
        const chPerVol = chMatches.length > 0
          ? Math.max(1, Math.ceil(chMatches.length / volInfos.length))
          : 0;
        const volChapters = chPerVol > 0
          ? chMatches.slice(vi * chPerVol, (vi + 1) * chPerVol)
          : [];
        for (const chTitle of volChapters) {
          const info = splitChapter(chTitle);
          const createdChapter = await createChapter(createdVol.id, {
            title: info.title,
            summary: info.summary,
          } as Parameters<typeof createChapter>[1]);
          // 场景节点 → 时间线事件（关联本章）；本章角色改挂到场景事件，章节角色由场景并集派生
          for (const scene of info.scenes) {
            try {
              await createSceneEvent({
                bookId, title: scene, content: `（来自大纲「${info.title}」的场景节点）`,
                eventType: 'scene', sortOrder: 0, chapterId: createdChapter.id,
                characterIds: info.characters,
              } as Parameters<typeof createSceneEvent>[0]);
            } catch { /* 场景事件创建失败不影响主流程 */ }
          }
        }
      }
    }
  } else if (step === 5) {
    // 事件：时间标签 → storyLabel，地点名 → locationId（按名称匹配已有地点）
    const { createSceneEvent, fetchLocations } = await import('@/shared/api/world');
    let locations: Array<{ id: number; name: string }> = [];
    try {
      locations = await fetchLocations(bookId);
    } catch { /* 地点加载失败不影响事件创建 */ }
    await Promise.all(cards.map(async (c) => {
      const desc = c.fields.find((f) => f.key === '描述')?.value ?? '';
      const timeLabel = c.fields.find((f) => f.key === '时间')?.value ?? '';
      const locationName = c.fields.find((f) => f.key === '地点')?.value ?? '';
      const matched = locationName
        ? locations.find((l) => l.name === locationName || locationName.includes(l.name) || l.name.includes(locationName))
        : undefined;
      const body: Record<string, unknown> = {
        bookId, title: c.title, content: desc, eventType: 'scene', sortOrder: 0,
      };
      if (timeLabel) body.storyLabel = timeLabel;
      if (matched) body.locationId = matched.id;
      return createSceneEvent(body as Parameters<typeof createSceneEvent>[0]);
    }));
  } else if (step === 6) {
    // 伏笔：类型 → revealType，揭示时机 → notes
    const { createForeshadowing } = await import('@/shared/api/world');
    await Promise.all(cards.map((c) => {
      const desc = c.fields.find((f) => f.key === '内容')?.value ?? c.title;
      // 后端 wizard 将 LLM 的 type/reveal_timing 映射为「类型」「揭示时机」两个 label
      const revealRaw = c.fields.find((f) => f.key === '类型')?.value ?? '';
      const revealTiming = c.fields.find((f) => f.key === '揭示时机')?.value ?? '';
      // 与 ForeshadowingEditor 的 reveal_type 枚举对齐：gradual/sudden/twist
      const revealType = revealRaw.includes('突然') || revealRaw.includes('反转') || revealRaw.includes('背叛') ? 'sudden'
        : revealRaw.includes('转折') || revealRaw.includes('悬念') || revealRaw.includes('谜团') || revealRaw.includes('秘密') || revealRaw.includes('预言') ? 'twist'
        : 'gradual';
      const body: Record<string, unknown> = {
        bookId, description: desc, status: 'planted', revealType,
      };
      if (revealTiming) body.notes = `建议揭示时机：${revealTiming}`;
      return createForeshadowing(body as Parameters<typeof createForeshadowing>[0]);
    }));
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
  creativeForm: { name: '', tone: '', worldview: '', taboos: '', customFields: [{ key: '战力体系', value: '' }, { key: '势力', value: '' }, { key: '交易单位', value: '' }] },

  open: () => set({ isOpen: true, currentStep: 0, saving: false, error: null }),

  close: () => set({ isOpen: false, saving: false, error: null }),

  nextStep: async () => {
    const { currentStep, candidates, lockedIds, creativeForm } = get();
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

      // 卡片步骤（1-6）：锁定卡片写入后端
      if (currentStep >= 1 && currentStep <= 6) {
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

    set({ generating: true, error: null });
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
    const { candidates, lockedIds, confirmedIds, currentStep } = get();
    const { useBookDetailStore } = await import('@/app/(dashboard)/books/[id]/store');
    const bookId = useBookDetailStore.getState().bookId;

    if (!bookId) {
      set({ error: '未找到当前书籍' });
      return;
    }

    set({ saving: true, error: null });

    try {
      // 保存当前步骤剩余的锁定卡片（之前步骤已在 nextStep 中保存）
      const lockedCards = candidates[currentStep].filter(
        (c) => lockedIds.has(c.id) || confirmedIds.has(c.id),
      );
      if (lockedCards.length > 0) {
        await saveLockedCards(bookId, currentStep, lockedCards);
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
