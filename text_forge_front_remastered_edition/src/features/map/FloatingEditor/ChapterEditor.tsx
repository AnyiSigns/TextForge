'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useEntityStore } from '@/features/map/stores/entityStore';

interface ChapterEditorProps {
  entityType: 'chapter' | 'volume';
  entityId: number | null;
  isNew: boolean;
  onClose: () => void;
}

export function ChapterEditor({ entityType, entityId, onClose }: ChapterEditorProps) {
  const chapters = useEntityStore((s) => s.chapters);
  const volumes = useEntityStore((s) => s.volumes);
  const updateChapter = useEntityStore((s) => s.updateChapter);
  const updateVolume = useEntityStore((s) => s.updateVolume);

  const isChapter = entityType === 'chapter';
  const entity = isChapter
    ? chapters.find((c) => c.id === entityId)
    : volumes.find((v) => v.id === entityId);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [locked, setLocked] = useState(false);

  // 实体数据异步到达时同步本地编辑状态（渲染期间调整，React 会立即重渲染）
  const [prevEntity, setPrevEntity] = useState(entity);
  if (entity && prevEntity !== entity) {
    setPrevEntity(entity);
    setTitle(entity.title ?? '');
    setSummary((entity.summary as string | null | undefined) ?? '');
    if (isChapter) {
      setLocked(!!(entity as { locked?: boolean }).locked);
    }
  }

  const handleSave = () => {
    if (!entityId) return;
    if (isChapter) {
      updateChapter(entityId, { title: title.trim(), summary: summary.trim(), locked });
    } else {
      updateVolume(entityId, { title: title.trim(), summary: summary.trim() });
    }
    toast.success('已保存');
    onClose();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground/60">
          {isChapter ? '章节标题' : '卷标题'}
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isChapter ? '章节标题' : '卷标题'}
          className="w-full h-9 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground/60">
          {isChapter ? '本章大纲 / 摘要' : '卷摘要'}
        </label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="概括本章要写的主要内容、情节走向……"
          rows={6}
          className="w-full px-3 py-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20 resize-none leading-relaxed"
        />
      </div>

      {isChapter && (
        <>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="chapter-locked"
              checked={locked}
              onChange={(e) => setLocked(e.target.checked)}
              className="accent-foreground"
            />
            <label htmlFor="chapter-locked" className="text-[11px] text-muted-foreground/60 cursor-pointer">
              锁定本章（禁止 Agent / 接管写入覆盖）
            </label>
          </div>
        </>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          className="flex-1 h-9 rounded-md text-sm font-medium bg-foreground text-background border-none cursor-pointer hover:opacity-90 disabled:opacity-40"
          disabled={!title.trim()}
        >
          保存
        </button>
        <button
          onClick={onClose}
          className="h-9 px-4 rounded-md text-sm text-muted-foreground hover:text-foreground bg-transparent border border-border cursor-pointer"
        >
          <X size={14} className="inline mr-1" />取消
        </button>
      </div>
    </div>
  );
}
