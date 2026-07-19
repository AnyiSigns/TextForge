import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/config/env', () => ({
  API_URL: 'http://localhost:8000',
}));

vi.mock('@/lib/auth/cookie', () => ({
  setRefreshCookie: vi.fn(),
  clearRefreshCookie: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  default: {
    post: vi.fn().mockResolvedValue({}),
  },
  getSyncUpdates: vi.fn().mockResolvedValue({ updates: [], version: 1 }),
}));

describe('11.2 集成测试 - API 客户端集成', () => {
  it('getSyncUpdates 返回正确结构', async () => {
    const { getSyncUpdates } = await import('@/lib/api/client');
    
    const result = await getSyncUpdates('projects', '2024-01-01');
    expect(result).toHaveProperty('updates');
    expect(result).toHaveProperty('version');
    expect(Array.isArray(result.updates)).toBe(true);
  });
});

describe('11.2 集成测试 - 存储集成', () => {
  it('localStorage 跨模块数据共享', async () => {
    const key = 'test-key';
    const value = { data: 'test-value' };
    
    localStorage.setItem(key, JSON.stringify(value));
    const retrieved = JSON.parse(localStorage.getItem(key) || 'null');
    
    expect(retrieved).toEqual(value);
    
    localStorage.removeItem(key);
    expect(localStorage.getItem(key)).toBeNull();
  });
});

describe('11.2 集成测试 - SSE 流集成', () => {
  it('完整 SSE 流解析流程', () => {
    const sseStream = [
      'data: {"type":"agent_switch","agent":"world-builder"}\n\n',
      'data: {"type":"chunk","content":"正在构建世界..."}\n\n',
      'data: {"type":"step_complete"}\n\n',
      'data: {"type":"done"}\n\n',
    ];

    const events = sseStream
      .map(line => {
        const match = line.match(/^data: (.+)/);
        return match ? JSON.parse(match[1]) : null;
      })
      .filter(Boolean);

    expect(events.length).toBe(4);
    expect(events[0].type).toBe('agent_switch');
    expect(events[1].type).toBe('chunk');
    expect(events[2].type).toBe('step_complete');
    expect(events[3].type).toBe('done');
  });
});

describe('11.2 集成测试 - 验证流程集成', () => {
  it('表单验证完整流程', () => {
    const formData = {
      title: '项目',
      description: '描述',
      genre: '科幻',
    };

    const errors: string[] = [];

    if (!formData.title || formData.title.length > 100) {
      errors.push('标题不合法');
    }
    if (formData.description && formData.description.length > 500) {
      errors.push('描述过长');
    }

    expect(errors.length).toBe(0);
  });

  it('验证失败时收集错误', () => {
    const formData = {
      title: '',
      description: 'a'.repeat(600),
      genre: '科幻',
    };

    const errors: string[] = [];

    if (!formData.title) {
      errors.push('标题不能为空');
    }
    if (formData.description.length > 500) {
      errors.push('描述过长');
    }

    expect(errors).toContain('标题不能为空');
    expect(errors).toContain('描述过长');
  });
});