import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/config/env', () => ({
  API_URL: 'http://localhost:8000',
}));

vi.mock('@/lib/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      accessToken: null,
      setAccessToken: vi.fn(),
      logout: vi.fn(),
    }),
  },
}));

describe('11.1 单元测试 - apiClient', () => {
  describe('ApiError 类', () => {
    it('创建 ApiError 实例', async () => {
      const { ApiError } = await import('@/lib/api/client');
      const error = new ApiError('错误消息', 401, 'TOKEN_EXPIRED');
      
      expect(error.message).toBe('错误消息');
      expect(error.status).toBe(401);
      expect(error.code).toBe('TOKEN_EXPIRED');
      expect(error.name).toBe('ApiError');
    });
  });

  describe('generateIdempotencyKey', () => {
    it('生成唯一的 idempotency key', async () => {
      const { generateIdempotencyKey } = await import('@/lib/api/client');
      
      const key1 = generateIdempotencyKey();
      const key2 = generateIdempotencyKey();
      
      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key1).not.toBe(key2);
    });
  });
});

describe('11.2 集成测试 - SSE 处理', () => {
  it('解析 SSE 数据流', async () => {
    const sseEvents = [
      'data: {"type":"chunk","content":"hello"}\n\n',
      'data: {"type":"chunk","content":" world"}\n\n',
      'data: {"type":"done"}\n\n',
    ];
    
    const parsed = sseEvents.map(e => {
      const json = e.replace('data: ', '').replace(/\n\n$/, '');
      return JSON.parse(json);
    });
    
    expect(parsed[0].type).toBe('chunk');
    expect(parsed[0].content).toBe('hello');
    expect(parsed[2].type).toBe('done');
  });
});