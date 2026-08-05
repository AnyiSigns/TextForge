import { authFetch } from '@/shared/lib/authFetch';

export async function fetchHealth(): Promise<{ status: string; latencyMs?: number }> {
  const start = performance.now();
  const res = await authFetch('/api/health');
  const latencyMs = Math.round(performance.now() - start);
  if (!res.ok) throw new Error('健康检查失败');
  return { ...(await res.json()), latencyMs };
}

export async function fetchSync(): Promise<{ synced: boolean }> {
  const res = await authFetch('/api/sync');
  if (!res.ok) throw new Error('同步失败');
  return res.json();
}
