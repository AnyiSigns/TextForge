// tests/agent/agentApi.test.ts
// agent API 契约回归测试：锁释放响应体判定 + 记忆搜索语义/全文降级。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as agentApi from '@/shared/api/agent';

vi.mock('@/shared/stores/authStore', () => ({
  getAccessToken: () => 'test-token',
  waitForHydration: async () => {},
  useAuthStore: {
    getState: () => ({
      hasHydrated: true,
      accessToken: 'test-token',
      refreshAccessToken: async () => true,
    }),
  },
}));

// fetchModelConfig 由 getModelConfigData 调用：测试里按场景覆盖
vi.mock('@/shared/api/models', () => ({
  fetchModelConfig: vi.fn(),
}));

import { fetchModelConfig } from '@/shared/api/models';
const fetchModelConfigMock = vi.mocked(fetchModelConfig);

// apiClient 基于 axios（client.ts），这里 mock axios 实例
const postMock = vi.fn();
const delMock = vi.fn();
vi.mock('@/shared/api/client', () => ({
  apiClient: {
    post: (...a: unknown[]) => postMock(...a),
    delete: (...a: unknown[]) => delMock(...a),
  },
  extractApiDetail: () => '',
}));

function resetMocks() {
  postMock.mockReset();
  delMock.mockReset();
  fetchModelConfigMock.mockReset();
  fetchModelConfigMock.mockResolvedValue({ textRoleModels: {}, embeddingModel: undefined, searchConfig: undefined });
}

describe('releaseBookLock 响应体判定', () => {
  beforeEach(resetMocks);

  it('后端返回 {ok:true, released:true} 时判定成功', async () => {
    delMock.mockResolvedValue({ data: { ok: true, released: true } });
    expect(await agentApi.releaseBookLock(1)).toBe(true);
  });

  it('后端 redis 删除失败返回 200+{ok:false} 时判定失败（不再误报已解除）', async () => {
    delMock.mockResolvedValue({ data: { ok: false, released: false } });
    expect(await agentApi.releaseBookLock(1)).toBe(false);
  });

  it('请求抛错时判定失败', async () => {
    delMock.mockRejectedValue(new Error('network'));
    expect(await agentApi.releaseBookLock(1)).toBe(false);
  });
});

describe('searchAgentMemories 语义/全文降级', () => {
  beforeEach(resetMocks);

  it('已配置 embedding 时携带 mode=semantic 与 embedding_config', async () => {
    fetchModelConfigMock.mockResolvedValue({
      textRoleModels: {},
      embeddingModel: { adapter: 'dashscope', base_url: 'http://x', api_key: 'k', model_id: 'text-embedding-v4' },
      searchConfig: undefined,
    });
    postMock.mockResolvedValue({ data: [{ id: 1, content: 'm' }] });
    await agentApi.searchAgentMemories(7, '主角身世');

    const [url, body] = postMock.mock.calls[0];
    expect(url).toBe('/agent-memories/search');
    expect(body).toMatchObject({ q: '主角身世', bookId: 7, mode: 'semantic' });
    expect(body.modelConfig.embedding_config).toMatchObject({ model_id: 'text-embedding-v4', api_key: 'k' });
  });

  it('未配置 embedding 时不携带 mode（后端降级 fulltext）', async () => {
    fetchModelConfigMock.mockResolvedValue({ textRoleModels: {}, embeddingModel: undefined, searchConfig: undefined });
    postMock.mockResolvedValue({ data: [] });
    await agentApi.searchAgentMemories(7, '主角身世');

    const body = postMock.mock.calls[0][1] as Record<string, unknown>;
    expect(body.q).toBe('主角身世');
    expect(body.mode).toBeUndefined();
    expect(body.modelConfig).toBeUndefined();
  });

  it('embedding 配置为空（无 model_id）时同样走全文分支', async () => {
    fetchModelConfigMock.mockResolvedValue({
      textRoleModels: {},
      embeddingModel: { adapter: '', base_url: '', api_key: '', model_id: '' },
      searchConfig: undefined,
    });
    postMock.mockResolvedValue({ data: [] });
    await agentApi.searchAgentMemories(7, 'x');
    expect(postMock.mock.calls[0][1]).toMatchObject({ q: 'x' });
    expect((postMock.mock.calls[0][1] as Record<string, unknown>).mode).toBeUndefined();
  });
});
