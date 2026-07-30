// src/lib/stores/uiStore.ts
// 全局 UI 状态：loading、toast、sidebar 折叠等。

import { create } from 'zustand';

interface UiState {
  loading: boolean;
  setLoading: (loading: boolean) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  loading: false,
  setLoading: (loading) => set({ loading }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
}));