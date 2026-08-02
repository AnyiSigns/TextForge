export async function fetchHealth(): Promise<{ status: string; latencyMs?: number }> {
  const start = performance.now();
  const res = await fetch('/api/health', { credentials: 'include' });
  const latencyMs = Math.round(performance.now() - start);
  if (!res.ok) throw new Error('健康检查失败');
  return { ...(await res.json()), latencyMs };
}

export async function fetchSync(): Promise<{ synced: boolean }> {
  const res = await fetch('/api/sync', { credentials: 'include' });
  if (!res.ok) throw new Error('同步失败');
  return res.json();
}
