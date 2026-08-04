'use client';

import { useState, useEffect } from 'react';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useStoryFlowStore } from '@/features/map/stores/storyFlowStore';
import { Compass } from 'lucide-react';

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
  const bookId = useEntityStore((s) => s.book?.id ?? 1);
  const openStoryFlow = useStoryFlowStore((s) => s.open);

  const event = !isNew ? sceneEvents.find((e) => e.id === eventId) : null;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [storyLabel, setStoryLabel] = useState('');
  const [eventType, setEventType] = useState<string>('scene');
  const [chapterId, setChapterId] = useState<number | null>(null);
  const [storyTs, setStoryTs] = useState<string>('');

  useEffect(() => {
    if (isNew) return;
    if (!event) return;
    setTitle(event.title);
    setContent(event.content ?? '');
    setStoryLabel(event.storyLabel ?? '');
    setEventType(event.eventType);
    setChapterId(event.chapterId);
    setStoryTs(String(event.storyTs));
  }, [event, isNew]);

  if (!isNew && !event) return null;

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
        eventType: (eventType as 'scene' | 'event' | 'milestone') || 'scene',
        storyTs: storyTs ? parseInt(storyTs) : 0,
        storyLabel: storyLabel || null,
        locationId: null,
        characterIds: [],
        locked: false,
      });
    } else if (eventId !== null) {
      updateSceneEvent(eventId, {
        title,
        content,
        storyLabel: storyLabel || null,
        eventType: eventType as 'scene' | 'event' | 'milestone',
        chapterId,
      });
    }
    onClose();
  };

  const chapter = chapters.find((c) => c.id === chapterId);

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">事件标题</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">事件类型</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="w-full h-8 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          >
            <option value="scene">场景</option>
            <option value="event">事件</option>
            <option value="milestone">里程碑</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">所属章节</label>
          <div className="text-sm text-muted-foreground/70 pt-2">
            {chapter?.title ?? '独立事件'}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">时间标签</label>
        <input
          value={storyLabel}
          onChange={(e) => setStoryLabel(e.target.value)}
          placeholder={event?.storyLabel ?? (event ? `星历${event.storyTs}天` : '输入时间标签')}
          className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
        />
      </div>

      {isNew && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">故事时间戳</label>
          <input
            type="number"
            value={storyTs}
            onChange={(e) => setStoryTs(e.target.value)}
            placeholder="0"
            className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">场景内容</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          className="w-full px-3 py-2 rounded-md text-sm leading-relaxed bg-background border border-border focus:outline-none focus:border-foreground/20 resize-none"
          placeholder="输入场景摘要或正文..."
        />
      </div>

      <div className="flex justify-between items-center pt-2">
        {!isNew && eventId !== null && (
          <button
            onClick={() => {
              onClose();
              openStoryFlow(eventId);
            }}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5 bg-transparent border border-border/40 cursor-pointer transition-colors"
          >
            <Compass size={12} />
            剧情流
          </button>
        )}
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
