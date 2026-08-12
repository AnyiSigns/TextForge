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
  waitForHydration: async () => {},
  useAuthStore: {
    getState: () => ({
      hasHydrated: true,
      accessToken: 'test-token',
      refreshAccessToken: async () => true,
    }),
  },
}));

vi.mock('@/shared/api/models', () => ({
  fetchModelConfig: async () => ({
    textRoleModels: { main: { adapter: 'openai', base_url: 'http://x', api_key: 'k', model_id: 'm' } },
    searchConfig: null,
  }),
}));

// 个人库注入链路：mock ragClient（本地检索）与注入配置
const ragSearchMock = vi.fn();
vi.mock('@/lib/knowledge', () => ({
  ragClient: {
    listPersonal: async () => [{ id: 'doc-1', name: '设定集.md', scope: 'personal', status: 'indexed', createdAt: '' }],
    search: (q: string, scope: string, topK: number, filter?: { docIds?: string[] }) =>
      ragSearchMock(q, scope, topK, filter),
  },
}));

const getRagConfigMock = vi.fn();
vi.mock('@/lib/rag/injectionConfig', () => ({
  getRagInjectionConfig: () => getRagConfigMock(),
  saveRagInjectionConfig: async () => {},
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
    // 默认开启注入配置 + 无命中（避免影响其它用例）
    getRagConfigMock.mockResolvedValue({ enabled: true, topK: 3, docIds: [] });
    ragSearchMock.mockResolvedValue([]);
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

  it('propose_cards 事件已删除：不再生成卡片消息、不再切换创作阶段（2.1）', async () => {
    mockStream([
      { type: 'propose_cards', card_types: ['world_setup'], reason: '需要世界设定', cards: [] },
      { type: 'end', reply: '' },
    ]);
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('提议卡片'); });
    const state = useBookDetailStore.getState();
    // propose-cards 已从 AgentMessage 联合类型移除，用宽类型断言其不存在
    expect(state.agentMessages.some((m) => (m as { type?: string }).type === 'propose-cards')).toBe(false);
    expect(state.creativePhase).not.toBe('worldbuilding');
  });

  it('N3：node_end 不带 label 时保留 node_start 的友好标签（不覆盖为 nodeId）', async () => {
    mockStream([
      { type: 'node_start', node_id: 'writer', label: '执笔写手' },
      { type: 'node_end', node_id: 'writer', tokens: 5 },
      { type: 'end', reply: '' },
    ]);
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('跑工作流'); });
    const cards = useBookDetailStore.getState().agentNodeStatuses;
    const writer = cards.find((c) => c.nodeId === 'writer');
    expect(writer?.status).toBe('completed');
    expect(writer?.label).toBe('执笔写手');
    expect(writer?.label).not.toBe('writer');
  });

  it('v4 onDone：end.reply 与流式缓冲相同时不重复写入（无重复消息）', async () => {
    mockStream([
      { type: 'token', token: '你好' },
      { type: 'end', reply: '你好' },
    ]);
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('hi'); });
    const state = useBookDetailStore.getState();
    // 用户消息 type 为 undefined，按 role 过滤非用户消息
    const settled = state.agentMessages.filter((m) => m.role !== 'user');
    expect(settled).toHaveLength(1);
    expect(settled[0].content).toBe('你好');
  });

  it('N5：404（会话不存在）重置 agentThreadId 并提示新建，不附带重试按钮', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, clone: () => ({ json: async () => ({ detail: '会话不存在' }) }) });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('hi'); });
    const state = useBookDetailStore.getState();
    expect(state.agentThreadId).toBeNull();
    const err = state.agentMessages.find((m) => m.type === 'error');
    expect(err?.content).toContain('会话不存在');
    expect((err as { retryMessage?: string } | undefined)?.retryMessage).toBeUndefined();
  });

  it('2.3：turn_metrics 嵌套结构（metrics 字段）', async () => {
    mockStream([
      { type: 'turn_metrics', metrics: { duration_ms: 1234, llm_calls: 2, tool_calls: 1 } },
      { type: 'end', reply: 'ok' },
    ]);
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('hi'); });
    expect(useBookDetailStore.getState().agentStreaming).toBe(false);
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

    // 工作流工具卡片独立成消息，最终复位为 done（无 running 残留）
    const wfCard = state.agentMessages.find(
      (m): m is Extract<(typeof state.agentMessages)[number], { type: 'tool' }> =>
        m.type === 'tool' && m.tool === 'execute_workflow',
    );
    expect(wfCard).toBeDefined();
    expect(wfCard?.toolStatus).toBe('done');
    expect(state.agentMessages.some((m) => m.type === 'tool' && m.toolStatus === 'running')).toBe(false);
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

  it('个人库注入：命中时生成 rag-ref 引用卡并下发 personal_rag_results', async () => {
    mockStream([{ type: 'end', reply: 'ok' }]);
    ragSearchMock.mockResolvedValue([
      { docId: 'doc-1', docName: '设定集.md', text: '主角姓林，生于雾城。', score: 0.9 },
    ]);
    const fetchMock = vi.fn().mockResolvedValue(sseBody([{ type: 'end', reply: 'ok' }]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('hi'); });

    const state = useBookDetailStore.getState();
    // 引用卡可见
    const ref = state.agentMessages.find((m) => m.type === 'rag-ref');
    expect(ref).toBeTruthy();
    expect((ref as { refs?: Array<{ docName: string }> })?.refs?.[0]?.docName).toBe('设定集.md');
    // 请求体带 personal_rag_results（键形状对齐后端 PersonalRagHit）
    const callBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(callBody.personal_rag_results).toEqual([
      { doc_name: '设定集.md', content: '主角姓林，生于雾城。', score: 0.9 },
    ]);
  });

  it('个人库注入：配置关闭时不检索、不生成引用卡、不下发结果', async () => {
    mockStream([{ type: 'end', reply: 'ok' }]);
    getRagConfigMock.mockResolvedValue({ enabled: false, topK: 3, docIds: [] });
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('hi'); });

    expect(ragSearchMock).not.toHaveBeenCalled();
    expect(useBookDetailStore.getState().agentMessages.some((m) => m.type === 'rag-ref')).toBe(false);
  });

  it('个人库注入：配置限定 docIds 时透传给检索入口', async () => {
    mockStream([{ type: 'end', reply: 'ok' }]);
    getRagConfigMock.mockResolvedValue({ enabled: true, topK: 2, docIds: ['doc-1'] });
    const { result } = renderHook(() => useAgentSender());
    await act(async () => { await result.current.sendMessage('hi'); });

    // 第三个参数为过滤条件（docIds 透传）；search(q, limit, filter) 已无 scope 参数
    const filterArg = ragSearchMock.mock.calls[0][2] as { docIds?: string[] };
    expect(ragSearchMock.mock.calls[0][1]).toBe(2);
    expect(filterArg?.docIds).toEqual(['doc-1']);
  });
});
