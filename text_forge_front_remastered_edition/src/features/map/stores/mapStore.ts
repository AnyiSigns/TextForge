import { create } from 'zustand';

interface MapState {
  focusedLocationId: number | null;
  history: number[];
  selectedCharacterId: number | null;
  hoveredLocationId: number | null;
  userDriven: boolean;

  navigateTo: (id: number) => void;
  syncFocus: (id: number) => void;
  clearUserDriven: () => void;
  goBack: () => void;
  selectCharacter: (id: number | null) => void;
  setHoveredLocationId: (id: number | null) => void;
}

export const useMapStore = create<MapState>((set) => ({
  focusedLocationId: 1,
  history: [1],
  selectedCharacterId: null,
  hoveredLocationId: null,
  userDriven: false,

  navigateTo: (id) =>
    set((state) => ({
      focusedLocationId: id,
      history: [...state.history, id],
      userDriven: true,
    })),

  syncFocus: (id) =>
    set((state) => ({
      focusedLocationId: id,
      history: [...state.history, id],
    })),

  clearUserDriven: () => set({ userDriven: false }),

  goBack: () =>
    set((state) => {
      if (state.history.length <= 1) return state;
      const newHistory = state.history.slice(0, -1);
      return {
        focusedLocationId: newHistory[newHistory.length - 1],
        history: newHistory,
      };
    }),

  selectCharacter: (id) => set({ selectedCharacterId: id }),

  setHoveredLocationId: (id) => set({ hoveredLocationId: id }),
}));
