// src/lib/monitoring/report.ts
// 轻量异常上报层。
// - 生产且有 DSN 时走 Sentry 兼容接口（此处以 fetch 打点，不引入额外 SDK 依赖）。
// - 无 DSN（dev / mock）降级为 localStorage 环形缓冲，便于本地调试。
import { monitoringConfig } from './config';

const RING_KEY = 'tf_monitoring_ring';
const RING_MAX = 50;

interface RingEntry {
  ts: number;
  level: 'exception' | 'message';
  message: string;
  extra?: Record<string, unknown>;
}

function readRing(): RingEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RING_KEY);
    return raw ? (JSON.parse(raw) as RingEntry[]) : [];
  } catch {
    return [];
  }
}

function pushRing(entry: RingEntry): void {
  if (typeof window === 'undefined') return;
  const ring = readRing();
  ring.push(entry);
  while (ring.length > RING_MAX) ring.shift();
  try {
    window.localStorage.setItem(RING_KEY, JSON.stringify(ring));
  } catch {
    /* 容量超限忽略 */
  }
}

export function getRing(): RingEntry[] {
  return readRing();
}

async function sendToSentry(
  level: 'exception' | 'message',
  message: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const dsn = monitoringConfig.dsn;
  if (!dsn) return;
  try {
    await fetch(`${dsn}/api/${level === 'exception' ? 'exception' : 'message'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level,
        message,
        release: monitoringConfig.release,
        environment: monitoringConfig.env,
        extra,
      }),
    });
  } catch {
    /* 上报失败不影响主流程 */
  }
}

export function captureException(error: unknown, extra?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  const payload = {
    ...extra,
    stack: error instanceof Error ? error.stack : undefined,
  };
  pushRing({ ts: Date.now(), level: 'exception', message, extra: payload });
  if (monitoringConfig.enabled) {
    void sendToSentry('exception', message, payload);
  } else if (typeof console !== 'undefined') {
    console.error('[monitoring] exception:', message, payload);
  }
}

export function captureMessage(message: string, extra?: Record<string, unknown>): void {
  pushRing({ ts: Date.now(), level: 'message', message, extra });
  if (monitoringConfig.enabled) {
    void sendToSentry('message', message, extra);
  } else if (typeof console !== 'undefined') {
    console.info('[monitoring] message:', message, extra);
  }
}
