// src/lib/storage/sync.ts
// 登录后统一触发各 store 从后端拉取一次，保证本地与服务器对齐。
// 个人工具采用"本地优先 + 后端最终一致"，冲突时前端优先。
import { syncManager } from '@/lib/storage/syncManager';

export async function syncAllStores(): Promise<void> {
  await syncManager.syncAll();
}
