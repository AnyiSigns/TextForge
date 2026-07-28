// 统一的本地 ID 生成：优先用 crypto.randomUUID，回退到时间戳+随机串。
// 各 store 不再各自实现 uid()，统一走此处，避免回退算法分叉。
export function uid(prefix?: string): string {
  const base =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prefix ? `${prefix}-${base}` : base;
}
