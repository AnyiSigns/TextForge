// src/lib/hooks/useNetworkQuality.ts
'use client';

import { useEffect, useState, useCallback } from 'react';
import { API_URL } from '@/lib/config/env';

export interface NetworkQuality {
  latencyMs: number | null;
  measuring: boolean;
  lastError: string | null;
}

// 探测云端服务延迟：复用 /api/health 端点做往返计时。失败时不抛出，仅标记错误。
export function useNetworkQuality(enabled: boolean) {
  const [quality, setQuality] = useState<NetworkQuality>({
    latencyMs: null,
    measuring: false,
    lastError: null,
  });

  const measure = useCallback(async () => {
    if (!enabled) return;
    setQuality((q) => ({ ...q, measuring: true, lastError: null }));
    try {
      const pingUrl = `${API_URL}/api/health?_=${Date.now()}`;
      const t0 = performance.now();
      const head = await fetch(pingUrl, { method: 'HEAD', cache: 'no-store' });
      const latency = Math.round(performance.now() - t0);
      setQuality({ latencyMs: latency, measuring: false, lastError: head.ok ? null : '服务异常' });
    } catch (e) {
      setQuality((q) => ({
        ...q,
        measuring: false,
        latencyMs: null,
        lastError: e instanceof Error ? e.message : '网络不可达',
      }));
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void measure();
    const interval = setInterval(() => void measure(), 20000);
    return () => clearInterval(interval);
  }, [enabled, measure]);

  return { quality, measure };
}
