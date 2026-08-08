'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Send, Users, Plus, MessageCircle, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { toast } from 'sonner';
import {
  listSimRooms,
  createSimRoom,
  deleteSimRoom,
  getSimRoom,
  type SimRoomDetail,
  type SimRoomSummary,
  type CreateSimRoomPayload,
} from '@/shared/api/simRooms';
import { useSimRoomSocket } from '@/shared/api/useSimRoom';
import { fetchCharacters } from '@/shared/api/characters';
import { fetchLocations, fetchSceneEvents, fetchForeshadowings, fetchPlotThreads } from '@/shared/api/world';
import type { Character, Location, SceneEvent, Foreshadowing, PlotThread } from '@/shared/api/types';

interface SimRoomProps {
  bookId: number;
  bookTitle?: string;
  onClose: () => void;
}

// 支线类型选项（沉淀为支线时选择）
const BRANCH_TYPES = [
  { value: 'backstory', label: '背景故事' },
  { value: 'relationship', label: '关系线' },
  { value: 'plot-thread', label: '剧情线索' },
  { value: 'foreshadow-fill', label: '伏笔揭示' },
  { value: 'voice-test', label: '语音测试' },
];

// 从书名/角色名取首字作为头像占位文本。
function initials(name: string): string {
  return name.trim().slice(0, 2) || '?';
}

// 多选列表切换工具：列表中有则移除，否则追加。
function toggleIn(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function SimRoom({ bookId, bookTitle, onClose }: SimRoomProps) {
  const [rooms, setRooms] = useState<SimRoomSummary[]>([]);
  const [activeRoom, setActiveRoom] = useState<SimRoomDetail | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(true);

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [characters, setCharacters] = useState<Character[]>([]);
  // 用户扮演的「我的身份」角色（单选）
  const [myCharacterId, setMyCharacterId] = useState<number | null>(null);
  // AI 扮演的角色（多选）
  const [aiCharacterIds, setAiCharacterIds] = useState<number[]>([]);
  // 创建房间的世界数据与选择
  const [locations, setLocations] = useState<Location[]>([]);
  const [events, setEvents] = useState<SceneEvent[]>([]);
  const [foreshadowings, setForeshadowings] = useState<Foreshadowing[]>([]);
  const [plotThreads, setPlotThreads] = useState<PlotThread[]>([]);
  const [selLocation, setSelLocation] = useState<number | null>(null);
  const [selEvents, setSelEvents] = useState<number[]>([]);
  const [selForeshadowings, setSelForeshadowings] = useState<number[]>([]);
  const [selPlotThreads, setSelPlotThreads] = useState<number[]>([]);

  // 卡片式输入区：自定义内容卡片展开状态
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');
  // 沉淀支线：类型选择面板
  const [showBranchPicker, setShowBranchPicker] = useState(false);

  const {
    messages,
    branches,
    suggestions,
    connected,
    streaming,
    branching,
    roundCount,
    myRole,
    send,
    autoAdvance,
    end,
    createBranch,
  } = useSimRoomSocket(activeRoom);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 书籍切换时重新进入加载态（渲染期间调整，React 会立即重渲染）
  const [prevBookId, setPrevBookId] = useState(bookId);
  if (bookId !== prevBookId) {
    setPrevBookId(bookId);
    setLoadingRooms(true);
  }

  useEffect(() => {
    let alive = true;
    listSimRooms(bookId)
      .then((rs) => {
        if (!alive) return;
        setRooms(rs);
        setLoadingRooms(false);
      })
      .catch(() => alive && setLoadingRooms(false));
    fetchCharacters(bookId).then(setCharacters).catch(() => {});
    fetchLocations(bookId).then(setLocations).catch(() => {});
    fetchSceneEvents(bookId).then(setEvents).catch(() => {});
    fetchForeshadowings(bookId).then(setForeshadowings).catch(() => {});
    fetchPlotThreads(bookId).then(setPlotThreads).catch(() => {});
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

  const enterRoom = async (roomId: number) => {
    const detail = await getSimRoom(roomId);
    if (detail) {
      setActiveRoom(detail);
      setCustomOpen(false);
      setCustomInput('');
    } else {
      toast.error('进入房间失败');
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    if (myCharacterId === null) {
      toast.error('请选择你扮演的角色');
      return;
    }
    const payload: CreateSimRoomPayload = {
      bookId,
      name: newName.trim(),
      locationId: selLocation,
      userCharacterId: myCharacterId,
      participantIds: aiCharacterIds,
      participantTypes: aiCharacterIds.map(() => 'character'),
      relatedEventIds: selEvents,
      relatedForeshadowingIds: selForeshadowings,
      relatedPlotThreadIds: selPlotThreads,
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
          participantCount: aiCharacterIds.length + 1,
          roundCount: 0,
          createdAt: new Date().toISOString(),
        },
      ]);
      setShowNew(false);
      setNewName('');
      setMyCharacterId(null);
      setAiCharacterIds([]);
      setSelLocation(null);
      setSelEvents([]);
      setSelForeshadowings([]);
      setSelPlotThreads([]);
      await enterRoom(created.id);
    } else {
      toast.error('创建失败');
    }
  };

  const handleSuggestionClick = (content: string) => {
    if (!content.trim() || streaming) return;
    send(content.trim());
  };

  const handleCustomSend = () => {
    if (!customInput.trim() || streaming) return;
    send(customInput.trim());
    setCustomInput('');
    setCustomOpen(false);
  };

  const handleBranchType = (type: string) => {
    createBranch(type);
    setShowBranchPicker(false);
  };

  const handleEnd = () => {
    end(true);
    toast.info('对话已结束，正在生成摘要');
  };

  const handleDeleteRoom = async (roomId: number, roomName: string) => {
    if (!window.confirm(`确定删除房间「${roomName}」？其对话记录与支线将一并删除。`)) return;
    const ok = await deleteSimRoom(roomId);
    if (!ok) {
      toast.error('删除失败');
      return;
    }
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
    if (activeRoom?.id === roomId) {
      setActiveRoom(null);
    }
    toast.success('房间已删除');
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
              角色支线
            </span>
            <button
              onClick={() => setShowNew((v) => !v)}
              disabled={!!activeRoom}
              className="p-1 rounded bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-30"
              title="新建角色支线"
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
                  placeholder="支线标题（如：林星辰的身世之谜）"
                  className="w-full h-7 px-2 rounded text-xs border border-border bg-background focus:outline-none focus:border-foreground/20"
                />
                <select
                  value={selLocation ?? ''}
                  onChange={(e) => setSelLocation(e.target.value ? Number(e.target.value) : null)}
                  className="w-full h-7 px-2 rounded text-xs border border-border bg-background focus:outline-none"
                >
                  <option value="">选择地点（可选）</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>

                {characters.length > 0 && (
                  <>
                    <div className="max-h-24 overflow-y-auto border border-border/60 rounded p-1.5 space-y-1">
                      <span className="text-[10px] text-muted-foreground block">我的身份（你扮演的角色，单选）</span>
                      {characters.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-1.5 text-[11px] text-foreground/70 cursor-pointer"
                        >
                          <input
                            type="radio"
                            name="my-character"
                            checked={myCharacterId === c.id}
                            onChange={() => setMyCharacterId(c.id)}
                            className="accent-foreground"
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                    <div className="max-h-24 overflow-y-auto border border-border/60 rounded p-1.5 space-y-1">
                      <span className="text-[10px] text-muted-foreground block">AI 扮演的角色（可多选）</span>
                      {characters
                        .filter((c) => c.id !== myCharacterId)
                        .map((c) => (
                          <label
                            key={c.id}
                            className="flex items-center gap-1.5 text-[11px] text-foreground/70 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={aiCharacterIds.includes(c.id)}
                              onChange={() =>
                                setAiCharacterIds((prev) =>
                                  prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                                )
                              }
                              className="accent-foreground"
                            />
                            {c.name}
                          </label>
                        ))}
                    </div>
                  </>
                )}

                {events.length > 0 && (
                  <div className="max-h-24 overflow-y-auto border border-border/60 rounded p-1.5 space-y-1">
                    <span className="text-[10px] text-muted-foreground block">时间线事件</span>
                    {events.map((ev) => (
                      <label
                        key={ev.id}
                        className="flex items-center gap-1.5 text-[11px] text-foreground/70 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selEvents.includes(ev.id)}
                          onChange={() => setSelEvents((p) => toggleIn(p, ev.id))}
                          className="accent-foreground"
                        />
                        <span className="truncate">{ev.title}</span>
                      </label>
                    ))}
                  </div>
                )}

                {foreshadowings.length > 0 && (
                  <div className="max-h-24 overflow-y-auto border border-border/60 rounded p-1.5 space-y-1">
                    <span className="text-[10px] text-muted-foreground block">伏笔</span>
                    {foreshadowings.map((f) => (
                      <label
                        key={f.id}
                        className="flex items-center gap-1.5 text-[11px] text-foreground/70 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selForeshadowings.includes(f.id)}
                          onChange={() => setSelForeshadowings((p) => toggleIn(p, f.id))}
                          className="accent-foreground"
                        />
                        <span className="truncate">{f.description}</span>
                      </label>
                    ))}
                  </div>
                )}

                {plotThreads.length > 0 && (
                  <div className="max-h-24 overflow-y-auto border border-border/60 rounded p-1.5 space-y-1">
                    <span className="text-[10px] text-muted-foreground block">剧情线索</span>
                    {plotThreads.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-1.5 text-[11px] text-foreground/70 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selPlotThreads.includes(t.id)}
                          onChange={() => setSelPlotThreads((p) => toggleIn(p, t.id))}
                          className="accent-foreground"
                        />
                        <span className="truncate">{t.name}</span>
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
                <div
                  key={r.id}
                  className={cn(
                    'group flex items-center rounded-lg bg-transparent border border-transparent hover:bg-foreground/[0.04]',
                    activeRoom?.id === r.id && 'bg-foreground/[0.05] border-border/40',
                  )}
                >
                  <button
                    onClick={() => enterRoom(r.id)}
                    className="flex-1 min-w-0 text-left px-2.5 py-2 cursor-pointer bg-transparent border-none"
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
                  <button
                    onClick={() => handleDeleteRoom(r.id, r.name)}
                    title="删除房间"
                    className="mr-1.5 p-1 rounded-md text-muted-foreground/50 hover:text-red-500 hover:bg-destructive/10 bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* 当前房间的支线列表 */}
          {activeRoom && branches.length > 0 && (
            <div className="border-t border-border/40 p-2 space-y-1 flex-shrink-0 max-h-[30%] overflow-y-auto">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                支线（{branches.length}）
              </span>
              {branches.map((b) => (
                <details key={b.id} className="group">
                  <summary className="cursor-pointer text-[11px] text-foreground/75 py-0.5 hover:text-foreground list-none flex items-center gap-1">
                    <span className="truncate">{b.title}</span>
                    <span className="text-[9px] text-muted-foreground/60 shrink-0">
                      {BRANCH_TYPES.find((t) => t.value === b.branchType)?.label ?? b.branchType}
                    </span>
                  </summary>
                  <p className="text-[10px] text-foreground/60 leading-relaxed whitespace-pre-line mt-0.5 pl-1">
                    {b.content}
                  </p>
                </details>
              ))}
            </div>
          )}
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
                  {activeRoom.locationId && (
                    <span className="text-[11px] text-muted-foreground ml-2 truncate">
                      {locations.find((l) => l.id === activeRoom.locationId)?.name ?? ''}
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
                    结束支线会话
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
                {messages.map((m) => {
                  const isScene = m.senderType === 'system' && (m.senderLabel === '场景' || m.messageType === 'scene');
                  if (isScene) {
                    return (
                      <div key={m.id} className="flex justify-center">
                        <div className="max-w-[85%] text-center">
                          <div className="inline-block px-4 py-2 rounded-xl bg-muted/30 text-[12px] leading-relaxed text-foreground/50 italic border-l-2 border-r-2 border-border/30 whitespace-pre-line">
                            {m.content || (
                              <span className="inline-flex items-center gap-1 text-muted-foreground/60 not-italic">
                                <Loader2 size={11} className="animate-spin" />
                                场景生成中…
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  if (m.senderType === 'system') {
                    // AI 角色发言：用角色头像 + 角色名
                    return (
                      <div key={m.id} className="flex gap-2">
                        <div className="w-7 h-7 rounded-full bg-muted/60 flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden text-[10px] text-foreground/60">
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
                    );
                  }
                  // 用户消息（我的身份）：右侧 + 角色头像/名字
                  return (
                    <div key={m.id} className="flex gap-2 justify-end">
                      <div className="max-w-[80%]">
                        <span className="text-[10px] font-medium text-foreground/50 block mb-0.5 text-right">
                          {m.senderLabel}
                        </span>
                        <div className="px-3 py-2 rounded-2xl rounded-br-md text-[13px] leading-relaxed bg-foreground/[0.08] text-foreground/80 whitespace-pre-line">
                          {m.content}
                        </div>
                      </div>
                      <div className="w-7 h-7 rounded-full bg-foreground/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden text-[10px] text-foreground/60">
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
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="px-4 py-3 border-t border-border/30 flex-shrink-0 space-y-2">
                {/* 我的身份 + AI 推进 + 生成支线 */}
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] bg-muted/50 text-foreground/70 shrink-0">
                    <Sparkles size={11} className="text-foreground/40" />
                    <span className="font-medium">{myRole || '用户'}</span>
                    <span className="text-foreground/40">发言</span>
                  </span>
                  <button
                    onClick={() => autoAdvance(2)}
                    disabled={streaming}
                    className="h-7 px-2.5 rounded-md text-[11px] border border-foreground/25 bg-transparent cursor-pointer hover:bg-foreground/[0.05] text-foreground/75 shrink-0 disabled:opacity-40 flex items-center gap-1"
                    title="让 AI 自动推进 2 轮剧情，快速积累支线素材"
                  >
                    {streaming ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    {streaming ? 'AI 推进中…' : 'AI 推进剧情'}
                  </button>
                  <div className="flex-1" />
                  {branching ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Loader2 size={11} className="animate-spin" /> 支线生成中…
                    </span>
                  ) : (
                    <>
                      {showBranchPicker ? (
                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          {BRANCH_TYPES.map((bt) => (
                            <button
                              key={bt.value}
                              onClick={() => handleBranchType(bt.value)}
                              className="h-6 px-2 rounded-md text-[10px] border border-border bg-transparent cursor-pointer hover:bg-foreground/[0.04] text-foreground/70"
                            >
                              {bt.label}
                            </button>
                          ))}
                          <button
                            onClick={() => setShowBranchPicker(false)}
                            className="h-6 px-2 rounded-md text-[10px] text-muted-foreground border border-transparent bg-transparent cursor-pointer hover:bg-foreground/[0.04]"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowBranchPicker(true)}
                          disabled={streaming || messages.filter((m) => m.senderType === 'system').length === 0}
                          className="h-7 px-3 rounded-md text-[11px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer shrink-0 disabled:opacity-40"
                          title="把当前对话沉淀为一条角色支线素材"
                        >
                          ＋ 生成支线
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* 卡片式输入区：2 张 AI 推荐卡片 + 自定义卡片 */}
                <div className="grid grid-cols-2 gap-1.5">
                  {streaming ? (
                    <div className="col-span-2 px-3 py-2 rounded-xl border border-dashed border-border/60 text-[11px] text-muted-foreground/60 flex items-center justify-center gap-1.5">
                      <Loader2 size={11} className="animate-spin" />
                      AI 推进中…
                    </div>
                  ) : (
                    <>
                      {suggestions.map((s) => (
                        <button
                          key={s.label}
                          onClick={() => handleSuggestionClick(s.content)}
                          disabled={streaming}
                          className="text-left px-3 py-2 rounded-xl border border-border/60 bg-foreground/[0.03] cursor-pointer hover:bg-foreground/[0.06] disabled:opacity-40 disabled:cursor-default transition-colors"
                        >
                          <span className="text-[10px] font-medium text-foreground/60 block mb-0.5">
                            ✨ {s.label}
                          </span>
                          <span className="text-[11px] leading-snug text-foreground/80 line-clamp-2">
                            {s.content}
                          </span>
                        </button>
                      ))}
                      {suggestions.length < 2 && (
                        <div className="px-3 py-2 rounded-xl border border-dashed border-border/60 text-[11px] text-muted-foreground/60 flex items-center justify-center">
                          {'等待剧情推进…'}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {customOpen ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleCustomSend();
                        }
                      }}
                      autoFocus
                      placeholder={`以 ${myRole || '你的角色'} 的口吻发言…`}
                      className="flex-1 h-8 px-3 rounded-xl text-xs bg-background border border-border focus:outline-none focus:border-foreground/20"
                    />
                    <button
                      onClick={handleCustomSend}
                      disabled={!customInput.trim() || streaming}
                      className="w-8 h-8 flex items-center justify-center rounded-xl bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-30"
                    >
                      <Send size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCustomOpen(true)}
                    disabled={streaming}
                    className="w-full text-left px-3 py-2 rounded-xl border border-dashed border-border/60 text-[11px] text-foreground/60 bg-transparent cursor-pointer hover:bg-foreground/[0.03] disabled:opacity-40 disabled:cursor-default"
                  >
                    ✍️ 自定义内容…
                  </button>
                )}
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
