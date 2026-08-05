'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Send, Users, Plus, MessageCircle, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { toast } from 'sonner';
import {
  listSimRooms,
  createSimRoom,
  getSimRoom,
  type SimRoomDetail,
  type SimRoomSummary,
  type CreateSimRoomPayload,
} from '@/shared/api/simRooms';
import { useSimRoomSocket } from '@/shared/api/useSimRoom';
import { fetchCharacters } from '@/shared/api/characters';
import type { Character } from '@/shared/api/types';

interface SimRoomProps {
  bookId: number;
  bookTitle?: string;
  onClose: () => void;
}

// 从书名/角色名取首字作为头像占位文本。
function initials(name: string): string {
  return name.trim().slice(0, 2) || '?';
}

export function SimRoom({ bookId, bookTitle, onClose }: SimRoomProps) {
  const [rooms, setRooms] = useState<SimRoomSummary[]>([]);
  const [activeRoom, setActiveRoom] = useState<SimRoomDetail | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(true);

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSetting, setNewSetting] = useState('');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selParticipants, setSelParticipants] = useState<number[]>([]);

  const [input, setInput] = useState('');
  const [speakAs, setSpeakAs] = useState('director');

  const { messages, participants, connected, streaming, roundCount, send, end } =
    useSimRoomSocket(activeRoom);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoadingRooms(true);
    listSimRooms(bookId)
      .then((rs) => {
        if (!alive) return;
        setRooms(rs);
        setLoadingRooms(false);
      })
      .catch(() => alive && setLoadingRooms(false));
    fetchCharacters(bookId).then(setCharacters).catch(() => {});
    return () => {
      alive = false;
    };
  }, [bookId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const avatarByCharacter = useMemo(() => {
    const map = new Map<string, string | null>();
    characters.forEach((c) => map.set(c.name, c.avatarUrl));
    return map;
  }, [characters]);

  const characterOptions = participants.filter((p) => p.entityType !== 'user');

  const enterRoom = async (roomId: number) => {
    const detail = await getSimRoom(roomId);
    if (detail) {
      setActiveRoom(detail);
      setSpeakAs('director');
    } else {
      toast.error('进入房间失败');
    }
  };

  const toggleParticipant = (id: number) => {
    setSelParticipants((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const payload: CreateSimRoomPayload = {
      bookId,
      name: newName.trim(),
      setting: newSetting.trim() || null,
      participantIds: selParticipants,
      participantTypes: selParticipants.map(() => 'character'),
    };
    const created = await createSimRoom(payload);
    if (created) {
      setRooms((prev) => [
        ...prev,
        {
          id: created.id,
          bookId,
          name: created.name,
          status: 'active',
          participantCount: selParticipants.length + 1,
          roundCount: 0,
          createdAt: new Date().toISOString(),
        },
      ]);
      setShowNew(false);
      setNewName('');
      setNewSetting('');
      setSelParticipants([]);
      await enterRoom(created.id);
    } else {
      toast.error('创建失败');
    }
  };

  const handleSend = () => {
    if (!input.trim() || streaming) return;
    send(input.trim(), speakAs);
    setInput('');
  };

  const handleEnd = () => {
    end(true);
    toast.info('对话已结束，正在生成摘要');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-foreground/[0.04] backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative w-[880px] max-w-[94vw] h-[74vh] max-h-[760px] bg-card/98 backdrop-blur-md border border-border/50 rounded-2xl shadow-2xl flex overflow-hidden"
        style={{ animation: 'modal-in 0.25s ease-out' }}
      >
        {/* 左侧：房间列表 */}
        <div className="w-[264px] shrink-0 border-r border-border/40 flex flex-col">
          <div className="flex items-center justify-between px-3 h-12 border-b border-border/40 flex-shrink-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              模拟房间
            </span>
            <button
              onClick={() => setShowNew((v) => !v)}
              disabled={!!activeRoom}
              className="p-1 rounded bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-30"
              title="新建房间"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {showNew && (
              <div className="px-1 pb-2 space-y-1.5">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="房间名称"
                  className="w-full h-7 px-2 rounded text-xs border border-border bg-background focus:outline-none focus:border-foreground/20"
                />
                <input
                  value={newSetting}
                  onChange={(e) => setNewSetting(e.target.value)}
                  placeholder="场景设定（可选）"
                  className="w-full h-7 px-2 rounded text-xs border border-border bg-background focus:outline-none focus:border-foreground/20"
                />
                {characters.length > 0 && (
                  <div className="max-h-28 overflow-y-auto border border-border/60 rounded p-1.5 space-y-1">
                    {characters.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-1.5 text-[11px] text-foreground/70 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selParticipants.includes(c.id)}
                          onChange={() => toggleParticipant(c.id)}
                          className="accent-foreground"
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                )}
                <div className="flex gap-1">
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim()}
                    className="flex-1 h-7 rounded bg-foreground text-background text-xs font-medium border-none cursor-pointer disabled:opacity-30"
                  >
                    创建
                  </button>
                  <button
                    onClick={() => setShowNew(false)}
                    className="px-3 h-7 rounded border border-border text-xs bg-transparent cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {loadingRooms ? (
              <div className="text-xs text-muted-foreground text-center py-8">
                加载中…
              </div>
            ) : rooms.length === 0 && !showNew ? (
              <div className="text-xs text-muted-foreground text-center py-8">
                暂无房间，点击 + 创建
              </div>
            ) : (
              rooms.map((r) => (
                <button
                  key={r.id}
                  onClick={() => enterRoom(r.id)}
                  className={cn(
                    'w-full text-left px-2.5 py-2 rounded-lg bg-transparent border border-transparent cursor-pointer hover:bg-foreground/[0.04]',
                    activeRoom?.id === r.id && 'bg-foreground/[0.05] border-border/40',
                  )}
                >
                  <div className="text-[13px] font-medium text-foreground/80 truncate">
                    {r.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Users size={9} />
                    {r.participantCount}人
                    <span className="opacity-50">·</span>
                    {r.roundCount}轮
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 右侧：对话区 */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeRoom ? (
            <>
              <div className="flex items-center justify-between px-4 h-12 border-b border-border/40 flex-shrink-0">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-foreground/85 truncate">
                    {activeRoom.name}
                  </span>
                  {activeRoom.setting && (
                    <span className="text-[11px] text-muted-foreground ml-2 truncate">
                      {activeRoom.setting}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-shrink-0">
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      connected ? 'bg-foreground/70' : 'bg-muted-foreground/40',
                    )}
                  />
                  {connected ? '已连接' : '未连接'}
                  <span className="ml-1 tabular-nums">{roundCount} 轮</span>
                  <button
                    onClick={handleEnd}
                    className="h-6 px-2 rounded text-[10px] border border-border bg-transparent cursor-pointer hover:bg-foreground/[0.04] text-muted-foreground ml-2"
                  >
                    结束对话
                  </button>
                  <button
                    onClick={onClose}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 bg-transparent border-none cursor-pointer"
                  >
                    <X size={14} strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.map((m) =>
                  m.senderType === 'system' ? (
                    <div key={m.id} className="flex gap-2">
                      <div className="w-7 h-7 rounded-full bg-muted/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Sparkles size={12} className="text-muted-foreground" />
                      </div>
                      <div className="max-w-[80%]">
                        <span className="text-[10px] font-medium text-foreground/50 block mb-0.5">
                          {m.senderLabel}
                        </span>
                        <div className="px-3 py-2 rounded-2xl rounded-bl-md text-[13px] leading-relaxed bg-muted/40 text-foreground/75 whitespace-pre-line">
                          {m.content || (
                            <span className="inline-flex items-center gap-1 text-muted-foreground/60">
                              <Loader2 size={11} className="animate-spin" />
                              生成中…
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="flex gap-2 justify-end">
                      <div className="max-w-[80%]">
                        <span className="text-[10px] font-medium text-foreground/50 block mb-0.5 text-right">
                          {m.senderLabel}
                        </span>
                        <div className="px-3 py-2 rounded-2xl rounded-br-md text-[13px] leading-relaxed bg-foreground/[0.08] text-foreground/80 whitespace-pre-line">
                          {m.content}
                        </div>
                      </div>
                      <div className="w-7 h-7 rounded-full bg-foreground/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] text-foreground/60">
                        {avatarByCharacter.get(m.senderLabel) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={avatarByCharacter.get(m.senderLabel) ?? ''}
                            alt={m.senderLabel}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          initials(m.senderLabel)
                        )}
                      </div>
                    </div>
                  ),
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="px-4 py-3 border-t border-border/30 flex-shrink-0 flex items-center gap-2">
                <select
                  value={speakAs}
                  onChange={(e) => setSpeakAs(e.target.value)}
                  className="h-8 px-2 rounded-md text-xs bg-background border border-border focus:outline-none w-28 shrink-0"
                >
                  <option value="director">导演模式</option>
                  {characterOptions.map((p) => (
                    <option key={p.id} value={`character:${p.entityId}`}>
                      {p.roleLabel}
                    </option>
                  ))}
                </select>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={
                    speakAs === 'director' ? '以导演身份引导剧情…' : '以角色口吻发言…'
                  }
                  className="flex-1 h-8 px-3 rounded-xl text-xs bg-background border border-border focus:outline-none focus:border-foreground/20"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || streaming}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-30"
                >
                  <Send size={12} />
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <MessageCircle size={28} className="opacity-30" />
              <p className="text-sm">
                {bookTitle ? `《${bookTitle}》的` : ''}角色模拟
              </p>
              <p className="text-[11px] text-muted-foreground/60">
                选择或创建一个房间开始对话
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
