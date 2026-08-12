'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { RoomSidebar } from './RoomSidebar';
import { ChatArea } from './ChatArea';
import type { CreateRoomFormPayload } from './CreateRoomForm';
import { showApiError } from '@/shared/lib/apiError';

interface SimRoomProps {
  bookId: number;
  bookTitle?: string;
  onClose: () => void;
}

export function SimRoom({ bookId, bookTitle, onClose }: SimRoomProps) {
  const [rooms, setRooms] = useState<SimRoomSummary[]>([]);
  const [activeRoom, setActiveRoom] = useState<SimRoomDetail | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(true);

  const [showNew, setShowNew] = useState(false);
  // 创建房间的世界数据
  const [characters, setCharacters] = useState<Character[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [events, setEvents] = useState<SceneEvent[]>([]);
  const [foreshadowings, setForeshadowings] = useState<Foreshadowing[]>([]);
  const [plotThreads, setPlotThreads] = useState<PlotThread[]>([]);

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
    lastEvent,
  } = useSimRoomSocket(activeRoom);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // 记录已处理的 lastEvent，避免对同一协议事件重复 toast
  const lastEventRef = useRef<typeof lastEvent>(null);

  // 消费 WS 协议级事件（结束摘要 / 自动结束原因 / 支线创建提示）；
  // error 已由 hook 内部消息气泡展示，此处不再重复 toast。
  useEffect(() => {
    if (!lastEvent || lastEvent === lastEventRef.current) return;
    lastEventRef.current = lastEvent;
    if (lastEvent.type === 'auto_end') {
      toast.info(`对话自动结束：${lastEvent.reason || ''}（共${lastEvent.roundCount || 0}轮）`);
    } else if (lastEvent.type === 'end') {
      toast.info(lastEvent.summary || '对话已结束');
    } else if (lastEvent.type === 'branch_created') {
      toast.success(`支线已沉淀：${lastEvent.branchTitle || ''}`);
    }
  }, [lastEvent]);

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
    } else {
      toast.error('进入房间失败');
    }
  };

  const handleCreate = async (form: CreateRoomFormPayload) => {
    const payload: CreateSimRoomPayload = {
      bookId,
      name: form.name,
      locationId: form.locationId,
      userCharacterId: form.userCharacterId,
      participantIds: form.participantIds,
      participantTypes: form.participantIds.map(() => 'character'),
      relatedEventIds: form.relatedEventIds,
      relatedForeshadowingIds: form.relatedForeshadowingIds,
      relatedPlotThreadIds: form.relatedPlotThreadIds,
    };
    try {
      const created = await createSimRoom(payload);
      setRooms((prev) => [
        ...prev,
        {
          id: created.id,
          bookId,
          name: created.name,
          status: 'active',
          participantCount: form.participantIds.length + 1,
          roundCount: 0,
          createdAt: new Date().toISOString(),
        },
      ]);
      setShowNew(false);
      await enterRoom(created.id);
    } catch (e) {
      showApiError(e, '创建失败');
    }
  };

  const handleEnd = () => {
    end(true);
    toast.info('对话已结束，正在生成摘要');
  };

  // 用户发言：根据房间参与者推断发言身份——若当前用户有扮演角色（entity_type=user）
  // 则以该角色发言（character:<id>），否则以导演身份发言。后端约定 speakAs 为
  // "director" 或 "character:<id>"。
  const handleSend = (content: string) => {
    const userParticipant = activeRoom?.participants.find((p) => p.entityType === 'user');
    const speakAs = userParticipant ? `character:${userParticipant.entityId}` : 'director';
    send(content, speakAs);
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
        <RoomSidebar
          rooms={rooms}
          loadingRooms={loadingRooms}
          showNew={showNew}
          activeRoomId={activeRoom?.id ?? null}
          branches={branches}
          characters={characters}
          locations={locations}
          events={events}
          foreshadowings={foreshadowings}
          plotThreads={plotThreads}
          onToggleNew={() => setShowNew((v) => !v)}
          onCancelNew={() => setShowNew(false)}
          onCreate={(form) => void handleCreate(form)}
          onEnterRoom={(roomId) => void enterRoom(roomId)}
          onDeleteRoom={(roomId, name) => void handleDeleteRoom(roomId, name)}
        />

        <ChatArea
          activeRoom={activeRoom}
          bookTitle={bookTitle}
          locations={locations}
          messages={messages}
          suggestions={suggestions}
          streaming={streaming}
          branching={branching}
          connected={connected}
          roundCount={roundCount}
          myRole={myRole}
          avatarByCharacter={avatarByCharacter}
          messagesEndRef={messagesEndRef}
          onEnd={handleEnd}
          onClose={onClose}
          onSend={handleSend}
          onAutoAdvance={autoAdvance}
          onBranchType={createBranch}
        />
      </div>
    </div>
  );
}
