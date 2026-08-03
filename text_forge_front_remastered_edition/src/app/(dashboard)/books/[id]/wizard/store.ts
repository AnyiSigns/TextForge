import { create } from 'zustand';
import type { Card, StepType } from '@/shared/api/wizard';

export type WizardMode = 'flow' | 'custom' | null;

export interface ContextData {
  book?: { id: number; title: string; description?: string; genre?: string; total_word_goal?: number };
  creative_setting?: {
    tone: string;
    worldview: string;
    writing_taboos: string;
    custom_dimensions: Record<string, string>;
  };
  locations?: { name: string; type: string; description: string; parent_id?: number; attributes?: Record<string, string> }[];
  characters?: { name: string; description: string; role_type?: string; aliases?: string[]; custom_fields?: Record<string, string>; relationship_chain?: { source: string; target: string; relation: string }[] }[];
  timeline?: { name: string; description: string; event_type?: string }[];
  foreshadowing?: { description: string; reveal_type?: string; related_event_id?: number; notes?: string }[];
  plot_threads?: { name: string; description: string; type?: string; related_characters?: string[]; parent_thread_id?: number }[];
  volumes?: { title: string; summary: string; chapters: { title: string; summary: string; character_ids?: string[]; nodes: { title: string; content: string }[] }[] }[];
}

export const STEP_LABELS: Record<StepType, string> = {
  creative_setting: '创意设定',
  locations: '地点/地图',
  characters: '角色设定',
  character_relations: '角色关系',
  timeline_foreshadowing: '时间线 & 伏笔',
  plot_threads: '剧情线',
  outline: '大纲结构',
};

export const STEP_ORDER: StepType[] = [
  'creative_setting',
  'locations',
  'characters',
  'character_relations',
  'timeline_foreshadowing',
  'plot_threads',
  'outline',
];

const PROGRESS_KEY_PREFIX = 'wizard_progress';

function progressKey(): string {
  const bookId = useWizardStore.getState().bookId;
  return `${PROGRESS_KEY_PREFIX}_${bookId || 0}`;
}

function loadProgress(): { stepIndex: number; completed: StepType[] } {
  if (typeof window === 'undefined') return { stepIndex: 0, completed: [] };
  try {
    const raw = sessionStorage.getItem(progressKey());
    if (raw) return JSON.parse(raw);
  } catch {}
  return { stepIndex: 0, completed: [] };
}

function saveProgress(stepIndex: number, completed: StepType[]) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(progressKey(), JSON.stringify({ stepIndex, completed }));
  } catch {}
}

interface WizardState {
  mode: WizardMode;
  currentStep: StepType;
  currentStepIndex: number;
  cards: Card[];
  confirmedCards: Card[];
  streamLoading: boolean;
  streamError: string | null;
  abortedCards: Card[];
  bookId: number;

  context: ContextData;

  outlineSettings: {
    volumeCount: number;
    chaptersPerVolume: number;
    nodesPerChapter: number;
    mode: 'all' | 'volume' | 'chapter';
  };

  locationLinkMode: boolean;
  characterRelationMode: boolean;

  setMode: (mode: WizardMode) => void;
  setBookId: (bookId: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: StepType) => void;
  setCards: (cards: Card[]) => void;
  addCard: (card: Card) => void;
  confirmCards: (cards: Card[]) => void;
  approveCard: (index: number, edited?: Card) => void;
  removeCard: (index: number) => void;
  setStreamLoading: (v: boolean) => void;
  setStreamError: (err: string | null) => void;
  setAbortedCards: (cards: Card[]) => void;
  updateContext: (step: StepType, data: unknown) => void;
  addCompletedStep: (step: StepType) => void;
  completedSteps: StepType[];
  setOutlineSettings: (settings: Partial<WizardState['outlineSettings']>) => void;
  setLocationLinkMode: (v: boolean) => void;
  setCharacterRelationMode: (v: boolean) => void;
  reset: () => void;
}

const initialState = {
  mode: null as WizardMode,
  currentStep: 'creative_setting' as StepType,
  currentStepIndex: 0,
  cards: [] as Card[],
  confirmedCards: [] as Card[],
  streamLoading: false,
  streamError: null as string | null,
  abortedCards: [] as Card[],
  bookId: 0,
  completedSteps: [] as StepType[],
  context: {} as ContextData,
  outlineSettings: {
    volumeCount: 3,
    chaptersPerVolume: 5,
    nodesPerChapter: 3,
    mode: 'all' as const,
  },
  locationLinkMode: false,
  characterRelationMode: false,
};

export const useWizardStore = create<WizardState>((set, get) => ({
  ...initialState,

  setMode: (mode) => {
    const state: Partial<WizardState> = { mode, currentStep: 'creative_setting', currentStepIndex: 0, completedSteps: [] };
    if (mode === 'flow') {
      const saved = loadProgress();
      state.currentStepIndex = saved.stepIndex;
      state.currentStep = STEP_ORDER[saved.stepIndex] || 'creative_setting';
      state.completedSteps = saved.completed || [];
    }
    set(state);
  },

  setBookId: (bookId) => set({ bookId }),

  addCompletedStep: (step) => set((s) => {
    if (s.completedSteps.includes(step)) return {};
    const next = [...s.completedSteps, step];
    saveProgress(s.currentStepIndex, next);
    return { completedSteps: next };
  }),

  nextStep: () => {
    const { currentStepIndex, completedSteps } = get();
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEP_ORDER.length) {
      saveProgress(nextIndex, completedSteps);
      set({ currentStep: STEP_ORDER[nextIndex], currentStepIndex: nextIndex, cards: [], confirmedCards: [] });
    }
  },

  prevStep: () => {
    const { currentStepIndex } = get();
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      set({ currentStep: STEP_ORDER[prevIndex], currentStepIndex: prevIndex, cards: [] });
    }
  },

  goToStep: (step) => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx >= 0) {
      set({ currentStep: step, currentStepIndex: idx });
    }
  },

  setCards: (cards) => set({ cards }),
  addCard: (card) => set((s) => ({ cards: [...s.cards, card] })),

  confirmCards: (cards) => set({ confirmedCards: cards, cards: [] }),

  approveCard: (index, edited) =>
    set((s) => {
      const updated = [...s.cards];
      if (edited) updated[index] = edited;
      return {
        cards: updated,
        confirmedCards: [...s.confirmedCards, updated[index]],
      };
    }),

  removeCard: (index) =>
    set((s) => {
      const updated = [...s.cards];
      updated.splice(index, 1);
      return { cards: updated };
    }),

  setStreamLoading: (v) => set({ streamLoading: v }),
  setStreamError: (err) => set({ streamError: err }),

  setAbortedCards: (cards) => set({ abortedCards: cards, streamLoading: false }),

  updateContext: (step, data) =>
    set((s) => ({
      context: { ...s.context, [step]: data },
    })),

  setOutlineSettings: (settings) =>
    set((s) => ({
      outlineSettings: { ...s.outlineSettings, ...settings },
    })),

  setLocationLinkMode: (v) => set({ locationLinkMode: v }),
  setCharacterRelationMode: (v) => set({ characterRelationMode: v }),

  reset: () => {
    const bookId = get().bookId;
    clearProgress(bookId);
    set(initialState);
  },
}));

export function getSavedCompleted(): StepType[] {
  const saved = loadProgress();
  return saved.completed || [];
}

export function saveCompleted(steps: StepType[]) {
  const saved = loadProgress();
  saveProgress(saved.stepIndex, steps);
}

export function clearProgress(bookId?: number) {
  if (typeof window !== 'undefined') {
    try {
      const key = bookId != null ? `${PROGRESS_KEY_PREFIX}_${bookId}` : null;
      if (key) { sessionStorage.removeItem(key); }
    } catch {}
  }
}

export function hasProgress(bookId: number): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!sessionStorage.getItem(`${PROGRESS_KEY_PREFIX}_${bookId}`);
  } catch { return false; }
}

export function loadProgressForBook(bookId: number): { stepIndex: number; completed: StepType[] } {
  if (typeof window === 'undefined') return { stepIndex: 0, completed: [] };
  try {
    const raw = sessionStorage.getItem(`${PROGRESS_KEY_PREFIX}_${bookId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { stepIndex: 0, completed: [] };
}
