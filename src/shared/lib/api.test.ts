// src/shared/lib/api.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import apiClient from '@/shared/lib/apiClient';
import { apiGet, apiPost, apiDelete } from '@/shared/lib/api';
import { projectListResponseSchema } from '@/lib/validation/responses';

vi.mock('@/lib/monitoring', () => ({
  captureException: vi.fn(),
}));

describe('shared/lib/api - 泛型封装与 zod 校验', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('apiGet 用 schema 解析成功响应', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { projects: [{ id: 'p1', title: 't', status: 'draft', createdAt: '2026', updatedAt: '2026' }] },
    });
    const out = await apiGet('/api/projects', projectListResponseSchema, '项目列表');
    expect(out.projects[0].id).toBe('p1');
  });

  it('apiGet 响应不合法时抛出并上报', async () => {
    const { captureException } = await import('@/lib/monitoring');
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { projects: [{ id: 'p1' }] } });
    await expect(apiGet('/api/projects', projectListResponseSchema, '项目列表')).rejects.toThrow('响应校验失败');
    expect(captureException).toHaveBeenCalled();
  });

  it('apiPost 发送 body 并解析', async () => {
    const spy = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { characters: [] } });
    const out = await apiPost('/api/characters', undefined as never, '角色', { name: 'x' });
    expect(spy).toHaveBeenCalledWith('/api/characters', { name: 'x' }, expect.anything());
    expect(out).toEqual({ characters: [] });
  });

  it('dev 期注入 X-Mock-Mode 头', async () => {
    const spy = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: undefined });
    await apiDelete('/api/projects/p1', undefined as never, '删除项目');
    const cfg = spy.mock.calls[0][1] as { headers?: Record<string, string> };
    expect(cfg.headers?.['X-Mock-Mode']).toBe('1');
  });
});
