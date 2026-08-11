import { create } from 'zustand';
import { useEntityStore } from './entityStore';
import { saveStepText } from '@/features/map/wizard/saveStepText';

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
  abortRef: AbortController | null;
  /** 已成功落库的步骤集合：回退再前进不重复保存；重新生成后清除对应标记 */
  savedSteps: Set<number>;
  creativeForm: { name: string; tone: string; worldview: string; taboos: string; customFields: Array<{ key: string; value: string; _uid?: string }> };

  open: () => void;
  close: () => void;
  nextStep: () => Promise<void>;
  prevStep: () => void;
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
  abortRef: null,
  savedSteps: new Set<number>(),
  creativeForm: { name: '', tone: '', worldview: '', taboos: '', customFields: [{ key: '战力体系', value: '', _uid: crypto.randomUUID() }, { key: '势力', value: '', _uid: crypto.randomUUID() }, { key: '交易单位', value: '', _uid: crypto.randomUUID() }] },

  open: () => set({ isOpen: true, currentStep: 0, saving: false, error: null }),

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
              console.error(`[wizard:store] nextStep saveStepText FAILED`, e);
              set({ error: '方案保存失败，请重试' });
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
    const { currentStep, candidates, lockedIds, confirmedIds } = get();
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

    // 当前步已锁定的标题，传给后端避免重复生成
    const excludeTitles = candidates[currentStep]
      .filter((c) => lockedIds.has(c.id) || confirmedIds.has(c.id))
      .map((c) => c.title);

    set({ generating: true, streaming: currentStep >= 1, error: null });

    // Step 1-6：流式生成单份 Markdown 方案，文本累积到 stepText
    if (currentStep >= 1) {
      const controller = new AbortController();
      set({ abortRef: controller });
      try {
        const { streamGenerateMarkdown } = await import('@/shared/api/wizard');
        // 重新生成：清除该步骤已保存标记（允许再次落库新文本）
        set((s) => ({
          stepText: { ...s.stepText, [currentStep]: '' },
          savedSteps: new Set([...s.savedSteps].filter((x) => x !== currentStep)),
        }));
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
          signal: controller.signal,
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
        // AbortError 为用户关闭面板/中止，不视为错误
        if ((e as Error)?.name !== 'AbortError') {
          const msg = e instanceof Error ? e.message : 'AI 生成失败，请检查模型配置后重试';
          set({ error: msg });
        }
      } finally {
        set({ generating: false, streaming: false, abortRef: null });
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

        let customFields: Array<{ key: string; value: string; _uid?: string }> = [];
        try {
          const parsed = JSON.parse(customRaw);
          if (Array.isArray(parsed)) {
            customFields = parsed.map((x: Record<string, string>) => ({ key: x.key || '', value: x.value || '', _uid: crypto.randomUUID() }));
          }
        } catch {
          // 文本格式："键：值" 每行
          customFields = customRaw
            .split('\n')
            .map((line) => {
              const idx = line.indexOf('：') >= 0 ? line.indexOf('：') : line.indexOf(':');
              if (idx >= 0) return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim(), _uid: crypto.randomUUID() };
              return null;
            })
            .filter((x): x is { key: string; value: string; _uid: string } => x !== null && x.key.length > 0);
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
export type { Candidate };
