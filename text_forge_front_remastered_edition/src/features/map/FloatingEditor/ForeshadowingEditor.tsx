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
  const [relatedCharacterIds, setRelatedCharacterIds] = useState<number[]>([]);
  const [revealType, setRevealType] = useState('gradual');
  const [notes, setNotes] = useState('');
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (isNew) return;
    if (!foreshadowing) return;
    setDescription(foreshadowing.description || '');
    setRelatedCharacterIds(foreshadowing.relatedCharacterIds || []);
    setRevealType(foreshadowing.revealType || 'gradual');
    setNotes(foreshadowing.notes || '');
    setLocked(foreshadowing.locked || false);
  }, [foreshadowing, isNew]);

  const handleSave = () => {
    const common = { description, relatedCharacterIds, revealType, notes, locked };
    if (isNew) {
      const nextId = Math.max(0, ...foreshadowings.map((f) => f.id)) + 100;
      addForeshadowing({
        id: nextId,
        bookId,
        ...common,
        status: 'planted',
        plantedAtChapterId: null,
        resolvedAtChapterId: null,
        relatedEventId: null,
      });
    } else if (foreshadowingId !== null) {
      // 派生字段（状态/埋下章节/揭示章节/关联事件）由大纲场景节点驱动，不在标签页维护
      updateForeshadowing(foreshadowingId, common);
    }
    onClose();
  };

  if (!isNew && !foreshadowing) return null;

  const plantedChapter = chapters.find((c) => c.id === foreshadowing?.plantedAtChapterId);
  const resolvedChapter = chapters.find((c) => c.id === foreshadowing?.resolvedAtChapterId);
  const relatedEvent = sceneEvents.find((e) => e.id === foreshadowing?.relatedEventId);

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
          <label className="text-[11px] font-medium text-muted-foreground">伏笔状态（由大纲揭示场景派生）</label>
          <div className="px-1 py-1.5 text-sm text-muted-foreground/70">
            {(foreshadowing?.status ?? 'planted') === 'resolved' ? '已回收' : '已埋下'}
          </div>
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
          <label className="text-[11px] font-medium text-muted-foreground">埋下章节（由埋下场景派生）</label>
          <div className="px-1 py-1.5 text-sm text-muted-foreground/70">
            {plantedChapter?.title ?? '未埋下'}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">回收章节（由揭示场景派生）</label>
          <div className="px-1 py-1.5 text-sm text-muted-foreground/70">
            {resolvedChapter?.title ?? '未回收'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">埋下场景（在大纲场景节点设置）</label>
          <div className="px-1 py-1.5 text-sm text-muted-foreground/70">
            {relatedEvent?.title ?? '未关联'}
          </div>
        </div>        <div className="space-y-1.5">
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
