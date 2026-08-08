'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { getDownloadedTiers, initDownloadedTiers, subscribeDownloaded } from '@/lib/rag/embed';

export function useEmbedDownloaded(): string[] {
  // 通过 useSyncExternalStore 订阅已下载档位集合（模块级单一数据源），
  // 无需在 effect 中同步 setState；挂载后异步初始化一次。
  const [hydrated, setHydrated] = useState(false);
  const tiers = useSyncExternalStore(
    subscribeDownloaded,
    () => getDownloadedTiers(),
    () => [],
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
