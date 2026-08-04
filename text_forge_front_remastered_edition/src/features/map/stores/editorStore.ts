import { create } from 'zustand';

interface EditorState {
  isOpen: boolean;
  entityType: 'scene' | 'location' | 'character' | null;
  entityId: number | null;
  isNew: boolean;

  open: (type: 'scene' | 'location' | 'character', entityId: number | null) => void;
  close: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  isOpen: false,
  entityType: null,
  entityId: null,
  isNew: false,

  open: (type, entityId) =>
    set({
      isOpen: true,
      entityType: type,
      entityId,
      isNew: entityId === null,
    }),

  close: () =>
    set({ isOpen: false, entityType: null, entityId: null, isNew: false }),
}));
