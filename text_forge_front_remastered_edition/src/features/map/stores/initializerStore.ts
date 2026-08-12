import { create } from 'zustand';
import { useEntityStore } from './entityStore';
import { saveStepText } from '@/features/map/wizard/saveStepText';

const STEP_LABELS = [
  '世界观', '地点', '角色', '情节线', '大纲', '事件', '伏笔',
];

interface InitializerState {
  isOpen: boolean;
  currentStep: number;
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

export const useInitializerStore = create<InitializerState>((set, get) => ({
  isOpen: false,
  currentStep: 0,
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
    const { currentStep } = get();
    const { useBookDetailStore } = await import('@/app/(dashboard)/books/[id]/store');
    const bookId = useBookDetailStore.getState().bookId;
    if (!bookId) {
      set({ error: '未找到当前书籍' });
      return;
    }

    const controller = new AbortController();
    set({ generating: true, streaming: true, error: null, abortRef: controller });
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
      // 重新生成：清除该步骤已保存标记（允许再次落库新文本）
      set((s) => ({
        stepText: { ...s.stepText, [currentStep]: '' },
        savedSteps: new Set([...s.savedSteps].filter((x) => x !== currentStep)),
      }));
      const fullText = await streamGenerateMarkdown(bookId, currentStep, {
        extraInstruction,
        signal: controller.signal,
        onEvent: (ev) => {
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
