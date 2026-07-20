// src/lib/hooks/useBackendStatus.ts
// 检测后端 API 是否可达：用于"本地模式"徽标与离线提示。
// 后端未就绪（hello-world / 404 / 连不上）时统一视为离线。
import { useEffect, useState, useCallback } from 'react';
import { API_URL } from '@/lib/config/env';

export type BackendStatus = 'checking' | 'online' | 'offline';

let cached: BackendStatus = 'checking';
const listeners = new Set<(s: BackendStatus) => void>();

async function probe(): Promise<BackendStatus> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${API_URL}/api/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(t);
    // 200 视为就绪；其它（含 404 hello-world）视为未就绪
    return res.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

export async function refreshBackendStatus(): Promise<BackendStatus> {
  cached = await probe();
  listeners.forEach((l) => l(cached));
  return cached;
}

export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>(cached);

  useEffect(() => {
    const onUpdate = (s: BackendStatus) => setStatus(s);
    listeners.add(onUpdate);
    if (cached === 'checking') {
      void refreshBackendStatus();
    }
    const interval = setInterval(() => { void refreshBackendStatus(); }, 30000);
    return () => {
      listeners.delete(onUpdate);
      clearInterval(interval);
    };
  }, []);

  return status;
}

export function useRetryBackendCheck() {
  return useCallback(() => { void refreshBackendStatus(); }, []);
}
