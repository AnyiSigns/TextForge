// 角色模拟房间的 WebSocket 连接 hook，复用后端 /api/sim-rooms/{id}/ws 的流式协议。
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const wsRef = useRef<WebSocket | null>(null);
  // 当前轮次是否正在流式输出：用于 stream_token 正确累积到「同一条」AI 消息
  const streamingRef = useRef(false);
  // 当前正在流式输出的归属（角色名或"场景"），用于把 token 追加到同一条消息
  const streamingSpeakerRef = useRef<string | null>(null);
  // WebSocket 尚在 CONNECTING 时暂存待发消息，onopen 后统一刷出
  const pendingSendsRef = useRef<string[]>([]);
  // 本地临时消息 id 计数器（避免 Date.now() 同毫秒重复导致 React key 冲突）
  const msgIdRef = useRef(0);
  const nextMsgId = () => { msgIdRef.current += 1; return msgIdRef.current; };

  const roomId = room?.id ?? null;

  useEffect(() => {
    if (!roomId) {
      wsRef.current?.close();
      wsRef.current = null;
      pendingSendsRef.current = [];
      setMessages([]);
      setParticipants([]);
      setBranches([]);
      setSuggestions([]);
      setConnected(false);
      setStreaming(false);
      setBranching(false);
      setRoundCount(0);
      setMyRole('用户');
      return;
    }

    setMessages(room?.messages ?? []);
    setParticipants(room?.participants ?? []);
    setBranches(room?.branches ?? []);
    setSuggestions([]);
    setRoundCount(0);
    streamingRef.current = false;
    streamingSpeakerRef.current = null;
    setStreaming(false);
    setBranching(false);
    setMyRole('用户');
    pendingSendsRef.current = [];

    let cancelled = false;

    const connect = async () => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = useAuthStore.getState().accessToken;
      let wsUrl = `${proto}//${location.host}/api/sim-rooms/${roomId}/ws${
        token ? `?token=${encodeURIComponent(token)}` : ''
      }`;
      // 用户模型配置仅存浏览器 IndexedDB，后端无服务端配置；经 WS query 传入供 LLM 初始化
      try {
        const modelConfig = await getModelConfigData();
        if (!cancelled && modelConfig) {
          const sep = wsUrl.includes('?') ? '&' : '?';
          wsUrl += `${sep}modelConfig=${encodeURIComponent(JSON.stringify(modelConfig))}`;
        }
      } catch {
        // 配置缺失时后端会返回「没有配置提供商」，由用户先在设置页配置模型
      }
      if (cancelled) return;
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        setConnected(true);
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
      } else if (type === 'user_msg') {
        const senderLabel = typeof msg.senderLabel === 'string' ? msg.senderLabel : '用户';
        const content = typeof msg.content === 'string' ? msg.content : '';
        setMessages((prev) => [
          ...prev,
          { id: nextMsgId(), senderType: 'user', senderLabel, content, messageType: 'dialogue' },
        ]);
      } else if (type === 'turn_done') {
        streamingRef.current = false;
        setStreaming(false);
        setRoundCount(typeof msg.roundCount === 'number' ? msg.roundCount : 0);
      } else if (type === 'auto_end' || type === 'end') {
        streamingRef.current = false;
        setStreaming(false);
        if (type === 'end') setRoundCount(0);
      } else if (type === 'error') {
        // 错误必须展示给用户，不能静默
        streamingRef.current = false;
        setStreaming(false);
        setBranching(false);
        const errorText = typeof msg.message === 'string' ? msg.message : '模拟房间出错，请重试';
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
        if (branch) setBranches((prev) => [...prev, branch]);
      } else if (type === 'suggestions') {
        // 更新下一步推荐建议（卡片输入区）
        const items = Array.isArray(msg.items)
          ? (msg.items as SimSuggestion[]).filter((s) => s && s.content).slice(0, 2)
          : [];
        setSuggestions(items);
      }
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    wsRef.current = ws;
    };
    void connect();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
    // 仅在房间 id 变化时重建连接；room 对象的其余字段仅用于初始化首帧。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const send = useCallback(
    (content: string, speakAs?: string) => {
      const ws = wsRef.current;
      if (!ws) return;
      const label = speakAs || myRole || '用户';
      setMessages((prev) => [
        ...prev,
        { id: nextMsgId(), senderType: 'user', senderLabel: label, content, messageType: 'dialogue' },
      ]);
      // 新一轮开始，旧推荐建议失效
      setSuggestions([]);
      const raw = JSON.stringify({ type: 'chat', content, speakAs: label });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(raw);
      } else {
        pendingSendsRef.current.push(raw);
      }
      streamingRef.current = true;
      setStreaming(true);
    },
    [myRole],
  );

  const createBranch = useCallback((branchType: string) => {
    const ws = wsRef.current;
    if (!ws) return;
    setBranching(true);
    const raw = JSON.stringify({ type: 'branch', branchType });
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(raw);
    } else {
      pendingSendsRef.current.push(raw);
    }
  }, []);

  const autoAdvance = useCallback((turns = 2) => {
    const ws = wsRef.current;
    if (!ws) return;
    // 新一轮开始，旧推荐建议失效
    setSuggestions([]);
    const raw = JSON.stringify({ type: 'auto_advance', turns });
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(raw);
    } else {
      pendingSendsRef.current.push(raw);
    }
    streamingRef.current = true;
    setStreaming(true);
  }, []);

  const end = useCallback((generateSummary = true) => {
    const ws = wsRef.current;
    if (!ws) return;
    const raw = JSON.stringify({ type: 'end', generateSummary });
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(raw);
    } else {
      pendingSendsRef.current.push(raw);
    }
  }, []);

  return { messages, participants, branches, suggestions, connected, streaming, branching, roundCount, myRole, send, autoAdvance, end, createBranch };
}
