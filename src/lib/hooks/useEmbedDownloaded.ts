// src/lib/hooks/useEmbedDownloaded.ts
import { useSyncExternalStore } from 'react';
import { getDownloadedTiers, subscribeDownloaded, initDownloadedTiers } from '@/lib/rag/embed';

let initPromise: Promise<void> | null = null;

/**
 * 共享「已下载向量模型档位」状态（单一数据源）。
 * 内部订阅 embed.ts 的模块级发布订阅，settings 页与 ModelsSettings 共用同一实时状态，
 * 任一处下载/删除后其它处即时刷新，不再各自维护副本互相不感知。
 */
export function useEmbedDownloaded(): string[] {
  const tiers = useSyncExternalStore(
    subscribeDownloaded,
    getDownloadedTiers,
    () => [],
  );
  if (!initPromise) initPromise = initDownloadedTiers();
  return tiers;
}
