'use client';

import { useEffect, useState } from 'react';
import { getDownloadedTiers, initDownloadedTiers, subscribeDownloaded } from '@/lib/rag/embed';

export function useEmbedDownloaded(): string[] {
  const [mounted, setMounted] = useState(false);
  const [tiers, setTiers] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    initDownloadedTiers().then(() => {
      setTiers(getDownloadedTiers());
      unsub = subscribeDownloaded(() => {
        setTiers(getDownloadedTiers());
      });
    });
    return () => { if (unsub) unsub(); };
  }, []);

  if (!mounted) return [];
  return tiers;
}
