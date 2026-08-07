import { create } from 'zustand';

interface EditorState {
  isOpen: boolean;
  entityType: 'scene' | 'location' | 'character' | 'foreshadowing' | 'plot-thread' | 'chapter' | 'volume' | null;
  entityId: number | null;
  isNew: boolean;
  prefillChapterId: number | null;

  open: (type: EditorState['entityType'], entityId: number | null, prefill?: { chapterId?: number | null }) => void;
  close: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  isOpen: false,
  entityType: null,
  entityId: null,
  isNew: false,
  prefillChapterId: null,

  open: (type, entityId, prefill) =>
    set({
      isOpen: true,
      entityType: type,
      entityId,
      isNew: entityId === null,
      prefillChapterId: prefill?.chapterId ?? null,
    }),

  close: () =>
    set({ isOpen: false, entityType: null, entityId: null, isNew: false, prefillChapterId: null }),
}));
