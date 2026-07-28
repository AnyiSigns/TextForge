// src/lib/storage/syncQueue.ts
// 轻量"未同步队列"：本地已写入但 push 后端失败的任务入队，
// 网络恢复或下次打开时自动重试（个人工具，冲突时前端优先）。

import type { ApiError } from '@/lib/api/client';

export type { ApiError };

type SyncTask = () => Promise<void>;

interface QueuedTask {
  key: string;
  run: SyncTask;
  attempts: number;
  onConflict?: (error: ApiError) => Promise<void>;
}

const MAX_ATTEMPTS = 5;
const queue = new Map<string, QueuedTask>();
let timer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry() {
  if (timer) return;
  timer = setTimeout(flush, 5000);
}

async function flush() {
  timer = null;
  if (queue.size === 0) return;
  const tasks = [...queue.values()];
  for (const task of tasks) {
    try {
      await task.run();
      queue.delete(task.key);
    } catch (error) {
      const apiError = error as ApiError;
      const status = apiError.status;
      if (status === 409 && task.onConflict) {
        await task.onConflict(apiError);
        queue.delete(task.key);
        continue;
      }
      task.attempts += 1;
      if (task.attempts >= MAX_ATTEMPTS) queue.delete(task.key);
    }
  }
  if (queue.size > 0) scheduleRetry();
}

// 注册一个待同步任务；相同 key 覆盖（只保留最新状态）
export function enqueueSync(key: string, run: SyncTask, onConflict?: (error: ApiError) => Promise<void>) {
  queue.set(key, { key, run, attempts: 0, onConflict });
  scheduleRetry();
}

// 浏览器回到前台时立即重试一次
if (typeof window !== 'undefined') {
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flush();
  });
}

export async function flushSyncQueue() {
  await flush();
}
