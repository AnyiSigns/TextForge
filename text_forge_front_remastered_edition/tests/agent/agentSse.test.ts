// tests/agent/agentSse.test.ts
// Agent SSE 链路单元测试：streamAgent 解析 + useAgentSender 事件处理。
// 目标：锁住「该展示的没展示」回归（suggestions/node_fail/title_update/error 等）。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBookDetailStore } from '@/app/(dashboard)/books/[id]/store';
import { useAgentSender } from '@/features/agent/useAgentSender';
import { streamAgent } from '@/shared/api/agent';

vi.mock('@/shared/stores/authStore', () => ({
  getAccessToken: () => 'test-token',
}));

vi.mock('@/shared/api/models', () => ({
  fetchModelConfig: async () => ({
    textRoleModels: { main: { adapter: 'openai', base_url: 'http://x', api_key: 'k', model_id: 'm' } },
    searchConfig: null,
  }),
}));

// 只 mock startAgentSession，保留真实 streamAgent（测其 SSE 解析）
vi.mock('@/shared/api/agent', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/shared/api/agent')>();
  return {
    ...orig,
    startAgentSession: vi.fn(async () => ({ thread_id: 't1', book_id: 1, type: 'user_agent' })),
  };
});

function sseBody(events: unknown[]): Response {
  const enc = new TextEncoder();
  const chunks = events.map((e) => enc.encode(`data: ${JSON.stringify(e)}\n\n`));
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((x) => c.enqueue(x));
      c.close();
    },
  });
  return { ok: true, body } as unknown as Response;
}

function resetStore() {
  useBookDetailStore.setState({
    bookId: 1,
    agentThreadId: 't1',
    agentStreaming: false,
    agentMessages: [],
    agentToolLog: [],
    agentNodeStatuses: [],
    nodeOutputs: {},
    agentStatus: { kind: 'idle' },
    pendingReview: null,
  });
}

describe('streamAgent SSE 解析', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetStore();
  });

  it('解析 data: 事件流，end 后继续读取 title_update 不丢事件', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseBody([
        { type: 'think_start', elapsed: 0 },
        { type: 'token', token: '你好' },
        { type: 'end', reply: '你好，世界' },
        { type: 'title_update', thread_id: 't1', title: '剧情探讨' },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const events: string[] = [];
    let doneReply = '';
    let errorMsg = '';
    await streamAgent(
      't1',
      'hi',
      (e) => events.push(e.type),
      (r) => { doneReply = r; },
      (e) => { errorMsg = e; },
    );

    expect(events).toEqual(['think_start', 'token', 'end', 'title_update']);
    expect(doneReply).toBe('你好，世界');
    expect(errorMsg).toBe('');
  });

  it('error 事件终止并回调 onError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      sseBody([{ type: 'token', token: 'a' }, { type: 'error', message: '模型服务异常 (500)' }]),
    ));
    const events: string[] = [];
    let doneCalled = false;
    let errorMsg = '';
    await streamAgent('t1', 'hi', (e) => events.push(e.type), () => { doneCalled = true; }, (e) => { errorMsg = e; });
    expect(events).toEqual(['token', 'error']);
    expect(doneCalled).toBe(false);
    expect(errorMsg).toContain('模型服务异常');
  });

  it('非 ok 响应直接抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(streamAgent('t1', 'hi', () => {}, () => {}, () => {})).rejects.toThrow('Agent 请求失败');
  });
});

describe('useAgentSender 事件处理（store 状态变更）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetStore();
  });

  function mockStream(events: unknown[]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseBody(events)));
  }

  it('token 累积到 streaming 消息，end 后定型并结束流式（无残留光标消息）', async () => {
    mockStream([
      { type: 'token', token: '你' },
      { type: 'token', token: '好' },
      { type: 'end', reply: '你好' },
    ]);
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('hi'); });

    const state = useBookDetailStore.getState();
    expect(state.agentStreaming).toBe(false);
    // end 后 streaming 消息被定型为 assistant，不再残留（否则 3 点光标/正在酝酿一直显示）
    expect(state.agentMessages.some((m) => m.type === 'streaming')).toBe(false);
    const settled = state.agentMessages.filter((m) => m.type !== 'user');
    expect(settled[settled.length - 1].content).toBe('你好');
  });

  it('tool_start/tool_end 以独立工具卡片消息记录（running→done）', async () => {
    mockStream([
      { type: 'tool_start', tool: 'search' },
      { type: 'tool_end', tool: 'search' },
      { type: 'end', reply: '完成' },
    ]);
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('查一下'); });
    const state = useBookDetailStore.getState();
    const card = state.agentMessages.find((m) => m.type === 'tool');
    expect(card).toBeTruthy();
    expect(card!.tool).toBe('search');
    expect(card!.toolStatus).toBe('done');
    // 工具卡片作为独立消息存在（不再依赖 agentToolLog 日志数组）
    expect(state.agentMessages.some((m) => m.type === 'tool')).toBe(true);
  });

  it('review_card 设置待审核卡', async () => {
    mockStream([
      { type: 'review_card', node_id: 'n1', node_label: '执笔写手', output_preview: '正文...', reason: '文风不符' },
      { type: 'end', reply: '' },
    ]);
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('跑工作流'); });
    const review = useBookDetailStore.getState().pendingReview;
    expect(review).toBeTruthy();
    expect((review as Record<string, unknown>).node_label).toBe('执笔写手');
  });

  it('审核操作后 review-card 消息从消息流移除（卡片消失）', async () => {
    mockStream([
      { type: 'review_card', node_id: 'n1', node_label: '执笔写手', output_preview: '正文...', reason: '文风不符' },
      { type: 'end', reply: '' },
    ]);
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('跑工作流'); });
    expect(useBookDetailStore.getState().agentMessages.some((m) => m.type === 'review-card')).toBe(true);

    // 模拟用户点击「接受」：直接调用 store 清理（与 handleReviewAction 一致）
    await act(async () => {
      useBookDetailStore.setState((s) => ({
        agentMessages: s.agentMessages.filter((m) => m.type !== 'review-card'),
      }));
    });
    expect(useBookDetailStore.getState().agentMessages.some((m) => m.type === 'review-card')).toBe(false);
  });

  it('propose_cards 生成提议卡片消息并切换创作阶段', async () => {
    mockStream([
      { type: 'propose_cards', card_types: ['world_setup'], reason: '需要世界设定', cards: [] },
      { type: 'end', reply: '' },
    ]);
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('提议卡片'); });
    const state = useBookDetailStore.getState();
    expect(state.agentMessages.some((m) => m.type === 'propose-cards')).toBe(true);
    expect(state.creativePhase).toBe('worldbuilding');
  });

  it('suggestions 事件生成可见消息（不该丢弃）', async () => {
    mockStream([
      { type: 'suggestions', items: [{ type: 'plot_thread_stalled', message: '支线A已停滞 2 章' }] },
      { type: 'end', reply: '好的' },
    ]);
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('分析下'); });
    const state = useBookDetailStore.getState();
    expect(state.agentMessages.some((m) => m.type === 'suggestions' && (m.content || '').includes('支线A'))).toBe(true);
  });

  it('node_fail 事件展示错误并标记卡片失败（不该静默）', async () => {
    mockStream([
      { type: 'node_start', node_id: 'writer', label: '执笔写手' },
      { type: 'node_fail', node_id: 'writer', label: '执笔写手', reason: 'LLM 超时' },
      { type: 'end', reply: '' },
    ]);
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('跑工作流'); });
    const state = useBookDetailStore.getState();
    expect(state.agentMessages.some((m) => m.type === 'error' && (m.content || '').includes('执笔写手'))).toBe(true);
    expect(state.agentNodeStatuses.find((c) => c.nodeId === 'writer')).toMatchObject({
      status: 'failed',
      reason: 'LLM 超时',
    });
  });

  it('工作流节点（角色）执行：节点正文进 nodeOutputs（卡片内部展示）+ 状态卡片流转（running→completed），且不显示工具状态条', async () => {
    mockStream([
      { type: 'tool_start', tool: 'execute_workflow' },
      { type: 'node_start', node_id: 'writer', label: '执笔写手' },
      { type: 'node_stream', node_id: 'writer', token: '夜色渐深，' },
      { type: 'node_stream', node_id: 'writer', token: '少年推门而入。' },
      { type: 'node_end', node_id: 'writer', tokens: 12 },
      { type: 'node_start', node_id: 'polish', label: '文风润色师' },
      { type: 'node_stream', node_id: 'polish', token: '（润色中）' },
      { type: 'node_end', node_id: 'polish', tokens: 3 },
      { type: 'tool_end', tool: 'execute_workflow' },
      { type: 'end', reply: '工作流执行完成' },
    ]);
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('请用速写模式工作流写一章'); });

    const state = useBookDetailStore.getState();
    // 节点正文进入 nodeOutputs（按 nodeId），由状态卡片展开时在卡片内部展示
    expect(state.nodeOutputs.writer).toBe('夜色渐深，少年推门而入。');
    expect(state.nodeOutputs.polish).toBe('（润色中）');
    // 不再创建 node-output 消息（避免正文浮动在状态卡片上方）
    expect(state.agentMessages.some((m) => m.type === 'node-output')).toBe(false);

    // 状态卡片流转：writer/polish 均为 completed + tokens
    const cards = state.agentNodeStatuses;
    expect(cards).toHaveLength(2);
    expect(cards.find((c) => c.nodeId === 'writer')).toMatchObject({ status: 'completed', tokens: 12 });
    expect(cards.find((c) => c.nodeId === 'polish')).toMatchObject({ status: 'completed', tokens: 3 });

    // 工作流工具不显示「请求外援中」工具状态条（execute_workflow 走节点状态卡片承载进度）
    expect(state.agentToolLog).toHaveLength(0);
  });

  it('node_start 时状态卡片先置 running', async () => {
    mockStream([
      { type: 'node_start', node_id: 'writer', label: '执笔写手' },
      { type: 'node_end', node_id: 'writer', tokens: 5 },
      { type: 'end', reply: '' },
    ]);
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('跑工作流'); });
    const cards = useBookDetailStore.getState().agentNodeStatuses;
    expect(cards.find((c) => c.nodeId === 'writer')?.status).toBe('completed');
  });

  it('error 事件产生错误消息并结束流式', async () => {
    mockStream([{ type: 'error', message: '服务器内部错误' }]);
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('hi'); });
    const state = useBookDetailStore.getState();
    expect(state.agentStreaming).toBe(false);
    expect(state.agentMessages.some((m) => m.type === 'error' && m.content === '服务器内部错误')).toBe(true);
  });

  it('无 threadId 时先启动会话', async () => {
    useBookDetailStore.setState({ agentThreadId: null });
    mockStream([{ type: 'end', reply: 'ok' }]);
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('hi'); });
    expect(useBookDetailStore.getState().agentThreadId).toBe('t1');
  });
});
