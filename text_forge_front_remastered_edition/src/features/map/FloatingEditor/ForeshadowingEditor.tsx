'use client';

import { useState, useEffect } from 'react';
import { useEntityStore } from '@/features/map/stores/entityStore';

interface ForeshadowingEditorProps {
  foreshadowingId: number | null;
  isNew: boolean;
  onClose: () => void;
}

export function ForeshadowingEditor({ foreshadowingId, isNew, onClose }: ForeshadowingEditorProps) {
  const foreshadowings = useEntityStore((s) => s.foreshadowings);
  const updateForeshadowing = useEntityStore((s) => s.updateForeshadowing);
  const addForeshadowing = useEntityStore((s) => s.addForeshadowing);
  const bookId = useEntityStore((s) => s.book?.id ?? 1);
  const chapters = useEntityStore((s) => s.chapters);
  const sceneEvents = useEntityStore((s) => s.sceneEvents);
  const characters = useEntityStore((s) => s.characters);

  const foreshadowing = !isNew ? foreshadowings.find((f) => f.id === foreshadowingId) : null;

  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('planted');
  const [plantedAtChapterId, setPlantedAtChapterId] = useState<number | null>(null);
  const [resolvedAtChapterId, setResolvedAtChapterId] = useState<number | null>(null);
  const [relatedCharacterIds, setRelatedCharacterIds] = useState<number[]>([]);
  const [relatedEventId, setRelatedEventId] = useState<number | null>(null);
  const [revealType, setRevealType] = useState('gradual');
  const [notes, setNotes] = useState('');
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (isNew) return;
    if (!foreshadowing) return;
    setDescription(foreshadowing.description || '');
    setStatus(foreshadowing.status || 'planted');
    setPlantedAtChapterId(foreshadowing.plantedAtChapterId ?? null);
    setResolvedAtChapterId(foreshadowing.resolvedAtChapterId ?? null);
    setRelatedCharacterIds(foreshadowing.relatedCharacterIds || []);
    setRelatedEventId(foreshadowing.relatedEventId ?? null);
    setRevealType(foreshadowing.revealType || 'gradual');
    setNotes(foreshadowing.notes || '');
    setLocked(foreshadowing.locked || false);
  }, [foreshadowing, isNew]);

  const handleSave = () => {
    if (isNew) {
      const nextId = Math.max(0, ...foreshadowings.map((f) => f.id)) + 100;
      addForeshadowing({
        id: nextId,
        bookId,
        description,
        status,
        plantedAtChapterId,
        resolvedAtChapterId,
        relatedCharacterIds,
        relatedEventId,
        revealType,
        notes,
        locked,
      });
    } else if (foreshadowingId !== null) {
      updateForeshadowing(foreshadowingId, {
        description,
        status,
        plantedAtChapterId,
        resolvedAtChapterId,
        relatedCharacterIds,
        relatedEventId,
        revealType,
        notes,
        locked,
      });
    }
    onClose();
  };

  if (!isNew && !foreshadowing) return null;

  const plantedChapter = chapters.find((c) => c.id === plantedAtChapterId);
  const resolvedChapter = chapters.find((c) => c.id === resolvedAtChapterId);
  const relatedEvent = sceneEvents.find((e) => e.id === relatedEventId);

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">伏笔描述</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 rounded-md text-sm leading-relaxed bg-background border border-border focus:outline-none focus:border-foreground/20 resize-none"
          placeholder="描述这个伏笔..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">伏笔状态</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full h-8 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          >
            <option value="planted">已埋下</option>
            <option value="ongoing">进行中</option>
            <option value="resolved">已回收</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">揭示方式</label>
          <select
            value={revealType}
            onChange={(e) => setRevealType(e.target.value)}
            className="w-full h-8 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          >
            <option value="gradual">逐步揭示</option>
            <option value="sudden">突然揭示</option>
            <option value="twist">反转</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">埋下伏笔章节</label>
          <select
            value={plantedAtChapterId ?? ''}
            onChange={(e) => setPlantedAtChapterId(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full h-8 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          >
            <option value="">未关联</option>
            {chapters.map((ch) => (
              <option key={ch.id} value={ch.id}>{ch.title}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">回收伏笔章节</label>
          <select
            value={resolvedAtChapterId ?? ''}
            onChange={(e) => setResolvedAtChapterId(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full h-8 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          >
            <option value="">未关联</option>
            {chapters.map((ch) => (
              <option key={ch.id} value={ch.id}>{ch.title}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">关联场景事件</label>
          <select
            value={relatedEventId ?? ''}
            onChange={(e) => setRelatedEventId(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full h-8 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          >
            <option value="">未关联</option>
            {sceneEvents.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">关联角色 ({relatedCharacterIds.length})</label>
          <div className="max-h-[100px] overflow-y-auto space-y-0.5 border border-border rounded-md p-1.5 bg-background">
            {characters.map((ch) => (
              <label key={ch.id} className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                <input
                  type="checkbox"
                  checked={relatedCharacterIds.includes(ch.id)}
                  onChange={() =>
                    setRelatedCharacterIds(
                      relatedCharacterIds.includes(ch.id)
                        ? relatedCharacterIds.filter((id) => id !== ch.id)
                        : [...relatedCharacterIds, ch.id],
                    )
                  }
                  className="w-3 h-3"
                />
                {ch.name}
              </label>
            ))}
            {characters.length === 0 && <span className="text-[10px] text-muted-foreground/40">暂无角色</span>}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">备注</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20 resize-none"
          placeholder="额外说明..."
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-medium text-muted-foreground">锁定</label>
          <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} className="w-3 h-3" />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
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
  );
}
