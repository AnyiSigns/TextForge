import { create } from 'zustand';
import { useEntityStore } from './entityStore';
import { saveStepText, saveStepItems, parseStepItems } from '@/features/map/wizard/saveStepText';
import type { ParsedStepResult, ParsedOutlineVolume } from '@/features/map/lib/wizardMarkdown';

const STEP_LABELS = [
  '世界观', '地点', '角色', '情节线', '大纲', '事件', '伏笔',
];

/** 各步空条目模板（表单「新增条目」用）。 */
const EMPTY_ITEM: Record<number, unknown> = {
  1: { name: '', type: '', description: '', parentName: '', customFields: {} },
  2: { name: '', roleType: '', aliases: [], status: '', description: '', spawnLocationName: '', relationships: [], customFields: {} },
  3: { name: '', type: '', description: '', parentName: '', level: 1 },
  4: { title: '', summary: '', chapters: [{ title: '', summary: '', scenes: [{ title: '', timeLabel: '', location: '', characters: [], plotThreads: [] }] }] },
  5: { title: '', summary: '', chapterRef: '', timeLabel: '', location: '', characters: [], plotThreads: [] },
  6: { title: '', description: '', type: '', characters: [], relatedEvent: '', revealTiming: '' },
};

/** 依据已加载的实体数据推断本次打开为初始化还是追加（追加不覆盖已有数据）。 */
function inferMode(): 'init' | 'append' {
  const s = useEntityStore.getState();
  const hasAny =
    s.volumes.length > 0 ||
    s.locations.length > 0 ||
    s.characters.length > 0 ||
    s.plotThreads.length > 0 ||
    s.sceneEvents.length > 0 ||
    s.foreshadowings.length > 0 ||
    Boolean(s.creativeSetting && (s.creativeSetting.worldview || s.creativeSetting.tone));
  return hasAny ? 'append' : 'init';
}

interface InitializerState {
  isOpen: boolean;
  currentStep: number;
  saving: boolean;
  error: string | null;
  generating: boolean;
  streaming: boolean;
  stepText: Record<number, string>;
  abortRef: AbortController | null;
  /** 本次面板模式：初始化（新书）或追加（已有设定，只增不覆盖） */
  mode: 'init' | 'append';
  /** 后端前置校验警告（meta.warnings） */
  warnings: string[];
  /** Step 4 大纲按卷生成进度 */
  volumeProgress: { total: number; done: number } | null;
  /** 已成功落库的步骤集合：回退再前进不重复保存；重新生成后清除对应标记 */
  savedSteps: Set<number>;
  creativeForm: { name: string; tone: string; worldview: string; taboos: string; customFields: Array<{ key: string; value: string; _uid?: string }> };
  /** 表单确认模式：true 时当前步展示实体卡片表单（生成 → 确认方案 → 表单 → 确定落库） */
  review: boolean;
  /** 当前步解析出的结构化实体（表单数据源；step4 为卷数组） */
  items: ParsedStepResult | null;

  open: () => void;
  close: () => void;
  nextStep: () => Promise<void>;
  prevStep: () => void;
  setCreativeForm: (data: Partial<InitializerState['creativeForm']>) => void;
  regenerateCandidates: (extraInstruction?: string) => Promise<void>;
  /** 生成完成进入表单确认模式：解析 stepText → items */
  enterReview: () => void;
  /** 返回流式预览（放弃本次表单微调） */
  backToPreview: () => void;
  /** 表单条目编辑（顶层字段；step4 卷字段） */
  updateItem: (index: number, patch: Record<string, unknown>) => void;
  /** step4 章/场景字段编辑 */
  /** step4 卷/章/场景字段编辑：chIdx 与 scIdx 均为 null 时编辑卷本体字段 */
  updateNestedItem: (volIdx: number, chIdx: number | null, scIdx: number | null, patch: Record<string, unknown>) => void;
  removeItem: (index: number) => void;
  removeNestedItem: (volIdx: number, chIdx: number | null, scIdx: number | null) => void;
  addItem: () => void;
  addNestedItem: (volIdx: number, chIdx: number | null) => void;
  /** 表单「确定落库」：校验（引用不合法抛错提示）→ 落库 → 前进/完成 */
  confirmSave: () => Promise<void>;
  finish: () => Promise<void>;
  clearError: () => void;
}

export const useInitializerStore = create<InitializerState>((set, get) => ({
  isOpen: false,
  currentStep: 0,
  saving: false,
  error: null,
  generating: false,
  streaming: false,
  stepText: {},
  abortRef: null,
  mode: 'init',
  warnings: [],
  volumeProgress: null,
  savedSteps: new Set<number>(),
  review: false,
  items: null,
  creativeForm: { name: '', tone: '', worldview: '', taboos: '', customFields: [{ key: '战力体系', value: '', _uid: crypto.randomUUID() }, { key: '势力', value: '', _uid: crypto.randomUUID() }, { key: '交易单位', value: '', _uid: crypto.randomUUID() }] },

  open: () => set({
    isOpen: true,
    currentStep: 0,
    saving: false,
    error: null,
    warnings: [],
    volumeProgress: null,
    review: false,
    items: null,
    mode: inferMode(),
  }),

  close: () => {
    // 中止进行中的流式生成，避免关闭面板后请求仍在运行
    get().abortRef?.abort();
    set({ isOpen: false, saving: false, error: null, abortRef: null });
  },

  nextStep: async () => {
    const { currentStep, creativeForm, generating, streaming } = get();
    // 生成/流式进行中禁止前进：streaming 状态会泄漏到下一步骤，导致误显示"生成中"
    if (generating || streaming) return;
    if (currentStep < 6) {
      // Step 0 → Step 1: 保存创意设定（失败时提示，不再静默吞掉）；
      // 仅当表单有实际内容时保存，避免空表单覆盖用户已有设定（追加不覆盖）
      if (currentStep === 0) {
        const hasContent = Boolean(
          creativeForm.tone ||
          creativeForm.worldview ||
          creativeForm.taboos ||
          creativeForm.customFields.some((f) => f.key && f.value),
        );
        if (hasContent) {
          const bookId = (await import('@/app/(dashboard)/books/[id]/store')).useBookDetailStore.getState().bookId;
          if (bookId) {
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
      }

      // Markdown 步骤（1-6）：解析流式生成的方案文本落库（已保存的步骤回退再前进不重复）
      if (currentStep >= 1 && currentStep <= 6 && !get().savedSteps.has(currentStep)) {
        const text = get().stepText[currentStep] ?? '';
        if (text && text.trim()) {
          const bookId = (await import('@/app/(dashboard)/books/[id]/store')).useBookDetailStore.getState().bookId;
          if (bookId) {
            try {
              await saveStepText(bookId, currentStep, text);
              await useEntityStore.getState().loadFromApi(bookId);
              set((s) => ({ savedSteps: new Set(s.savedSteps).add(currentStep) }));
            } catch (e) {
              // 引用校验失败：透出明细（含正确格式提示），停留当前步让用户微调后重试
              console.error(`[wizard:store] nextStep saveStepText FAILED`, e);
              const detail = e instanceof Error && e.message ? e.message : '方案保存失败，请重试';
              set({ error: detail });
              return;
            }
          }
        }
      }

      set({ currentStep: currentStep + 1 });
    }
  },

  prevStep: () => {
    const { currentStep, generating, streaming } = get();
    if (generating || streaming) return;
    if (currentStep > 0) set({ currentStep: currentStep - 1 });
  },

  setCreativeForm: (data) => {
    set((s) => ({ creativeForm: { ...s.creativeForm, ...data } }));
  },

  regenerateCandidates: async (extraInstruction?: string) => {
    const { currentStep, mode } = get();
    const { useBookDetailStore } = await import('@/app/(dashboard)/books/[id]/store');
    const bookId = useBookDetailStore.getState().bookId;
    if (!bookId) {
      set({ error: '未找到当前书籍' });
      return;
    }

    const controller = new AbortController();
    // 重新生成：回到流式预览，清除表单确认状态与该步骤已保存标记
    set({ generating: true, streaming: true, error: null, abortRef: controller, warnings: [], volumeProgress: null, review: false, items: null });
    // 节流合并 delta 更新，避免每个 SSE 行都触发 zustand set 造成高频重渲染；
    // 声明在 try 外，使 finally 在异常/中止路径也能取消定时器
    let pendingText = '';
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushPending = () => {
      if (flushTimer) clearTimeout(flushTimer);
      if (pendingText) {
        const chunk = pendingText;
        pendingText = '';
        set((s) => ({
          stepText: { ...s.stepText, [currentStep]: (s.stepText[currentStep] ?? '') + chunk },
        }));
      }
      flushTimer = null;
    };
    try {
      const { streamGenerateMarkdown } = await import('@/shared/api/wizard');
      // 重新生成：清除该步骤已保存标记（允许再次落库新文本）；落库层按名称去重，不会覆盖已有数据
      set((s) => ({
        stepText: { ...s.stepText, [currentStep]: '' },
        savedSteps: new Set([...s.savedSteps].filter((x) => x !== currentStep)),
      }));
      const fullText = await streamGenerateMarkdown(bookId, currentStep, {
        extraInstruction,
        mode,
        signal: controller.signal,
        onEvent: (ev) => {
          if (ev.type === 'meta') {
            if (ev.mode) set({ mode: ev.mode });
            if (ev.warnings && ev.warnings.length > 0) set({ warnings: ev.warnings });
            if (ev.totalVolumes && ev.totalVolumes > 1) set({ volumeProgress: { total: ev.totalVolumes, done: 0 } });
          }
          if (ev.type === 'volume_end' && ev.index != null) {
            const prev = get().volumeProgress;
            if (prev) set({ volumeProgress: { ...prev, done: Math.min(prev.done + 1, prev.total) } });
          }
          if (ev.type === 'delta' && ev.text) {
            pendingText += ev.text;
            if (!flushTimer) flushTimer = setTimeout(flushPending, 100);
          }
          if (ev.type === 'error' && ev.message) set({ error: ev.message });
        },
      });
      flushPending();
      if (fullText) {
        set((s) => ({ stepText: { ...s.stepText, [currentStep]: fullText } }));
        // Step 0：解析 Markdown 方案填入创意设定表单（表单仍是可编辑源，下一步才落库）
        if (currentStep === 0) {
          const { parseCreativeSetting } = await import('@/features/map/lib/wizardMarkdown');
          const parsed = parseCreativeSetting(fullText);
          if (parsed.worldview) {
            set((s) => ({
              creativeForm: {
                name: parsed.name || s.creativeForm.name,
                tone: parsed.tone || s.creativeForm.tone,
                worldview: parsed.worldview,
                taboos: parsed.taboos || s.creativeForm.taboos,
                customFields: Object.keys(parsed.customFields).length > 0
                  ? Object.entries(parsed.customFields).map(([key, value]) => ({ key, value, _uid: crypto.randomUUID() }))
                  : s.creativeForm.customFields,
              },
            }));
          }
        }
      }
    } catch (e) {
      // AbortError 为用户关闭面板/中止，不视为错误
      if ((e as Error)?.name !== 'AbortError') {
        const msg = e instanceof Error ? e.message : 'AI 生成失败，请检查模型配置后重试';
        set({ error: msg });
      }
    } finally {
      // 任何退出路径（成功/异常/中止）都取消节流定时器，避免残留文本在流关闭后写入 stepText
      if (flushTimer) clearTimeout(flushTimer);
      set({ generating: false, streaming: false, abortRef: null });
    }
  },

  /* ── 表单确认模式：生成 → 确认方案 → 卡片表单微调 → 确定落库 ── */

  enterReview: () => {
    const { currentStep, stepText } = get();
    const text = stepText[currentStep] ?? '';
    const items = parseStepItems(text, currentStep);
    if (items == null || (Array.isArray(items) && items.length === 0)) {
      set({ error: '方案解析失败，请重新生成，或检查输出格式' });
      return;
    }
    set({ review: true, items, error: null });
  },

  backToPreview: () => {
    set({ review: false, items: null });
  },

  updateItem: (index, patch) => set((s) => {
    if (!Array.isArray(s.items)) return {};
    const items = [...s.items] as unknown as Record<string, unknown>[];
    if (!items[index]) return {};
    items[index] = { ...items[index], ...patch };
    return { items: items as unknown as ParsedStepResult };
  }),

  updateNestedItem: (volIdx, chIdx, scIdx, patch) => set((s) => {
    const items = Array.isArray(s.items) ? [...s.items] as ParsedOutlineVolume[] : null;
    if (!items || !items[volIdx]) return {};
    const vol = { ...items[volIdx], chapters: items[volIdx].chapters.map((c) => ({ ...c })) };
    if (chIdx == null && scIdx == null) {
      // 卷本体字段编辑（卷标题/卷摘要）
      Object.assign(vol, patch);
    } else if (scIdx == null && chIdx != null) {
      if (!vol.chapters[chIdx]) return {};
      vol.chapters[chIdx] = { ...vol.chapters[chIdx], ...patch };
    } else if (chIdx != null && scIdx != null) {
      if (!vol.chapters[chIdx]?.scenes[scIdx]) return {};
      const scenes = vol.chapters[chIdx].scenes.map((sc) => ({ ...sc }));
      scenes[scIdx] = { ...scenes[scIdx], ...patch };
      vol.chapters[chIdx] = { ...vol.chapters[chIdx], scenes };
    }
    items[volIdx] = vol;
    return { items: items as ParsedStepResult };
  }),

  removeItem: (index) => set((s) => {
    if (!Array.isArray(s.items)) return {};
    return { items: s.items.filter((_, i) => i !== index) as ParsedStepResult };
  }),

  removeNestedItem: (volIdx, chIdx, scIdx) => set((s) => {
    const items = Array.isArray(s.items) ? [...s.items] as ParsedOutlineVolume[] : null;
    if (!items || !items[volIdx]) return {};
    const vol = { ...items[volIdx], chapters: items[volIdx].chapters.map((c) => ({ ...c, scenes: c.scenes.map((sc) => ({ ...sc })) })) };
    if (scIdx != null && chIdx != null) {
      if (!vol.chapters[chIdx]) return {};
      vol.chapters[chIdx] = { ...vol.chapters[chIdx], scenes: vol.chapters[chIdx].scenes.filter((_, j) => j !== scIdx) };
    } else if (chIdx != null) {
      vol.chapters = vol.chapters.filter((_, i) => i !== chIdx);
    }
    items[volIdx] = vol;
    return { items: items as ParsedStepResult };
  }),

  addItem: () => set((s) => {
    const template = EMPTY_ITEM[s.currentStep];
    if (!template || !Array.isArray(s.items)) return {};
    return { items: [...s.items, template] as ParsedStepResult };
  }),

  addNestedItem: (volIdx, chIdx) => set((s) => {
    const items = Array.isArray(s.items) ? [...s.items] as ParsedOutlineVolume[] : null;
    if (!items || !items[volIdx]) return {};
    const vol = { ...items[volIdx], chapters: items[volIdx].chapters.map((c) => ({ ...c, scenes: c.scenes.map((sc) => ({ ...sc })) })) };
    if (chIdx == null) {
      vol.chapters.push({ title: '', summary: '', scenes: [] });
    } else if (vol.chapters[chIdx]) {
      vol.chapters[chIdx] = {
        ...vol.chapters[chIdx],
        scenes: [...vol.chapters[chIdx].scenes, { title: '', summary: '', timeLabel: '', location: '', characters: [], plotThreads: [] }],
      };
    }
    items[volIdx] = vol;
    return { items: items as ParsedStepResult };
  }),

  confirmSave: async () => {
    const { currentStep, items } = get();
    const { useBookDetailStore } = await import('@/app/(dashboard)/books/[id]/store');
    const bookId = useBookDetailStore.getState().bookId;
    if (!bookId) {
      set({ error: '未找到当前书籍' });
      return;
    }
    if (items == null) {
      set({ error: '没有可保存的方案数据，请先生成方案' });
      return;
    }
    set({ saving: true, error: null });
    try {
      await saveStepItems(bookId, currentStep, items);
      await useEntityStore.getState().loadFromApi(bookId);
      set((s) => ({
        savedSteps: new Set(s.savedSteps).add(currentStep),
        review: false,
        items: null,
        saving: false,
      }));
      if (currentStep === 6) {
        set({ isOpen: false });
      } else {
        set((s) => ({ currentStep: s.currentStep + 1 }));
      }
    } catch (e) {
      // 引用校验失败：透出明细（含正确格式提示），停留在表单让用户微调后重试
      console.error(`[wizard:store] confirmSave FAILED`, e);
      const detail = e instanceof Error && e.message ? e.message : '方案保存失败，请重试';
      set({ saving: false, error: detail });
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
      // Step 6 为最后一步（finish 仅在其显示），落库伏笔 Markdown 文本（已保存则不重复）
      const text = get().stepText[6] ?? '';
      if (text && text.trim() && !get().savedSteps.has(6)) {
        await saveStepText(bookId, 6, text);
        set((s) => ({ savedSteps: new Set(s.savedSteps).add(6) }));
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
