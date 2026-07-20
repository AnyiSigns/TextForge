// src/lib/monitoring/monitoring.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { captureException, captureMessage, getRing } from '@/lib/monitoring/report';
import { monitoringConfig } from '@/lib/monitoring/config';

describe('monitoring - 配置', () => {
  it('非生产环境下关闭上报', () => {
    expect(monitoringConfig.enabled).toBe(false);
    expect(['development', 'test']).toContain(monitoringConfig.env);
  });
});

describe('monitoring - 本地环形缓冲降级', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('captureException 写入环形缓冲且控制台输出', () => {
    captureException(new Error('boom'), { a: 1 });
    const ring = getRing();
    expect(ring.length).toBe(1);
    expect(ring[0].level).toBe('exception');
    expect(ring[0].message).toBe('boom');
    expect(ring[0].extra).toMatchObject({ a: 1 });
  });

  it('captureMessage 写入环形缓冲', () => {
    captureMessage('hello', { tag: 'x' });
    const ring = getRing();
    expect(ring[0].level).toBe('message');
    expect(ring[0].message).toBe('hello');
  });

  it('环形缓冲超过上限后被裁剪', () => {
    for (let i = 0; i < 60; i++) captureMessage(`m${i}`);
    const ring = getRing();
    expect(ring.length).toBeLessThanOrEqual(50);
  });
});
