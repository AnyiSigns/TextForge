'use client';

import { useState, useEffect } from 'react';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useEditorStore } from '@/features/map/stores/editorStore';

interface SceneEditorProps {
  eventId: number | null;
  isNew: boolean;
  onClose: () => void;
}

export function SceneEditor({ eventId, isNew, onClose }: SceneEditorProps) {
  const sceneEvents = useEntityStore((s) => s.sceneEvents);
  const updateSceneEvent = useEntityStore((s) => s.updateSceneEvent);
  const addSceneEvent = useEntityStore((s) => s.addSceneEvent);
  const chapters = useEntityStore((s) => s.chapters);
  const plotThreads = useEntityStore((s) => s.plotThreads);
  const foreshadowings = useEntityStore((s) => s.foreshadowings);
  const locations = useEntityStore((s) => s.locations);
  const characters = useEntityStore((s) => s.characters);
  const updateForeshadowing = useEntityStore((s) => s.updateForeshadowing);
  const bookId = useEntityStore((s) => s.book?.id ?? 1);
  const prefillChapterId = useEditorStore((s) => s.prefillChapterId);

  const event = !isNew ? sceneEvents.find((e) => e.id === eventId) : null;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [storyLabel, setStoryLabel] = useState('');
  const [eventType, setEventType] = useState<string>('scene');
  const [chapterId, setChapterId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [characterIds, setCharacterIds] = useState<number[]>([]);
  const [plotThreadIds, setPlotThreadIds] = useState<number[]>([]);
  const [completedPlotThreadIds, setCompletedPlotThreadIds] = useState<number[]>([]);
  const [resolvedForeshadowingIds, setResolvedForeshadowingIds] = useState<number[]>([]);
  const [plantedForeshadowingIds, setPlantedForeshadowingIds] = useState<number[]>([]);

  // 本场景当前"埋下"的伏笔（伏笔的 relatedEventId 指向本场景）
  const currentPlanted = eventId != null
    ? foreshadowings.filter((f) => f.relatedEventId === eventId).map((f) => f.id)
    : [];

  // 自动推算时间轴位置（故事时间戳），用户无需手动输入数字：
  // - 挂在章节上：排在该章已有事件的末尾（若无事件则夹在相邻章节之间）
  // - 独立事件：排在整条时间线末尾
  const computeDefaultTs = (chId: number | null): number => {
    if (sceneEvents.length === 0) return 0;
    const maxTs = Math.max(...sceneEvents.map((e) => e.storyTs));
    if (!chId) return maxTs + 1;
    const chEvents = sceneEvents
      .filter((e) => e.chapterId === chId)
      .sort((a, b) => a.storyTs - b.storyTs);
    if (chEvents.length > 0) return chEvents[chEvents.length - 1].storyTs + 1;
    const sortedChapters = [...chapters].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sortedChapters.findIndex((c) => c.id === chId);
    let prevTs: number | null = null;
    let nextTs: number | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      const ev = sceneEvents.filter((e) => e.chapterId === sortedChapters[i].id);
      if (ev.length) { prevTs = Math.max(...ev.map((e) => e.storyTs)); break; }
    }
    for (let i = idx + 1; i < sortedChapters.length; i++) {
      const ev = sceneEvents.filter((e) => e.chapterId === sortedChapters[i].id);
      if (ev.length) { nextTs = Math.min(...ev.map((e) => e.storyTs)); break; }
    }
    if (prevTs !== null && nextTs !== null) return (prevTs + nextTs) / 2;
    if (prevTs !== null) return prevTs + 1;
    if (nextTs !== null) return nextTs - 1;
    return maxTs + 1;
  };

  useEffect(() => {
    if (isNew) {
      setChapterId(prefillChapterId ?? null);
      setCompletedPlotThreadIds([]);
      setResolvedForeshadowingIds([]);
      setPlantedForeshadowingIds([]);
      return;
    }
    if (!event) return;
    setTitle(event.title);
    setContent(event.content ?? '');
    setStoryLabel(event.storyLabel ?? '');
    setEventType(event.eventType);
    setChapterId(event.chapterId);
    setLocationId(event.locationId);
    setCharacterIds(event.characterIds || []);
    setPlotThreadIds(event.plotThreadIds || []);
    setCompletedPlotThreadIds(event.completedPlotThreadIds || []);
    setResolvedForeshadowingIds(event.resolvedForeshadowingIds || []);
    // 仅在本场景实体挂载时初始化埋下伏笔，避免 foreshadowings 列表刷新覆盖用户编辑
    setPlantedForeshadowingIds(
      foreshadowings.filter((f) => f.relatedEventId === eventId).map((f) => f.id),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, isNew, prefillChapterId, eventId]);

  if (!isNew && !event) return null;

  const toggleId = (list: number[], id: number) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const handleSave = () => {
    if (isNew) {
      const nextId = Math.max(0, ...sceneEvents.map((e) => e.id)) + 100;
      addSceneEvent({
        id: nextId,
        bookId,
        chapterId,
        title: title || '新场景',
        content,
        sortOrder: sceneEvents.length + 1,
        eventType: (eventType as 'scene' | 'milestone' | 'event') || 'scene',
        storyTs: computeDefaultTs(chapterId),
        storyLabel: storyLabel || null,
        locationId,
        characterIds,
        plotThreadIds,
        resolvedForeshadowingIds,
        completedPlotThreadIds,
        locked: false,
      });
    } else if (eventId !== null) {
      updateSceneEvent(eventId, {
        title,
        content,
        storyLabel: storyLabel || null,
        eventType: eventType as 'scene' | 'milestone' | 'event',
        chapterId,
        locationId,
        characterIds,
        plotThreadIds,
        resolvedForeshadowingIds,
        completedPlotThreadIds,
      });
      // 埋下伏笔：把勾选的伏笔关联到本场景（relatedEventId），取消则解除
      for (const fw of foreshadowings) {
        const selected = plantedForeshadowingIds.includes(fw.id);
        const was = currentPlanted.includes(fw.id);
        if (selected !== was) {
          updateForeshadowing(fw.id, { relatedEventId: selected ? eventId : null });
        }
      }
    }
    onClose();
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">场景标题</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">场景类型</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="w-full h-8 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          >
            <option value="scene">场景</option>
            <option value="milestone">里程碑</option>
            <option value="event">事件</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">所属章节</label>
          <select
            value={chapterId ?? ''}
            onChange={(e) => setChapterId(e.target.value ? Number(e.target.value) : null)}
            className="w-full h-8 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          >
            <option value="">独立事件（不关联章节）</option>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">发生地点</label>
        <select
          value={locationId ?? ''}
          onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : null)}
          className="w-full h-8 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
        >
          <option value="">未指定地点</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        {locations.length === 0 && <p className="text-[10px] text-muted-foreground/40">暂无地点，请先在世界地图中创建</p>}
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">时间标签</label>
        <input
          value={storyLabel}
          onChange={(e) => setStoryLabel(e.target.value)}
          placeholder={'第1天清晨'}
          className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
        />
        <p className="text-[10px] text-muted-foreground/40">在时间轴上显示的文字（如「第3天清晨」）。时间轴位置会根据所选章节自动排布，无需填写数字。</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">场景摘要</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          className="w-full px-3 py-2 rounded-md text-sm leading-relaxed bg-background border border-border focus:outline-none focus:border-foreground/20 resize-none"
          placeholder="输入场景摘要或正文..."
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">关联情节线（勾选"完结"表示情节线在本场景结束）</label>
        <div className="max-h-[120px] overflow-y-auto space-y-0.5">
          {plotThreads.map((pt) => {
            const linked = plotThreadIds.includes(pt.id);
            const done = completedPlotThreadIds.includes(pt.id);
            return (
              <label key={pt.id} className="flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer hover:bg-[#1c1b1a]/[0.02]">
                <input
                  type="checkbox"
                  checked={linked}
                  onChange={() => setPlotThreadIds(toggleId(plotThreadIds, pt.id))}
                  className="w-3 h-3 rounded border-[#1c1b1a]/[0.15]"
                />
                <span className="text-[11px] text-[#1c1b1a]/60 truncate flex-1">{pt.name}</span>
                <input
                  type="checkbox"
                  checked={done}
                  disabled={!linked}
                  onChange={() => setCompletedPlotThreadIds(toggleId(completedPlotThreadIds, pt.id))}
                  title="在本场景完结此情节线"
                  className="w-3 h-3 rounded border-[#1c1b1a]/[0.15] disabled:opacity-30"
                />
                <span className="text-[9px] text-[#1c1b1a]/30 shrink-0">完结</span>
              </label>
            );
          })}
          {plotThreads.length === 0 && <span className="text-[10px] text-muted-foreground/40">暂无情节线</span>}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">出场角色</label>
        <div className="max-h-[120px] overflow-y-auto space-y-0.5">
          {characters.map((c) => (
            <label key={c.id} className="flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer hover:bg-[#1c1b1a]/[0.02]">
              <input
                type="checkbox"
                checked={characterIds.includes(c.id)}
                onChange={() => setCharacterIds(toggleId(characterIds, c.id))}
                className="w-3 h-3 rounded border-[#1c1b1a]/[0.15]"
              />
              <span className="text-[11px] text-[#1c1b1a]/60 truncate">{c.name}</span>
            </label>
          ))}
          {characters.length === 0 && <span className="text-[10px] text-muted-foreground/40">暂无角色</span>}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">本场景揭示伏笔（揭示章节由该场景派生）</label>
        <div className="max-h-[120px] overflow-y-auto space-y-0.5">
          {foreshadowings.map((f) => (
            <label key={f.id} className="flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer hover:bg-[#1c1b1a]/[0.02]">
              <input
                type="checkbox"
                checked={resolvedForeshadowingIds.includes(f.id)}
                onChange={() => setResolvedForeshadowingIds(toggleId(resolvedForeshadowingIds, f.id))}
                className="w-3 h-3 rounded border-[#1c1b1a]/[0.15]"
              />
              <span className="text-[11px] text-[#1c1b1a]/60 truncate">{f.description.slice(0, 20) || `伏笔 #${f.id}`}</span>
            </label>
          ))}
          {foreshadowings.length === 0 && <span className="text-[10px] text-muted-foreground/40">暂无伏笔</span>}
        </div>
      </div>

      {!isNew && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">本场景埋下伏笔（埋下章节由该场景派生）</label>
          <div className="max-h-[120px] overflow-y-auto space-y-0.5">
            {foreshadowings.map((f) => (
              <label key={f.id} className="flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer hover:bg-[#1c1b1a]/[0.02]">
                <input
                  type="checkbox"
                  checked={plantedForeshadowingIds.includes(f.id)}
                  onChange={() => setPlantedForeshadowingIds(toggleId(plantedForeshadowingIds, f.id))}
                  className="w-3 h-3 rounded border-[#1c1b1a]/[0.15]"
                />
                <span className="text-[11px] text-[#1c1b1a]/60 truncate">{f.description.slice(0, 20) || `伏笔 #${f.id}`}</span>
              </label>
            ))}
            {foreshadowings.length === 0 && <span className="text-[10px] text-muted-foreground/40">暂无伏笔</span>}
          </div>
        </div>
      )}

      <div className="flex justify-between items-center pt-2">
        {isNew && <div />}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="h-8 px-4 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 bg-transparent border-none cursor-pointer transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="h-8 px-4 rounded-md text-xs font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer"
          >
            {isNew ? '创建' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
