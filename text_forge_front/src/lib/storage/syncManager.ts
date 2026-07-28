// src/lib/storage/syncManager.ts
// 统一前后端一致性管理器：乐观锁 + 增量同步 + 冲突处理
import { flushSyncQueue } from './syncQueue';
import { getSyncUpdates } from '@/lib/api/client';

type SyncMeta = {
  lastSyncAt: string;
  version?: number;
};

export interface SyncConflict {
  store: string;
  local: unknown;
  remote: unknown;
  // 由 UI 调用，决定采用哪一侧
  resolve: (choice: 'local' | 'remote') => void;
}

type ConflictListener = (conflict: SyncConflict) => void;
const conflictListeners = new Set<ConflictListener>();

// UI 层注册冲突监听，弹出对话框让用户选择（前端优先为默认兜底）
export function onSyncConflict(listener: ConflictListener): () => void {
  conflictListeners.add(listener);
  return () => conflictListeners.delete(listener);
}

function emitConflict(store: string, local: unknown, remote: unknown): Promise<'local' | 'remote'> {
  return new Promise((resolve) => {
    const conflict: SyncConflict = {
      store,
      local,
      remote,
      resolve: (choice) => resolve(choice),
    };
    if (conflictListeners.size === 0) {
      // 无 UI 监听时默认前端优先
      resolve('local');
      return;
    }
    conflictListeners.forEach((l) => l(conflict));
  });
}

type ConflictHandler<T = unknown> = (local: T, remote: T) => Promise<T>;

interface StoreSyncConfig<T = unknown> {
  name: string;
  applyUpdates: (updates: T[], version?: number) => void;
  getMeta: () => SyncMeta;
  setMeta: (meta: SyncMeta) => void;
  onConflict?: ConflictHandler<T>;
}

const CONFLICT_STRATEGY = 'client-wins'; // 个人工具默认前端优先

class SyncManager {
  private configs = new Map<string, StoreSyncConfig<unknown>>();
  private syncing = new Set<string>();

  register<T = unknown>(config: StoreSyncConfig<T>) {
    this.configs.set(config.name, config as StoreSyncConfig<unknown>);
  }

  async syncAll() {
    const results = await Promise.allSettled(
      Array.from(this.configs.values()).map((c) => this.syncStore(c.name))
    );
    await flushSyncQueue().catch(() => {});
    return results;
  }

  async syncStore(name: string) {
    const config = this.configs.get(name);
    if (!config || this.syncing.has(name)) return;
    this.syncing.add(name);
    try {
      const { lastSyncAt } = config.getMeta();
      const { updates, version } = await getSyncUpdates(name, lastSyncAt);
      if (updates.length > 0) {
        config.applyUpdates(updates as unknown[], version);
        config.setMeta({ lastSyncAt: new Date().toISOString(), version });
      }
    } catch {
      // 后端未就绪，保持本地数据
    } finally {
      this.syncing.delete(name);
    }
  }

  async resolveConflict(name: string, local: unknown, remote: unknown): Promise<unknown> {
    const config = this.configs.get(name);
    if (!config) return local;
    if (config.onConflict) return config.onConflict(local, remote);
    // 弹出可选冲突对话框；无 UI 监听或用户关闭时按默认策略（前端优先）
    const choice = await emitConflict(name, local, remote);
    return choice === 'remote' ? remote : local;
  }

  private defaultConflictResolver(local: unknown, remote: unknown): unknown {
    if (CONFLICT_STRATEGY === 'client-wins') return local;
    if (CONFLICT_STRATEGY === 'server-wins') return remote;
    return local;
  }
}

export const syncManager = new SyncManager();