import { create } from 'zustand';

export type OnboardingStep = 'welcome' | 'book' | 'setting' | 'character' | 'outline' | 'done';

interface OnboardingState {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  currentBookId: number | null;
  setStep: (step: OnboardingStep) => void;
  setCurrentBookId: (id: number) => void;
  completeStep: (step: OnboardingStep) => void;
  isComplete: boolean;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  currentStep: 'welcome',
  completedSteps: [],
  currentBookId: null,
  setStep: (step) => set({ currentStep: step }),
  setCurrentBookId: (id) => set({ currentBookId: id }),
  completeStep: (step) =>
    set((s) => ({
      completedSteps: s.completedSteps.includes(step) ? s.completedSteps : [...s.completedSteps, step],
      currentStep: step === 'outline' ? 'done' : s.currentStep,
    })),
  isComplete: false,
  reset: () => set({ currentStep: 'welcome', completedSteps: [], currentBookId: null }),
}));