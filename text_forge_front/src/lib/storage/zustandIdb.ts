// 统一的 zustand persist + IndexedDB 适配器工厂。
// 各 store 之前各自定义了结构完全相同的 idbStorage 对象，这里收敛为单一工厂，
// 避免 6 份重复实现。
import { createJSONStorage } from 'zustand/middleware';
import { getItem, setItem, removeItem } from '@/lib/storage/indexedDB';

export function createIdbStorage() {
  return createJSONStorage(() => ({
    getItem: async (name: string): Promise<string | null> => (await getItem<string>(name)) ?? null,
    setItem: async (name: string, value: string): Promise<void> => {
      await setItem(name, value);
    },
    removeItem: async (name: string): Promise<void> => {
      await removeItem(name);
    },
  }));
}
