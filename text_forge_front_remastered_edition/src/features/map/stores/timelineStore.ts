import { create } from 'zustand';

interface TimelineState {
  cursorTs: number;
  selectedEventId: number | null;
  playState: 'idle' | 'playing' | 'paused';
  snapThreshold: number;

  setCursorTs: (ts: number) => void;
  setSelectedEvent: (eventId: number | null) => void;
  setPlayState: (state: 'idle' | 'playing' | 'paused') => void;
  jumpToChapter: (chapterStartTs: number) => void;
}

export const useTimelineStore = create<TimelineState>((set) => ({
  cursorTs: 0,
  selectedEventId: null,
  playState: 'idle',
  snapThreshold: 20,

  setCursorTs: (ts) => set({ cursorTs: ts }),

  setSelectedEvent: (eventId) => set({ selectedEventId: eventId }),

  setPlayState: (state) => set({ playState: state }),

  jumpToChapter: (chapterStartTs) =>
    set({ cursorTs: chapterStartTs, selectedEventId: null }),
}));
