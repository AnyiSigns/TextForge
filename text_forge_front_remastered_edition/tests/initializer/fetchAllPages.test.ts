// tests/initializer/fetchAllPages.test.ts
// fetchAllPages：初始化器落库去重依赖完整实体清单，必须拉取全部分页直到 total 覆盖。
import { it, expect, beforeEach, vi } from 'vitest';

const clientMock = vi.hoisted(() => ({
  apiClient: { get: vi.fn() },
}));
vi.mock('@/shared/api/client', () => clientMock);

import { fetchLocations, fetchSceneEvents } from '@/shared/api/world';

beforeEach(() => {
  vi.clearAllMocks();
});

it('fetchAllPages 拉取全部分页直到 total 覆盖（>100 实体不丢）', async () => {
  const mk = (start: number, count: number) => ({
    items: Array.from({ length: count }, (_, i) => ({ id: start + i, name: `地点${start + i}` })),
    total: 250,
  });
  clientMock.apiClient.get
    .mockResolvedValueOnce({ data: mk(1, 100) })
    .mockResolvedValueOnce({ data: mk(101, 100) })
    .mockResolvedValueOnce({ data: mk(201, 50) });
  const items = await fetchLocations(7);
  expect(items).toHaveLength(250);
  expect(clientMock.apiClient.get).toHaveBeenCalledTimes(3);
  expect(clientMock.apiClient.get).toHaveBeenNthCalledWith(1, expect.stringContaining('page=1'));
  expect(clientMock.apiClient.get).toHaveBeenNthCalledWith(3, expect.stringContaining('page=3'));
  expect(clientMock.apiClient.get).toHaveBeenNthCalledWith(1, expect.stringContaining('book_id=7'));
});

it('空页提前终止（不无限翻页）', async () => {
  clientMock.apiClient.get.mockResolvedValueOnce({ data: { items: [], total: 0 } });
  const items = await fetchSceneEvents(1);
  expect(items).toEqual([]);
  expect(clientMock.apiClient.get).toHaveBeenCalledTimes(1);
});

it('数据数组形态响应同样兼容', async () => {
  clientMock.apiClient.get.mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }] });
  const items = await fetchLocations(1);
  expect(items).toHaveLength(2);
  expect(clientMock.apiClient.get).toHaveBeenCalledTimes(1);
});
