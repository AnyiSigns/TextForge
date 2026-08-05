'use client';

import { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { useEntityStore } from '@/features/map/stores/entityStore';

interface PlotThreadEditorProps {
  plotThreadId: number | null;
  isNew: boolean;
  onClose: () => void;
}

export function PlotThreadEditor({ plotThreadId, isNew, onClose }: PlotThreadEditorProps) {
  const plotThreads = useEntityStore((s) => s.plotThreads);
  const updatePlotThread = useEntityStore((s) => s.updatePlotThread);
  const addPlotThread = useEntityStore((s) => s.addPlotThread);
  const bookId = useEntityStore((s) => s.book?.id ?? 1);
  const chapters = useEntityStore((s) => s.chapters);
  const characters = useEntityStore((s) => s.characters);

  const plotThread = !isNew ? plotThreads.find((p) => p.id === plotThreadId) : null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [type, setType] = useState('');
  const [parentThreadId, setParentThreadId] = useState<number | null>(null);
  const [relatedCharacterIds, setRelatedCharacterIds] = useState<number[]>([]);
  const [startChapterId, setStartChapterId] = useState<number | null>(null);
  const [endChapterId, setEndChapterId] = useState<number | null>(null);
  const [progressNote, setProgressNote] = useState('');
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (isNew) return;
    if (!plotThread) return;
    setName(plotThread.name || '');
    setDescription(plotThread.description || '');
    setStatus(plotThread.status || 'active');
    setType(plotThread.type || '');
    setParentThreadId(plotThread.parentThreadId ?? null);
    setRelatedCharacterIds(plotThread.relatedCharacterIds || []);
    setStartChapterId(plotThread.startChapterId ?? null);
    setEndChapterId(plotThread.endChapterId ?? null);
    setProgressNote(plotThread.progressNote || '');
    setLocked(plotThread.locked || false);
  }, [plotThread, isNew]);

  const handleSave = () => {
    if (isNew) {
      const nextId = Math.max(0, ...plotThreads.map((p) => p.id)) + 100;
      addPlotThread({
        id: nextId,
        bookId,
        name,
        description,
        status,
        type,
        parentThreadId,
        relatedCharacterIds,
        startChapterId,
        endChapterId,
        progressNote,
        locked,
      });
    } else if (plotThreadId !== null) {
      updatePlotThread(plotThreadId, {
        name,
        description,
        status,
        type,
        parentThreadId,
        relatedCharacterIds,
        startChapterId,
        endChapterId,
        progressNote,
        locked,
      });
    }
    onClose();
  };

  if (!isNew && !plotThread) return null;

  const startChapter = chapters.find((c) => c.id === startChapterId);
  const endChapter = chapters.find((c) => c.id === endChapterId);
  const parentThread = plotThreads.find((p) => p.id === parentThreadId);

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">情节线名称</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          placeholder="主线/支线/暗线..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">状态</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full h-8 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          >
            <option value="active">进行中</option>
            <option value="planted">已埋下</option>
            <option value="resolved">已完结</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">情节线类型</label>
          <input
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
            placeholder="主线/支线/暗线/感情线"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">描述</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-md text-sm leading-relaxed bg-background border border-border focus:outline-none focus:border-foreground/20 resize-none"
          placeholder="情节线概要..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">起始章节</label>
          <select
            value={startChapterId ?? ''}
            onChange={(e) => setStartChapterId(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full h-8 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          >
            <option value="">未关联</option>
            {chapters.map((ch) => (
              <option key={ch.id} value={ch.id}>{ch.title}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">结束章节</label>
          <select
            value={endChapterId ?? ''}
            onChange={(e) => setEndChapterId(e.target.value ? parseInt(e.target.value) : null)}
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
          <label className="text-[11px] font-medium text-muted-foreground">父情节线</label>
          <select
            value={parentThreadId ?? ''}
            onChange={(e) => setParentThreadId(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full h-8 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          >
            <option value="">无</option>
            {plotThreads
              .filter((p) => isNew || p.id !== plotThreadId)
              .map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
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
        <label className="text-[11px] font-medium text-muted-foreground">进度备注</label>
        <textarea
          value={progressNote}
          onChange={(e) => setProgressNote(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20 resize-none"
          placeholder="当前进展..."
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
