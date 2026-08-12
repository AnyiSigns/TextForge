// 角色模拟房间的 WebSocket 连接 hook，复用后端 /api/sim-rooms/{id}/ws 的流式协议。
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/shared/stores/authStore';
import { getModelConfigData } from '@/shared/api/agent';
import type { SimBranch, SimRoomDetail, SimRoomMessage, SimRoomParticipant } from './simRooms';

export interface SimSuggestion {
  label: string;
  content: string;
}

export interface UseSimRoomResult {
  messages: SimRoomMessage[];
  participants: SimRoomParticipant[];
  branches: SimBranch[];
  // 每轮结束后由后端生成的下一步推荐建议（卡片点选）
  suggestions: SimSuggestion[];
  connected: boolean;
  streaming: boolean;
  // 支线生成中（防止重复点击）
  branching: boolean;
  roundCount: number;
  // 用户扮演的「我的身份」角色名（connected 事件返回），未指定时为 "用户"。
  myRole: string;
  // 发送一条发言；speakAs 缺省时用 myRole（用户扮演的角色名）。
  send: (content: string, speakAs?: string) => void;
  // AI 自动推进：以导演身份连续驱动 N 轮对话（角色支线工作台核心）。
  autoAdvance: (turns?: number) => void;
  // 请求结束对话并生成摘要。
  end: (generateSummary?: boolean) => void;
  // 把当前对话沉淀为一条支线（branchType: backstory/relationship/plot-thread/foreshadow-fill/voice-test）。
  createBranch: (branchType: string) => void;
  // 最近一次协议级事件（auto_end/end/branch_created/error），供调用方展示 toast 等提示。
  lastEvent: SimRoomEvent | null;
}

// 协议级事件通知（不承载消息正文，仅用于 toast/提示）。
export interface SimRoomEvent {
  type: 'auto_end' | 'end' | 'branch_created' | 'error';
  reason?: string;
  summary?: string;
  roundCount?: number;
  branchTitle?: string;
  error?: string;
}

// 归一发言身份：后端约定为 "director" 或 "character:<id>"。
// 缺省 / "director" 归一为 "director"；形如 "character:<id>" 原样透传。
function normalizeSpeakAs(speakAs: string | undefined): string {
  if (!speakAs || speakAs === 'director') return 'director';
  return speakAs;
}

// 管理指定房间的 WebSocket 连接，处理流式 token、用户消息与轮次状态。
export function useSimRoomSocket(room: SimRoomDetail | null): UseSimRoomResult {
  const [messages, setMessages] = useState<SimRoomMessage[]>([]);
  const [participants, setParticipants] = useState<SimRoomParticipant[]>([]);
  const [branches, setBranches] = useState<SimBranch[]>([]);
  const [suggestions, setSuggestions] = useState<SimSuggestion[]>([]);
  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [branching, setBranching] = useState(false);
  const [roundCount, setRoundCount] = useState(0);
  const [myRole, setMyRole] = useState('用户');
  const [lastEvent, setLastEvent] = useState<SimRoomEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // 当前轮次是否正在流式输出：用于 stream_token 正确累积到「同一条」AI 消息
  const streamingRef = useRef(false);
  // 当前正在流式输出的归属（角色名或"场景"），用于把 token 追加到同一条消息
  const streamingSpeakerRef = useRef<string | null>(null);
  // WebSocket 尚在 CONNECTING 时暂存待发消息，onopen 后统一刷出
  const pendingSendsRef = useRef<string[]>([]);
  // 本地临时消息 id 计数器：使用负数递减，避免与后端落库消息的正数自增主键
  // 冲突（二者混排时若 key 相同，React 会复用好消息节点导致内容错乱/重复）。
  const msgIdRef = useRef(0);
  const nextMsgId = () => { msgIdRef.current -= 1; return msgIdRef.current; };

  const roomId = room?.id ?? null;

  // 房间切换时重置状态（渲染期间调整，React 会立即重渲染；effect 只负责 WS 连接）。
  // prevRoomId 初始为哨兵 null，确保首次挂载也执行一次同步（历史消息/初始空状态）。
  const [prevRoomId, setPrevRoomId] = useState<number | null>(null);
  if (roomId !== prevRoomId) {
    setPrevRoomId(roomId);
    if (!roomId) {
      setMessages([]);
      setParticipants([]);
      setBranches([]);
      setSuggestions([]);
      setConnected(false);
      setStreaming(false);
      setBranching(false);
      setRoundCount(0);
      setMyRole('用户');
    } else {
      setMessages(room?.messages ?? []);
      setParticipants(room?.participants ?? []);
      setBranches(room?.branches ?? []);
      setSuggestions([]);
      setConnected(false);
        setRoundCount(room?.roundCount ?? 0);
        setStreaming(false);
        setBranching(false);
        setMyRole('用户');
    }
  }

  useEffect(() => {
    if (!roomId) {
      wsRef.current?.close();
      wsRef.current = null;
      pendingSendsRef.current = [];
      return;
    }

    pendingSendsRef.current = [];
    streamingRef.current = false;
    streamingSpeakerRef.current = null;

    let cancelled = false;
    // 指数退避重连：1s/2s/4s/8s… 上限 10s；仅在房间仍存在、组件未卸载时尝试
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;

    const scheduleReconnect = () => {
      if (cancelled || !roomId || reconnectTimer) return;
      const delay = reconnectDelay;
      reconnectDelay = Math.min(reconnectDelay * 2, 10000);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (cancelled || !roomId) return;
        void connect();
      }, delay);
    };

    const connect = async () => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = useAuthStore.getState().accessToken;
      // token 走 Sec-WebSocket-Protocol（subprotocol）传递：浏览器 WebSocket 无法
      // 自定义请求头，放 query 会让 JWT 进入访问日志/浏览器历史，存在泄露风险。
      const wsUrl = `${proto}//${location.host}/api/sim-rooms/${roomId}/ws`;
      // 用户模型配置仅存浏览器 IndexedDB，后端无服务端配置；
      // 含 api_key 的配置经连接后首帧消息传递（放 query 会进入访问日志/浏览器历史）。
      let modelConfig: unknown = null;
      try {
        modelConfig = await getModelConfigData();
      } catch {
        // 配置缺失时后端会返回「没有配置提供商」，由用户先在设置页配置模型
      }
      if (cancelled) return;
      const ws = new WebSocket(wsUrl, token ? [token] : []);
      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        // 连接成功：重置退避，后续若再次断开从 1s 起算
        reconnectDelay = 1000;
        if (modelConfig) {
          ws.send(JSON.stringify({ type: 'config', modelConfig }));
        }
        const pending = pendingSendsRef.current;
        pendingSendsRef.current = [];
        for (const raw of pending) ws.send(raw);
      };
    ws.onmessage = (e) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      const type = msg.type;
      if (type === 'connected') {
        // 后端返回用户扮演的「我的身份」角色名
        if (typeof msg.userRoleLabel === 'string' && msg.userRoleLabel) {
          setMyRole(msg.userRoleLabel);
        }
      } else if (type === 'stream_start') {
        // 后端开始流式：标记流式中，重置当前流式归属
        streamingRef.current = true;
        streamingSpeakerRef.current = null;
        setStreaming(true);
      } else if (type === 'stream_token') {
        const tokenText = typeof msg.token === 'string' ? msg.token : '';
        const speaker = typeof msg.senderLabel === 'string' && msg.senderLabel ? msg.senderLabel : 'AI';
        setMessages((prev) => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          // 同一归属（场景或同一角色）持续追加到同一条消息，归属变化时新开一条
          if (
            last &&
            last.senderType === 'system' &&
            streamingSpeakerRef.current === speaker &&
            streamingRef.current
          ) {
            msgs[msgs.length - 1] = { ...last, content: last.content + tokenText };
          } else {
            streamingSpeakerRef.current = speaker;
            const isScene = speaker === '场景';
            msgs.push({
              id: nextMsgId(),
              senderType: 'system',
              senderLabel: speaker,
              content: tokenText,
              messageType: isScene ? 'scene' : 'dialogue',
            });
          }
          return msgs;
        });
      } else if (type === 'turn_done') {
        streamingRef.current = false;
        setStreaming(false);
        setRoundCount(typeof msg.roundCount === 'number' ? msg.roundCount : 0);
      } else if (type === 'auto_end' || type === 'end') {
        streamingRef.current = false;
        setStreaming(false);
        // end/auto_end 事件均携带真实轮数，保留展示（不归零）
        if (typeof msg.roundCount === 'number') {
          setRoundCount(msg.roundCount);
        }
        setLastEvent({
          type,
          reason: typeof msg.reason === 'string' ? msg.reason : undefined,
          summary: typeof msg.summary === 'string' ? msg.summary : undefined,
          roundCount: typeof msg.roundCount === 'number' ? msg.roundCount : undefined,
        });
      } else if (type === 'error') {
        // 错误必须展示给用户，不能静默
        streamingRef.current = false;
        setStreaming(false);
        setBranching(false);
        const errorText = typeof msg.message === 'string' ? msg.message : '模拟房间出错，请重试';
        setLastEvent({ type, error: errorText });
        setMessages((prev) => [
          ...prev,
          {
            id: nextMsgId(),
            senderType: 'system',
            senderLabel: 'AI',
            content: `⚠️ ${errorText}`,
            messageType: 'error' as SimRoomMessage['messageType'],
          },
        ]);
      } else if (type === 'branch_created') {
        // 支线生成成功：追加到支线列表并复位生成中状态
        setBranching(false);
        const branch = msg.branch as SimBranch;
        if (branch) {
          setBranches((prev) => [...prev, branch]);
          setLastEvent({ type, branchTitle: branch.title });
        }
      } else if (type === 'suggestions') {
        // 更新下一步推荐建议（卡片输入区）
        const items = Array.isArray(msg.items)
          ? (msg.items as SimSuggestion[]).filter((s) => s && s.content).slice(0, 2)
          : [];
        setSuggestions(items);
      }
    };
    ws.onclose = () => {
      if (cancelled) return;
      setConnected(false);
      // 连接中断时复位流式/生成状态，避免 UI 永久卡在"生成中…"或禁用态
      streamingRef.current = false;
      streamingSpeakerRef.current = null;
      setStreaming(false);
      setBranching(false);
      // 断线后自动重连（指数退避）
      scheduleReconnect();
    };
    ws.onerror = () => {
      if (cancelled) return;
      setConnected(false);
      streamingRef.current = false;
      streamingSpeakerRef.current = null;
      setStreaming(false);
      setBranching(false);
      // onerror 必随后触发 onclose，重连统一在 onclose 中调度，避免重复
    };
    wsRef.current = ws;
    };
    void connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [roomId]);

  // 统一发送入口：OPEN(1) 直发，CONNECTING(0) 暂存待 onopen 刷出，CLOSING(2)/CLOSED(3) 返回 false。
  // 返回 true 表示已发送或已暂存；false 表示连接不可用（调用方据此回滚乐观消息）。
  const sendRaw = useCallback((raw: string): boolean => {
    const ws = wsRef.current;
    if (!ws) return false;
    if (ws.readyState === 1) {
      ws.send(raw);
      return true;
    } else if (ws.readyState === 0) {
      pendingSendsRef.current.push(raw);
      return true;
    }
    return false;
  }, []);

  const send = useCallback(
    (content: string, speakAs?: string) => {
      const ws = wsRef.current;
      if (!ws) return;
      const wire = normalizeSpeakAs(speakAs);
      // 本地回显标签：导演/角色发言统一用「我的身份」名，避免把 "character:<id>" 透到 UI
      const label =
        !speakAs || speakAs === 'director' || speakAs.startsWith('character:')
          ? myRole || '用户'
          : speakAs;
      const localId = nextMsgId();
      setMessages((prev) => [
        ...prev,
        { id: localId, senderType: 'user', senderLabel: label, content, messageType: 'dialogue' },
      ]);
      // 新一轮开始，旧推荐建议失效
      setSuggestions([]);
      const ok = sendRaw(JSON.stringify({ type: 'chat', content, speakAs: wire }));
      if (!ok) {
        // 连接已断开：回滚刚插入的乐观消息并提示，避免 UI 卡在"生成中"且无反馈
        setMessages((prev) => prev.filter((m) => m.id !== localId));
        setStreaming(false);
        toast.error('连接已断开，消息未发送');
        return;
      }
      streamingRef.current = true;
      setStreaming(true);
    },
    [myRole, sendRaw],
  );

  const createBranch = useCallback((branchType: string) => {
    const ws = wsRef.current;
    if (!ws) return;
    setBranching(true);
    sendRaw(JSON.stringify({ type: 'branch', branchType }));
  }, [sendRaw]);

  const autoAdvance = useCallback((turns = 2) => {
    const ws = wsRef.current;
    if (!ws) return;
    // 新一轮开始，旧推荐建议失效
    setSuggestions([]);
    sendRaw(JSON.stringify({ type: 'auto_advance', turns }));
    streamingRef.current = true;
    setStreaming(true);
  }, [sendRaw]);

  const end = useCallback((generateSummary = true) => {
    const ws = wsRef.current;
    if (!ws) return;
    sendRaw(JSON.stringify({ type: 'end', generateSummary }));
  }, [sendRaw]);

  return { messages, participants, branches, suggestions, connected, streaming, branching, roundCount, myRole, send, autoAdvance, end, createBranch, lastEvent };
}
