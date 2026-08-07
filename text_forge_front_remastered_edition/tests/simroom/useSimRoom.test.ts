// tests/simroom/useSimRoom.test.ts
// 角色模拟房间 WebSocket hook 测试：协议事件处理与错误展示。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimRoomSocket } from '@/shared/api/useSimRoom';
import type { SimRoomDetail } from '@/shared/api/simRooms';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  sent: string[] = [];
  closed = false;
  // WebSocket.OPEN（stub 后无静态常量，用字面量）
  readyState = 1;
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  send(d: string) { this.sent.push(d); }
  close() { this.closed = true; this.readyState = 3; this.onclose?.(null); }
  emit(type: string, payload: Record<string, unknown> = {}) {
    this.onmessage?.({ data: JSON.stringify({ type, ...payload }) });
  }
}

vi.stubGlobal('WebSocket', MockWebSocket);
vi.mock('@/shared/stores/authStore', () => ({ useAuthStore: { getState: () => ({ accessToken: 'tk' }) } }));
vi.mock('@/shared/api/agent', () => ({
  getModelConfigData: () => Promise.resolve(null),
}));

// connect 是异步（先取模型配置再建连），等待 WebSocket 实例出现。
async function waitForSocket(count = 1) {
  for (let i = 0; i < 50; i++) {
    if (MockWebSocket.instances.length >= count) return;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error('WebSocket 未在预期时间内创建');
}

const room: SimRoomDetail = {
  id: 9,
  bookId: 1,
  name: '酒馆夜谈',
  description: '',
  status: 'active',
  locationId: null,
  participants: [],
  messages: [],
  branches: [],
  roundCount: 0,
} as unknown as SimRoomDetail;

beforeEach(() => {
  MockWebSocket.instances = [];
});

describe('useSimRoomSocket 协议处理', () => {
  it('连接后返回 connected 状态', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    expect(result.current.connected).toBe(false);
    await act(async () => { MockWebSocket.instances[0]?.onopen?.(null); });
    expect(result.current.connected).toBe(true);
  });

  it('stream_token 在发送后累积到同一条 AI 消息', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    await act(async () => {
      result.current.send('继续', 'director'); // 触发流式状态
      ws.emit('stream_token', { token: '你' });
      ws.emit('stream_token', { token: '好' });
    });
    const msgs = result.current.messages;
    expect(msgs).toHaveLength(2); // 用户消息 + AI 消息
    const ai = msgs.find((m) => m.senderType === 'system');
    expect(ai?.content).toBe('你好');
  });

  it('connected 事件设置 myRole（用户身份角色名）', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    expect(result.current.myRole).toBe('用户');
    await act(async () => {
      ws.emit('connected', { roomId: 9, userRoleLabel: '林星辰' });
    });
    expect(result.current.myRole).toBe('林星辰');
  });

  it('stream_token 按 senderLabel 分消息，场景独立', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    await act(async () => {
      ws.emit('stream_start');
      ws.emit('stream_token', { token: '夜色', senderLabel: '场景' });
      ws.emit('stream_token', { token: '沉沉', senderLabel: '场景' });
      ws.emit('stream_token', { token: '我也', senderLabel: '林星辰' });
      ws.emit('stream_token', { token: '担心', senderLabel: '林星辰' });
    });
    const msgs = result.current.messages;
    const scene = msgs.find((m) => m.senderLabel === '场景');
    const char = msgs.find((m) => m.senderLabel === '林星辰');
    expect(scene?.content).toBe('夜色沉沉');
    expect(scene?.messageType).toBe('scene');
    expect(char?.content).toBe('我也担心');
  });

  it('send 缺省 speakAs 时用 myRole', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    await act(async () => {
      ws.emit('connected', { roomId: 9, userRoleLabel: '苏月' });
    });
    await act(async () => { result.current.send('你们在聊什么？'); });
    expect(ws.sent.at(-1)).toEqual(JSON.stringify({ type: 'chat', content: '你们在聊什么？', speakAs: '苏月' }));
    expect(result.current.messages.some((m) => m.senderType === 'user' && m.senderLabel === '苏月')).toBe(true);
  });

  it('turn_done 结束流式并记录轮次', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    await act(async () => {
      ws.emit('stream_token', { token: 'x' });
      ws.emit('turn_done', { roundCount: 2 });
    });
    expect(result.current.streaming).toBe(false);
    expect(result.current.roundCount).toBe(2);
  });

  it('error 事件展示错误消息（不该静默）', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    await act(async () => { ws.emit('error', { message: '生成失败：模型超时' }); });
    const msgs = result.current.messages;
    expect(msgs.some((m) => m.content.includes('生成失败'))).toBe(true);
  });

  it('send 先本地回显再发 WS，流式开始', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    await act(async () => { result.current.send('你们在聊什么？', 'director'); });
    expect(ws.sent).toEqual([JSON.stringify({ type: 'chat', content: '你们在聊什么？', speakAs: 'director' })]);
    expect(result.current.streaming).toBe(true);
    expect(result.current.messages.some((m) => m.senderType === 'user' && m.content === '你们在聊什么？')).toBe(true);
  });

  it('end 发送结束指令', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    await act(async () => { result.current.end(true); });
    expect(ws.sent).toEqual([JSON.stringify({ type: 'end', generateSummary: true })]);
  });

  it('房间切换时重建连接并清空消息', async () => {
    const { result, rerender } = renderHook(({ r }) => useSimRoomSocket(r), { initialProps: { r: room } });
    await waitForSocket();
    expect(MockWebSocket.instances).toHaveLength(1);
    await act(async () => { MockWebSocket.instances[0].emit('stream_token', { token: 'a' }); });
    rerender({ r: { ...room, id: 10 } });
    await waitForSocket(2);
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(result.current.messages).toEqual([]);
  });

  it('branch_created 事件追加支线并复位生成状态', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    await act(async () => { result.current.createBranch('plot-thread'); });
    expect(result.current.branching).toBe(true);
    await act(async () => {
      ws.emit('branch_created', {
        branch: { id: 1, title: '酒馆夜话', content: '主角打听到线索。', branchType: 'plot-thread' },
      });
    });
    expect(result.current.branching).toBe(false);
    expect(result.current.branches).toHaveLength(1);
    expect(result.current.branches[0].title).toBe('酒馆夜话');
  });

  it('createBranch 发送 branch 消息并置 branching', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    await act(async () => { result.current.createBranch('backstory'); });
    expect(ws.sent).toEqual([JSON.stringify({ type: 'branch', branchType: 'backstory' })]);
    expect(result.current.branching).toBe(true);
  });

  it('autoAdvance 发送 auto_advance 指令并置流式状态', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    await act(async () => { result.current.autoAdvance(3); });
    expect(ws.sent).toEqual([JSON.stringify({ type: 'auto_advance', turns: 3 })]);
    expect(result.current.streaming).toBe(true);
  });

  it('suggestions 事件更新推荐卡片，过滤无效项且最多 2 条', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    await act(async () => {
      ws.emit('suggestions', {
        items: [
          { label: '推进剧情', content: '让主角去查线索' },
          { label: '场景描写', content: '描写黄昏酒馆' },
          { label: '空建议', content: '' },
        ],
      });
    });
    expect(result.current.suggestions).toHaveLength(2);
    expect(result.current.suggestions[0].label).toBe('推进剧情');
  });

  it('send 会清空旧推荐建议', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    await act(async () => {
      ws.emit('suggestions', { items: [{ label: 'a', content: 'b' }] });
    });
    expect(result.current.suggestions).toHaveLength(1);
    await act(async () => { result.current.send('自定义发言', 'director'); });
    expect(result.current.suggestions).toEqual([]);
  });

  it('本地流式消息使用负数 id，不与后端落库消息的正数主键冲突', async () => {
    // 进入已有历史消息的房间（DB id 从 1 开始）
    const withHistory: SimRoomDetail = {
      ...room,
      messages: [
        { id: 1, senderType: 'system', senderLabel: '导演', content: '开场白', messageType: 'narration' },
        { id: 2, senderType: 'user', senderLabel: '林星辰', content: '你们在聊什么？', messageType: 'dialogue' },
      ],
    };
    const { result } = renderHook(() => useSimRoomSocket(withHistory));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    await act(async () => {
      ws.emit('stream_start');
      ws.emit('stream_token', { token: '夜色', senderLabel: '场景' });
      ws.emit('stream_token', { token: '沉沉', senderLabel: '场景' });
    });
    const msgs = result.current.messages;
    // 历史 2 条 + 新流式 1 条，且 id 互不重复（新消息 id 为负数）
    expect(msgs).toHaveLength(3);
    const ids = msgs.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const streamed = msgs.find((m) => m.senderLabel === '场景');
    expect(streamed?.content).toBe('夜色沉沉');
    expect(typeof streamed?.id).toBe('number');
    expect(streamed!.id < 0).toBe(true);
  });

  it('user_msg 回显不再重复追加用户消息', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    await act(async () => { result.current.send('你们在聊什么？', 'director'); });
    await act(async () => {
      ws.emit('user_msg', { senderLabel: 'director', content: '你们在聊什么？' });
    });
    const userMsgs = result.current.messages.filter((m) => m.senderType === 'user');
    expect(userMsgs).toHaveLength(1);
  });

  it('连接断开时复位流式与支线生成状态', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    await act(async () => { result.current.autoAdvance(2); });
    expect(result.current.streaming).toBe(true);
    await act(async () => { ws.emit('branch_created', { branch: { id: 1, title: 'x', content: 'y', branchType: 'plot-thread' } }); });
    await act(async () => { result.current.createBranch('plot-thread'); });
    expect(result.current.branching).toBe(true);
    await act(async () => { ws.close(); });
    expect(result.current.streaming).toBe(false);
    expect(result.current.branching).toBe(false);
    expect(result.current.connected).toBe(false);
  });

  it('end 事件保留后端返回的轮数，不清零', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    await act(async () => {
      ws.emit('end', { summary: '已结束', roundCount: 7 });
    });
    expect(result.current.roundCount).toBe(7);
    expect(result.current.streaming).toBe(false);
  });

  it('CLOSED 状态下发送不再积压到 pendingSends', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    ws.readyState = 3; // WebSocket.CLOSED
    await act(async () => { result.current.send('不会发出的消息', 'director'); });
    expect(ws.sent).toEqual([]);
  });

  it('CONNECTING 状态下消息暂存，onopen 后统一刷出', async () => {
    const { result } = renderHook(() => useSimRoomSocket(room));
    await waitForSocket();
    const ws = MockWebSocket.instances[0];
    ws.readyState = 0; // WebSocket.CONNECTING
    await act(async () => { result.current.send('先发的消息', 'director'); });
    expect(ws.sent).toEqual([]);
    ws.readyState = 1; // WebSocket.OPEN
    await act(async () => { ws.onopen?.(null); });
    expect(ws.sent).toEqual([JSON.stringify({ type: 'chat', content: '先发的消息', speakAs: 'director' })]);
  });
});
