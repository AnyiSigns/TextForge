'use client';

import { useEffect, useState, useRef } from 'react';
import { Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import * as booksApi from '@/shared/api/books';
import {
  listSimRooms,
  getSimRoom,
  createSimRoom,
  type SimRoomDetail,
  type SimRoomSummary,
} from '@/shared/api/simRooms';
import { useSimRoomSocket } from '@/shared/api/useSimRoom';

interface Book { id: number; title: string; }

export default function SimRoomsPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [rooms, setRooms] = useState<SimRoomSummary[]>([]);
  const [activeRoom, setActiveRoom] = useState<SimRoomDetail | null>(null);
  const [input, setInput] = useState('');
  const [speakAs, setSpeakAs] = useState('director');
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomSetting, setNewRoomSetting] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 统一走共享 hook 处理 WS 协议（消息流式/轮数/连接状态），本页仅做 toast 提示
  const { messages, participants, connected, streaming, roundCount, send, end, lastEvent } =
    useSimRoomSocket(activeRoom);

  useEffect(() => { booksApi.fetchBooks().then(setBooks).catch(() => {}); }, []);

  useEffect(() => {
    if (!selectedBookId) return;
    listSimRooms(selectedBookId).then(setRooms).catch(() => {});
  }, [selectedBookId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'auto_end') {
      toast.info(`对话自动结束：${lastEvent.reason || ''}（共${lastEvent.roundCount || 0}轮）`);
    } else if (lastEvent.type === 'end') {
      toast.info(lastEvent.summary || '对话已结束');
    } else if (lastEvent.type === 'branch_created') {
      toast.success(`支线已沉淀：${lastEvent.branchTitle || ''}`);
    } else if (lastEvent.type === 'error') {
      toast.error(lastEvent.error || '生成失败');
    }
  }, [lastEvent]);

  const enterRoom = async (roomId: number) => {
    const detail = await getSimRoom(roomId);
    if (detail) {
      setActiveRoom(detail);
    } else {
      toast.error('进入房间失败');
    }
  };

  const handleSend = () => {
    if (!input.trim() || streaming) return;
    send(input, speakAs);
    setInput('');
  };

  const createRoom = async () => {
    if (!selectedBookId || !newRoomName.trim()) return;
    const created = await createSimRoom({
      bookId: selectedBookId,
      name: newRoomName.trim(),
      description: newRoomSetting.trim() || undefined,
    });
    if (created) {
      setRooms((prev) => [
        ...prev,
        {
          id: created.id,
          bookId: selectedBookId,
          name: created.name,
          description: newRoomSetting.trim() || undefined,
          status: 'active',
          participantCount: 1,
          roundCount: 0,
          createdAt: new Date().toISOString(),
        },
      ]);
      setShowNewRoom(false);
      setNewRoomName('');
      setNewRoomSetting('');
      toast.success('房间已创建');
    } else {
      toast.error('创建失败');
    }
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
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className={cn('w-1.5 h-1.5 rounded-full', connected ? 'bg-green-500' : 'bg-red-400')} />
                {connected ? '已连接' : '未连接'}
                <span className="ml-1 tabular-nums">{roundCount} 轮</span>
              </div>
              <button
                onClick={() => end(true)}
                className="h-6 px-2 rounded text-[10px] border border-border bg-transparent cursor-pointer hover:bg-destructive/10 text-muted-foreground ml-2">
                结束对话
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => (
                <div key={m.id} className={cn('text-[13px] leading-relaxed', m.senderType === 'system' ? 'text-left' : 'text-right')}>
                  <div className="text-[10px] text-muted-foreground mb-0.5">{m.senderLabel === 'director' ? '用户' : m.senderLabel}</div>
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
                {participants.filter((p) => p.entityType !== 'user').map((p) => (
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
