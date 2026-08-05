// 角色模拟房间的 WebSocket 连接 hook，复用后端 /api/sim-rooms/{id}/ws 的流式协议。
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/shared/stores/authStore';
import type { SimRoomDetail, SimRoomMessage, SimRoomParticipant } from './simRooms';

export interface UseSimRoomResult {
  messages: SimRoomMessage[];
  participants: SimRoomParticipant[];
  connected: boolean;
  streaming: boolean;
  roundCount: number;
  // 发送一条发言；speakAs 为 'director' 或以 'character:<id>' 形式指定角色。
  send: (content: string, speakAs: string) => void;
  // 请求结束对话并生成摘要。
  end: (generateSummary?: boolean) => void;
}

// 管理指定房间的 WebSocket 连接，处理流式 token、用户消息与轮次状态。
export function useSimRoomSocket(room: SimRoomDetail | null): UseSimRoomResult {
  const [messages, setMessages] = useState<SimRoomMessage[]>([]);
  const [participants, setParticipants] = useState<SimRoomParticipant[]>([]);
  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [roundCount, setRoundCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  const roomId = room?.id ?? null;

  useEffect(() => {
    if (!roomId) {
      wsRef.current?.close();
      wsRef.current = null;
      setMessages([]);
      setParticipants([]);
      setConnected(false);
      setStreaming(false);
      setRoundCount(0);
      return;
    }

    setMessages(room?.messages ?? []);
    setParticipants(room?.participants ?? []);
    setRoundCount(0);
    setStreaming(false);

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = useAuthStore.getState().accessToken;
    const wsUrl = `${proto}//${location.host}/api/sim-rooms/${roomId}/ws${
      token ? `?token=${encodeURIComponent(token)}` : ''
    }`;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => setConnected(true);
    ws.onmessage = (e) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      const type = msg.type;
      if (type === 'stream_token') {
        const tokenText = typeof msg.token === 'string' ? msg.token : '';
        setMessages((prev) => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last && last.senderType === 'system' && last.content === '') {
            msgs[msgs.length - 1] = { ...last, content: last.content + tokenText };
          } else {
            msgs.push({
              id: Date.now(),
              senderType: 'system',
              senderLabel: 'AI',
              content: tokenText,
              messageType: 'narration',
            });
          }
          return msgs;
        });
      } else if (type === 'user_msg') {
        const senderLabel = typeof msg.senderLabel === 'string' ? msg.senderLabel : '用户';
        const content = typeof msg.content === 'string' ? msg.content : '';
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), senderType: 'user', senderLabel, content, messageType: 'dialogue' },
        ]);
      } else if (type === 'turn_done') {
        setStreaming(false);
        setRoundCount(typeof msg.roundCount === 'number' ? msg.roundCount : 0);
      } else if (type === 'auto_end' || type === 'end') {
        setStreaming(false);
        if (type === 'end') setRoundCount(0);
      }
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
    // 仅在房间 id 变化时重建连接；room 对象的其余字段仅用于初始化首帧。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const send = useCallback(
    (content: string, speakAs: string) => {
      if (!wsRef.current) return;
      const label = speakAs === 'director' ? '用户' : speakAs;
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), senderType: 'user', senderLabel: label, content, messageType: 'dialogue' },
      ]);
      wsRef.current.send(JSON.stringify({ type: 'chat', content, speakAs }));
      setStreaming(true);
    },
    [],
  );

  const end = useCallback((generateSummary = true) => {
    wsRef.current?.send(JSON.stringify({ type: 'end', generateSummary }));
  }, []);

  return { messages, participants, connected, streaming, roundCount, send, end };
}
