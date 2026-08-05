'use client';

import { useEffect, useState, useRef } from 'react';
import { Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import { authFetch } from '@/shared/lib/authFetch';
import { useAuthStore } from '@/shared/stores/authStore';
import * as booksApi from '@/shared/api/books';

interface Room {
  id: number; bookId: number; name: string; description?: string;
  status: string; locationId?: number; participantCount: number; createdAt: string;
}
interface RoomDetail {
  id: number; bookId: number; name: string; setting?: string;
  participants: Array<{ id: number; entityType: string; entityId: number; roleLabel: string; personalityOverride?: string }>;
  messages: Array<{ id: number; senderType: string; senderLabel: string; content: string; messageType: string }>;
  relatedEventIds: number[]; relatedForeshadowingIds: number[];
}

interface Book { id: number; title: string; }

export default function SimRoomsPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<RoomDetail | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [input, setInput] = useState('');
  const [speakAs, setSpeakAs] = useState('director');
  const [streaming, setStreaming] = useState(false);
  const [roundCount, setRoundCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomSetting, setNewRoomSetting] = useState('');

  useEffect(() => { booksApi.fetchBooks().then(setBooks).catch(() => {}); }, []);

  useEffect(() => {
    if (!selectedBookId) return;
    authFetch(`/api/sim-rooms/?bookId=${selectedBookId}`)
      .then((r) => r.json()).then((d) => setRooms(d.items || d.rooms || [])).catch(() => {});
  }, [selectedBookId]);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!activeRoom && wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setWsConnected(false);
      setStreaming(false);
      setRoundCount(0);
    }
  }, [activeRoom]);

  const enterRoom = async (roomId: number) => {
    if (wsRef.current) wsRef.current.close();
    const res = await authFetch(`/api/sim-rooms/${roomId}`);
    const data = await res.json();
    const detail: RoomDetail = data.room;
    setActiveRoom(detail);

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = useAuthStore.getState().accessToken;
    const wsUrl = `${proto}//${location.host}/api/sim-rooms/${roomId}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => setWsConnected(true);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'stream_token') {
        setActiveRoom((prev) => {
          if (!prev) return prev;
          const msgs = [...prev.messages];
          const last = msgs[msgs.length - 1];
          if (last && last.senderType === 'system' && last.content === '') {
            msgs[msgs.length - 1] = { ...last, content: last.content + msg.token };
          } else {
            msgs.push({ id: Date.now(), senderType: 'system', senderLabel: 'AI', content: msg.token, messageType: 'narration' });
          }
          return { ...prev, messages: msgs };
        });
      } else if (msg.type === 'user_msg') {
        setActiveRoom((prev) => {
          if (!prev) return prev;
          return { ...prev, messages: [...prev.messages, { id: Date.now(), senderType: 'user', senderLabel: msg.senderLabel, content: msg.content, messageType: 'dialogue' }] };
        });
      } else if (msg.type === 'turn_done') {
        setStreaming(false);
        setRoundCount(msg.roundCount || 0);
      } else if (msg.type === 'auto_end') {
        setStreaming(false);
        toast.info(`对话自动结束：${msg.reason || ''}（共${msg.roundCount || 0}轮）`);
      } else if (msg.type === 'end') {
        setStreaming(false);
        setRoundCount(0);
        toast.info(msg.summary || '对话已结束');
      }
    };
    ws.onclose = () => setWsConnected(false);
    wsRef.current = ws;
  };

  const handleSend = () => {
    if (!input.trim() || !wsRef.current || streaming) return;
    const ws = wsRef.current;
    setActiveRoom((prev) => {
      if (!prev) return prev;
      const label = speakAs === 'director' ? '用户' : speakAs;
      return { ...prev, messages: [...prev.messages, { id: Date.now(), senderType: 'user', senderLabel: label, content: input, messageType: 'dialogue' }] };
    });
    ws.send(JSON.stringify({ type: 'chat', content: input, speakAs }));
    setInput('');
    setStreaming(true);
  };

  const createRoom = async () => {
    if (!selectedBookId || !newRoomName.trim()) return;
    try {
      const res = await authFetch('/api/sim-rooms/', {
        method: 'POST',
        body: JSON.stringify({ bookId: selectedBookId, name: newRoomName, setting: newRoomSetting, participantIds: [], participantTypes: [] }),
      });
      const data = await res.json();
      setRooms((prev) => [...prev, { id: data.id, bookId: selectedBookId!, name: newRoomName, status: 'active', participantCount: 1, createdAt: new Date().toISOString() }]);
      setShowNewRoom(false); setNewRoomName(''); setNewRoomSetting('');
      toast.success('房间已创建');
    } catch { toast.error('创建失败'); }
  };

  const selectedBook = books.find((b) => b.id === selectedBookId);

  return (
    <div className="flex h-full">
      <div className="w-[280px] shrink-0 border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <select value={selectedBookId ?? ''} onChange={(e) => setSelectedBookId(parseInt(e.target.value, 10) || null)}
            className="w-full h-8 px-2 rounded-md text-xs bg-background border border-border focus:outline-none">
            <option value="">选择书籍...</option>
            {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">房间列表</span>
            <button onClick={() => setShowNewRoom(true)} disabled={!selectedBookId}
              className="p-1 rounded hover:bg-muted text-muted-foreground bg-transparent border-none cursor-pointer"><Plus size={14} /></button>
          </div>

          {showNewRoom && (
            <div className="px-3 pb-2 space-y-1.5">
              <input value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="房间名称" className="w-full h-7 px-2 rounded text-xs border border-border bg-background focus:outline-none" />
              <input value={newRoomSetting} onChange={(e) => setNewRoomSetting(e.target.value)} placeholder="场景设定（可选）" className="w-full h-7 px-2 rounded text-xs border border-border bg-background focus:outline-none" />
              <div className="flex gap-1">
                <button onClick={createRoom} className="flex-1 h-7 rounded bg-foreground text-background text-xs font-medium border-none cursor-pointer">创建</button>
                <button onClick={() => setShowNewRoom(false)} className="px-3 h-7 rounded border border-border text-xs bg-transparent cursor-pointer">取消</button>
              </div>
            </div>
          )}

          {rooms.map((r) => (
            <button key={r.id} onClick={() => enterRoom(r.id)}
              className={cn('w-full text-left px-3 py-2 hover:bg-[var(--sidebar-hover)] bg-transparent border-none cursor-pointer text-[13px]', activeRoom?.id === r.id && 'bg-[var(--sidebar-hover)]')}>
              <div className="font-medium truncate">{r.name}</div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                <Users size={9} />{r.participantCount}人 · {r.status === 'active' ? '活跃' : '已归档'}
              </div>
            </button>
          ))}
          {selectedBookId && rooms.length === 0 && !showNewRoom && (
            <div className="text-xs text-muted-foreground text-center py-8">暂无房间，点击 + 创建</div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {activeRoom ? (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
              <div>
                <span className="text-sm font-medium">{activeRoom.name}</span>
                {activeRoom.setting && <span className="text-[11px] text-muted-foreground ml-2">场景：{activeRoom.setting}</span>}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className={cn('w-1.5 h-1.5 rounded-full', wsConnected ? 'bg-green-500' : 'bg-red-400')} />
                {wsConnected ? '已连接' : '未连接'}
                <span className="ml-1 tabular-nums">{roundCount} 轮</span>
              </div>
              <button
                onClick={() => { if (wsRef.current) { wsRef.current.send(JSON.stringify({ type: 'end', generateSummary: true })); } }}
                className="h-6 px-2 rounded text-[10px] border border-border bg-transparent cursor-pointer hover:bg-destructive/10 text-muted-foreground ml-2">
                结束对话
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {activeRoom.messages.map((m) => (
                <div key={m.id} className={cn('text-[13px] leading-relaxed', m.senderType === 'system' ? 'text-left' : 'text-right')}>
                  <div className="text-[10px] text-muted-foreground mb-0.5">{m.senderLabel}</div>
                  <div className={cn('inline-block max-w-[80%] p-2.5 rounded-xl whitespace-pre-wrap', m.senderType === 'system' ? 'border border-border bg-background' : 'bg-muted')}>
                    {m.content || (m.senderType === 'system' && m.content === '' && <span className="animate-pulse">...</span>)}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 border-t border-border flex items-center gap-2">
              <select value={speakAs} onChange={(e) => setSpeakAs(e.target.value)}
                className="h-8 px-2 rounded-md text-xs bg-background border border-border focus:outline-none w-24 shrink-0">
                <option value="director">导演模式</option>
                {activeRoom.participants.filter((p) => p.entityType !== 'user').map((p) => (
                  <option key={p.id} value={`character:${p.entityId}`}>{p.roleLabel}</option>
                ))}
              </select>
              <input value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={speakAs === 'director' ? '以导演身份引导剧情...' : '以角色口吻发言...'}
                className="flex-1 h-8 px-2 rounded-md text-xs bg-background border border-border focus:outline-none"
                disabled={streaming}
              />
            </div>
          </>
        ) : (
          selectedBook ? (
            <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
              选择或创建一个房间开始角色模拟
            </div>
          ) : (
            <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
              选择一本书开始
            </div>
          )
        )}
      </div>
    </div>
  );
}
