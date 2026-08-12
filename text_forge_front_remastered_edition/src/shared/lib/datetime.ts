/**
 * P1-12：后端 created_at 为 naive UTC（不带时区），若直接用 new Date(iso) 会被
 * 当成「本地时间」解析，导致显示相对 UTC 偏移数小时。这里统一按 UTC 解析。
 */
export function parseUtc(iso: string): Date {
  if (/z$/i.test(iso) || /[+-]\d{2}:?\d{2}$/.test(iso)) return new Date(iso);
  // naive（无时区后缀）→ 视为 UTC
  return new Date(`${iso.replace(' ', 'T')}Z`);
}

export function formatUtc(iso: string | undefined | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '-';
  const d = parseUtc(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString(undefined, opts);
}
