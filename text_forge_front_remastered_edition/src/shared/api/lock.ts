import type { LockResult } from './types';

export async function toggleLock(entityType: string, entityId: number): Promise<LockResult> {
  const res = await fetch(`/api/lock/${entityType}/${entityId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('切换锁定状态失败');
  return res.json();
}
