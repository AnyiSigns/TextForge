'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { initDownloadedTiers, getCurrentTier, subscribeTier } from '@/lib/rag/embed';

export function useEmbedTier(): string {
  useEffect(() => {
    void initDownloadedTiers();
  }, []);

  return useSyncExternalStore(subscribeTier, getCurrentTier, getCurrentTier);
}
