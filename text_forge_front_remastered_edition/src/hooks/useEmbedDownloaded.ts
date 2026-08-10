'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { getDownloadedTiers, initDownloadedTiers, subscribeDownloaded } from '@/lib/rag/embed';

// 服务端快照必须是稳定引用：SSR/水合首帧统一返回同一空数组，挂载后再由客户端快照接管，
// 避免 useSyncExternalStore 因每次 new [] 触发「getServerSnapshot should be cached」告警与水合不一致。
const SERVER_SNAPSHOT: string[] = [];

export function useEmbedDownloaded(): string[] {
  // 通过 useSyncExternalStore 订阅已下载档位集合（模块级单一数据源），
  // 无需在 effect 中同步 setState；挂载后异步初始化一次。
  const [hydrated, setHydrated] = useState(false);
  const tiers = useSyncExternalStore(
    subscribeDownloaded,
    () => getDownloadedTiers(),
    () => SERVER_SNAPSHOT,
  );

  useEffect(() => {
    let active = true;
    initDownloadedTiers().then(() => {
      if (active) setHydrated(true);
    });
    return () => { active = false; };
  }, []);

  if (!hydrated) return [];
  return tiers;
}
