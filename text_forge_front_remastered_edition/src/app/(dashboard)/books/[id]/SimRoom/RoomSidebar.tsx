'use client';

/**
 * 角色模拟：左侧面板（从 SimRoom.tsx 内联抽离）。
 * 房间列表 + 创建表单 + 当前房间支线列表。
 */
import { Plus, Users, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { SimRoomSummary, SimBranch } from '@/shared/api/simRooms';
import type { Character, Location, SceneEvent, Foreshadowing, PlotThread } from '@/shared/api/types';
import { CreateRoomForm, type CreateRoomFormPayload } from './CreateRoomForm';
import { BRANCH_TYPES } from './constants';

interface RoomSidebarProps {
  rooms: SimRoomSummary[];
  loadingRooms: boolean;
  showNew: boolean;
  activeRoomId: number | null;
  branches: SimBranch[];
  characters: Character[];
  locations: Location[];
  events: SceneEvent[];
  foreshadowings: Foreshadowing[];
  plotThreads: PlotThread[];
  onToggleNew: () => void;
  onCancelNew: () => void;
  onCreate: (payload: CreateRoomFormPayload) => void;
  onEnterRoom: (roomId: number) => void;
  onDeleteRoom: (roomId: number, roomName: string) => void;
}

export function RoomSidebar({
  rooms,
  loadingRooms,
  showNew,
  activeRoomId,
  branches,
  characters,
  locations,
  events,
  foreshadowings,
  plotThreads,
  onToggleNew,
  onCancelNew,
  onCreate,
  onEnterRoom,
  onDeleteRoom,
}: RoomSidebarProps) {
  return (
    <div className="w-[264px] shrink-0 border-r border-border/40 flex flex-col">
      <div className="flex items-center justify-between px-3 h-12 border-b border-border/40 flex-shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          角色支线
        </span>
        <button
          onClick={onToggleNew}
          disabled={!!activeRoomId}
          className="p-1 rounded bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-30"
          title="新建角色支线"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {showNew && (
          <CreateRoomForm
            characters={characters}
            locations={locations}
            events={events}
            foreshadowings={foreshadowings}
            plotThreads={plotThreads}
            onCreate={onCreate}
            onCancel={onCancelNew}
          />
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
                activeRoomId === r.id && 'bg-foreground/[0.05] border-border/40',
              )}
            >
              <button
                onClick={() => onEnterRoom(r.id)}
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
                onClick={() => onDeleteRoom(r.id, r.name)}
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
      {activeRoomId !== null && branches.length > 0 && (
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
  );
}
