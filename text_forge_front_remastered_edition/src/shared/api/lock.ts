import type { LockResult } from './types';
import { authFetch } from '@/shared/lib/authFetch';

export async function toggleLock(entityType: string, entityId: number): Promise<LockResult> {
  const res = await authFetch(`/api/lock/${entityType}/${entityId}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('切换锁定状态失败');
  return res.json();
}
