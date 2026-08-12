'use client';

/**
 * 角色模拟：创建房间表单（从 SimRoom.tsx 内联创建区抽离）。
 * 地点 + 我的身份（单选）+ AI 扮演角色（多选）+ 事件/伏笔/线索关联。
 */
import { useState } from 'react';
import { toast } from 'sonner';
import type { Character, Location, SceneEvent, Foreshadowing, PlotThread } from '@/shared/api/types';

export interface CreateRoomFormPayload {
  name: string;
  locationId: number | null;
  userCharacterId: number;
  participantIds: number[];
  relatedEventIds: number[];
  relatedForeshadowingIds: number[];
  relatedPlotThreadIds: number[];
}

interface CreateRoomFormProps {
  characters: Character[];
  locations: Location[];
  events: SceneEvent[];
  foreshadowings: Foreshadowing[];
  plotThreads: PlotThread[];
  onCreate: (payload: CreateRoomFormPayload) => void;
  onCancel: () => void;
}

// 多选列表切换工具：列表中有则移除，否则追加。
function toggleIn(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function CreateRoomForm(props: CreateRoomFormProps) {
  const { characters, locations, events, foreshadowings, plotThreads, onCreate, onCancel } = props;

  const [newName, setNewName] = useState('');
  // 用户扮演的「我的身份」角色（单选）
  const [myCharacterId, setMyCharacterId] = useState<number | null>(null);
  // AI 扮演的角色（多选）
  const [aiCharacterIds, setAiCharacterIds] = useState<number[]>([]);
  const [selLocation, setSelLocation] = useState<number | null>(null);
  const [selEvents, setSelEvents] = useState<number[]>([]);
  const [selForeshadowings, setSelForeshadowings] = useState<number[]>([]);
  const [selPlotThreads, setSelPlotThreads] = useState<number[]>([]);

  const handleCreate = () => {
    if (!newName.trim()) {
      toast.error('请输入房间名称');
      return;
    }
    if (aiCharacterIds.length === 0) {
      toast.error('请至少选择 1 个 AI 扮演角色');
      return;
    }
    if (myCharacterId === null) {
      toast.error('请选择你扮演的角色');
      return;
    }
    onCreate({
      name: newName.trim(),
      locationId: selLocation,
      userCharacterId: myCharacterId,
      participantIds: aiCharacterIds,
      relatedEventIds: selEvents,
      relatedForeshadowingIds: selForeshadowings,
      relatedPlotThreadIds: selPlotThreads,
    });
  };

  return (
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
          onClick={onCancel}
          className="px-3 h-7 rounded border border-border text-xs bg-transparent cursor-pointer"
        >
          取消
        </button>
      </div>
    </div>
  );
}
