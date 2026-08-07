// tests/workflow/executionPanel.test.tsx
// 工作流运行面板：node_stream 流式输出必须展示（角色节点执行过程可见）。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ExecutionPanel } from '@/app/(dashboard)/workflow/components/ExecutionPanel';
import type { Workflow } from '@/shared/api/workflows';

vi.mock('@/shared/stores/authStore', () => ({ getAccessToken: () => 'tk' }));
vi.mock('@/shared/api/models', () => ({
  fetchModelConfig: async () => ({
    textRoleModels: { main: { adapter: 'openai', base_url: 'http://x', api_key: 'k', model_id: 'm' } },
    searchConfig: null,
  }),
}));

function sseResponse(events: unknown[]): Response {
  const enc = new TextEncoder();
  const chunks = events.map((e) => enc.encode(`data: ${JSON.stringify(e)}\n\n`));
  return {
    ok: true,
    body: new ReadableStream<Uint8Array>({ start(c) { chunks.forEach((x) => c.enqueue(x)); c.close(); } }),
  } as unknown as Response;
}

const workflow: Workflow = {
  id: 'wf1',
  name: '速写模式',
  nodes: [
    { id: 'writer', label: '执笔写手' },
    { id: 'polish', label: '文风润色师' },
  ],
} as unknown as Workflow;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ExecutionPanel 流式输出展示', () => {
  it('node_stream 事件累积展示节点输出（不该丢弃）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      { event: 'node_start', node_id: 'writer', label: '执笔写手' },
      { event: 'node_stream', node_id: 'writer', token: '夜色渐深，' },
      { event: 'node_stream', node_id: 'writer', token: '少年推门而入。' },
      { event: 'node_end', node_id: 'writer', tokens: 12 },
      { event: 'node_start', node_id: 'polish', label: '文风润色师' },
      { event: 'node_end', node_id: 'polish', tokens: 3 },
      { event: 'done', result: { status: 'completed' } },
    ])));

    render(<ExecutionPanel workflow={workflow} bookId={1} onClose={() => {}} />);
    const runBtn = screen.getByRole('button', { name: /运行/ });
    runBtn.click();

    await waitFor(() => {
      expect(screen.getByText(/夜色渐深，少年推门而入/)).toBeTruthy();
    });
  });

  it('node_fail 展示失败原因', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      { event: 'node_start', node_id: 'writer', label: '执笔写手' },
      { event: 'node_fail', node_id: 'writer', label: '执笔写手', reason: 'LLM 超时' },
      { event: 'done', result: { status: 'error', message: '执行失败' } },
    ])));

    render(<ExecutionPanel workflow={workflow} bookId={1} onClose={() => {}} />);
    screen.getByRole('button', { name: /运行/ }).click();

    await waitFor(() => {
      expect(screen.getByText(/LLM 超时/)).toBeTruthy();
    });
  });
});
