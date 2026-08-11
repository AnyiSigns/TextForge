import { toast } from 'sonner';
import { getApiErrorMessage } from '@/shared/lib/apiError';

export interface CrudSliceOpts<T extends { id: number }> {
  // 集合字段名（EntityState 中对应的数组字段）
  collection: string;
  // 静态 import 闭包，保留打包器静态分析
  loader: () => Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
  updateFn: string;
  createFn: string;
  deleteFn: string;
  updateError: string;
  addError: string;
  removeError: string;
  // 更新是否带 bookId 第 3 参（update 时取 get().book?.id）
  withBookId?: boolean;
  // 删除是否带 bookId 第 2 参（delete 时取 get().book?.id ?? 1）
  deleteBookId?: boolean;
  // add 的创建入参转换
  payload?: (entity: T, get: () => any) => unknown[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  // remove 成功后跨集合级联清理
  cascade?: (state: any, id: number) => Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-explicit-any
  // remove 成功后副作用
  onAfter?: (id: number) => void;
}

export function makeCrudSlice<T extends { id: number }>(
  set: (partial: any) => void, // eslint-disable-line @typescript-eslint/no-explicit-any
  get: () => any, // eslint-disable-line @typescript-eslint/no-explicit-any
  opts: CrudSliceOpts<T>,
) {
  const {
    collection,
    loader,
    updateFn,
    createFn,
    deleteFn,
    updateError,
    addError,
    removeError,
    withBookId = false,
    deleteBookId = false,
    payload,
    cascade,
    onAfter,
  } = opts;

  const update = (id: number, patch: Partial<T>) => {
    set((state: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      [collection]: state[collection].map((item: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
    loader().then((mod) => {
      const args = withBookId ? [id, patch, get().book?.id] : [id, patch];
      mod[updateFn](...args).catch((e: unknown) =>
        toast.error(getApiErrorMessage(e, updateError)),
      );
    });
  };

  const add = (entity: T) => {
    const tempId = entity.id;
    set((state: any) => ({ [collection]: [...state[collection], entity] })); // eslint-disable-line @typescript-eslint/no-explicit-any
    loader().then((mod) => {
      const args = payload ? payload(entity, get) : [entity];
      mod[createFn](...args)
        .then((real: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          set((state: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
            [collection]: state[collection].map((item: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
              item.id === tempId ? { ...real, id: real.id ?? tempId } : item,
            ),
          }));
        })
        .catch((e: unknown) => toast.error(getApiErrorMessage(e, addError)));
    });
  };

  const remove = async (id: number) => {
    try {
      const mod = await loader();
      const args = deleteBookId ? [id, get().book?.id ?? 1] : [id];
      await mod[deleteFn](...args);
    } catch {
      toast.error(removeError);
      return; // 删除失败保持本地状态不变，避免前后端不一致
    }
    set((state: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      [collection]: state[collection].filter((item: any) => item.id !== id), // eslint-disable-line @typescript-eslint/no-explicit-any
      ...(cascade ? cascade(state, id) : {}),
    }));
    onAfter?.(id);
  };

  return { update, add, remove };
}
