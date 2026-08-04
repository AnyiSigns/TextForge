'use client';

import { useState, useMemo, useEffect } from 'react';
import { ChevronRight, ChevronDown, Circle, PenLine, Plus, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/shared/lib/cn';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useTimelineStore } from '@/features/map/stores/timelineStore';
import { useEditorStore } from '@/features/map/stores/editorStore';
import { ConfirmDialog } from '@/features/map/components/ConfirmDialog';
import { toast } from 'sonner';

interface OutlineTreeProps {
  bookId: number;
}

export function OutlineTree({ bookId }: OutlineTreeProps) {
  const volumes = useEntityStore((s) => s.volumes);
  const chapters = useEntityStore((s) => s.chapters);
  const sceneEvents = useEntityStore((s) => s.sceneEvents);
  const addChapter = useEntityStore((s) => s.addChapter);
  const addVolume = useEntityStore((s) => s.addVolume);
  const removeVolume = useEntityStore((s) => s.removeVolume);
  const removeChapter = useEntityStore((s) => s.removeChapter);
  const cursorTs = useTimelineStore((s) => s.cursorTs);
  const setCursorTs = useTimelineStore((s) => s.setCursorTs);
  const openEditor = useEditorStore((s) => s.open);

  const [expandedVolumes, setExpandedVolumes] = useState<Set<number>>(new Set([1]));
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());
  const [addChapterVolumeId, setAddChapterVolumeId] = useState<number | null>(null);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterSummary, setNewChapterSummary] = useState('');
  const [deleteVolumeId, setDeleteVolumeId] = useState<number | null>(null);
  const [deleteChapterId, setDeleteChapterId] = useState<number | null>(null);
  const [showAddVolume, setShowAddVolume] = useState(false);
  const [newVolumeTitle, setNewVolumeTitle] = useState('');
  const [newVolumeSummary, setNewVolumeSummary] = useState('');

  const volumeData = useMemo(() => {
    return volumes.map((vol) => {
      const volChapters = chapters
        .filter((ch) => ch.volumeId === vol.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((ch) => {
          const events = sceneEvents
            .filter((e) => e.chapterId === ch.id)
            .sort((a, b) => a.sortOrder - b.sortOrder || a.storyTs - b.storyTs);
          return { chapter: ch, events };
        });
      return { volume: vol, chapters: volChapters };
    });
  }, [volumes, chapters, sceneEvents]);

  const toggleVolume = (id: number) => {
    setExpandedVolumes((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleChapter = (id: number) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (cursorTs <= 0) return;
    for (const vol of volumeData) {
      for (const { chapter, events } of vol.chapters) {
        if (events.length === 0) continue;
        const minTs = Math.min(...events.map((e) => e.storyTs));
        const maxTs = Math.max(...events.map((e) => e.storyTs));
        if (cursorTs >= minTs && cursorTs <= maxTs) {
          setExpandedVolumes((prev) => {
            const next = new Set(prev);
            next.add(vol.volume.id);
            return next;
          });
          setExpandedChapters((prev) => {
            const next = new Set(prev);
            next.add(chapter.id);
            return next;
          });
          return;
        }
      }
    }
  }, [cursorTs, volumeData]);

  const handleChapterClick = (events: typeof sceneEvents) => {
    if (events.length > 0) {
      const minTs = Math.min(...events.map((e) => e.storyTs));
      setCursorTs(minTs);
    }
  };

  const handleEventClick = (event: (typeof sceneEvents)[number]) => {
    setCursorTs(event.storyTs);
    openEditor('scene', event.id);
  };

  const handleAddVolume = () => {
    if (!newVolumeTitle.trim()) return;
    const nextId = Math.max(0, ...volumes.map((v) => v.id)) + 100;
    addVolume({
      id: nextId,
      bookId,
      title: newVolumeTitle.trim(),
      summary: newVolumeSummary.trim() || '',
      sortOrder: volumes.length + 1,
    });
    setShowAddVolume(false);
    setNewVolumeTitle('');
    setNewVolumeSummary('');
    toast.success('卷已添加');
  };

  const handleAddChapter = () => {
    if (!newChapterTitle.trim() || addChapterVolumeId === null) return;
    const nextId = Math.max(0, ...chapters.map((c) => c.id)) + 100;
    const vol = volumes.find((v) => v.id === addChapterVolumeId);
    const order = chapters.filter((c) => c.volumeId === addChapterVolumeId).length + 1;
    addChapter({
      id: nextId,
      volumeId: addChapterVolumeId,
      title: newChapterTitle.trim(),
      summary: newChapterSummary.trim() || '',
      sortOrder: order,
      characterIds: [],
      locked: false,
    });
    setAddChapterVolumeId(null);
    setNewChapterTitle('');
    setNewChapterSummary('');
    toast.success('章节已添加');
  };

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">大纲</span>
        <button
          onClick={() => { setShowAddVolume(!showAddVolume); setNewVolumeTitle(''); setNewVolumeSummary(''); }}
          className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground/60 bg-transparent border-none cursor-pointer transition-colors"
          title="添加卷"
        >
          <Plus size={12} strokeWidth={1.8} />
        </button>
      </div>

      {showAddVolume && (
        <div className="px-2 py-2 mb-1 rounded-md bg-foreground/[0.02] border border-border/30">
          <input
            value={newVolumeTitle}
            onChange={(e) => setNewVolumeTitle(e.target.value)}
            placeholder="卷标题"
            className="w-full h-7 px-2 rounded text-xs bg-background border border-border focus:outline-none focus:border-foreground/20 mb-1"
            autoFocus
          />
          <input
            value={newVolumeSummary}
            onChange={(e) => setNewVolumeSummary(e.target.value)}
            placeholder="摘要（可选）"
            className="w-full h-7 px-2 rounded text-xs bg-background border border-border focus:outline-none focus:border-foreground/20 mb-1.5"
          />
          <div className="flex gap-1">
            <button
              onClick={handleAddVolume}
              disabled={!newVolumeTitle.trim()}
              className="h-6 px-3 rounded text-[10px] font-medium bg-foreground text-background border-none cursor-pointer disabled:opacity-50"
            >
              创建
            </button>
            <button
              onClick={() => setShowAddVolume(false)}
              className="h-6 px-3 rounded text-[10px] text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {volumeData.map(({ volume, chapters: volChapters }) => {
        const isVolExpanded = expandedVolumes.has(volume.id);
        return (
          <div key={`vol-${volume.id}`}>
            <div
              className="flex items-center gap-1 px-1 py-1.5 rounded-md cursor-pointer hover:bg-foreground/[0.04] transition-all duration-200 group hover:scale-[1.02]"
              onClick={() => toggleVolume(volume.id)}
            >
              <button className="w-4 h-4 flex items-center justify-center bg-transparent border-none cursor-pointer text-muted-foreground/40">
                {isVolExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              <span className="text-[12px] font-semibold text-foreground/70">
                {volume.title}
              </span>
              <span className="text-[9px] text-muted-foreground/40 ml-auto">
                {volChapters.length}章
              </span>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setAddChapterVolumeId(volume.id);
                  setNewChapterTitle('');
                  setNewChapterSummary('');
                }}
                className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground/30 hover:text-foreground/50 transition-colors bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100"
                title="添加章节"
              >
                <Plus size={10} strokeWidth={2} />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openEditor('volume', volume.id);
                }}
                className="w-3.5 h-3.5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground/60 hover:scale-110 opacity-0 group-hover:opacity-100 transition-all bg-transparent border-none cursor-pointer"
                title="编辑卷"
              >
                <Pencil size={10} strokeWidth={1.8} />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteVolumeId(volume.id);
                }}
                className="w-3.5 h-3.5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-red-500/60 hover:scale-110 opacity-0 group-hover:opacity-100 transition-all bg-transparent border-none cursor-pointer"
                title="删除卷"
              >
                <Trash2 size={10} strokeWidth={1.8} />
              </button>
            </div>

            {isVolExpanded && (
              <div>
                {volume.summary && (
                  <div className="px-4 py-1.5 text-[11px] leading-relaxed text-muted-foreground/50 max-h-20 overflow-hidden">
                    {volume.summary}
                  </div>
                )}

                {addChapterVolumeId === volume.id && (
                  <div className="px-4 py-2 mb-1 rounded-md bg-foreground/[0.02] border border-border/20">
                    <input
                      value={newChapterTitle}
                      onChange={(e) => setNewChapterTitle(e.target.value)}
                      placeholder="章节标题"
                      className="w-full h-7 px-2 rounded text-xs bg-background border border-border focus:outline-none focus:border-foreground/20 mb-1"
                      autoFocus
                    />
                    <input
                      value={newChapterSummary}
                      onChange={(e) => setNewChapterSummary(e.target.value)}
                      placeholder="摘要（可选）"
                      className="w-full h-7 px-2 rounded text-xs bg-background border border-border focus:outline-none focus:border-foreground/20 mb-1.5"
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={handleAddChapter}
                        disabled={!newChapterTitle.trim()}
                        className="h-6 px-3 rounded text-[10px] font-medium bg-foreground text-background border-none cursor-pointer disabled:opacity-50"
                      >
                        创建
                      </button>
                      <button
                        onClick={() => setAddChapterVolumeId(null)}
                        className="h-6 px-3 rounded text-[10px] text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}

                {volChapters.map(({ chapter, events }) => {
                  const isChExpanded = expandedChapters.has(chapter.id);
                  const chMinTs = events.length > 0 ? Math.min(...events.map((e) => e.storyTs)) : null;
                  const chMaxTs = events.length > 0 ? Math.max(...events.map((e) => e.storyTs)) : null;
                  const isChActive = chMinTs !== null && chMaxTs !== null &&
                    cursorTs >= chMinTs && cursorTs <= chMaxTs;

                  return (
                    <div key={`ch-${chapter.id}`}>
                      <div
                        className={cn(
                          'flex items-center gap-1 px-4 py-1 rounded-md cursor-pointer transition-all duration-200 group hover:scale-[1.02]',
                          isChActive
                            ? 'bg-foreground/[0.05] text-foreground/80'
                            : 'hover:bg-foreground/[0.04]',
                        )}
                        onClick={() => {
                          toggleChapter(chapter.id);
                          handleChapterClick(events);
                        }}
                      >
                        <button className="w-4 h-4 flex items-center justify-center bg-transparent border-none cursor-pointer text-muted-foreground/30">
                          {isChExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                        </button>
                        <span className="flex-1 text-[11px] text-foreground/60 truncate">
                          {chapter.title}
                        </span>
                        <Link
                          href={`/manuscript/book/${bookId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground/20 hover:text-foreground/50 transition-colors"
                          title="进入写作"
                        >
                          <PenLine size={10} />
                        </Link>
                        <span className="text-[9px] text-muted-foreground/40 tabular-nums">
                          {events.length}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditor('scene', null);
                          }}
                          className="w-4 h-4 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-muted-foreground/30 hover:text-foreground/50"
                          title="添加事件"
                        >
                          <Plus size={10} strokeWidth={2} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditor('chapter', chapter.id);
                          }}
                          className="w-3.5 h-3.5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground/60 hover:scale-110 opacity-0 group-hover:opacity-100 transition-all bg-transparent border-none cursor-pointer"
                          title="编辑章节"
                        >
                          <Pencil size={10} strokeWidth={1.8} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteChapterId(chapter.id);
                          }}
                          className="w-3.5 h-3.5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-red-500/60 hover:scale-110 opacity-0 group-hover:opacity-100 transition-all bg-transparent border-none cursor-pointer"
                          title="删除章节"
                        >
                          <Trash2 size={10} strokeWidth={1.8} />
                        </button>
                      </div>

                      {isChExpanded && (
                        <div>
                          {chapter.summary && (
                            <div className="px-8 py-1 text-[11px] leading-relaxed text-muted-foreground/50 max-h-20 overflow-hidden">
                              {chapter.summary}
                            </div>
                          )}
                          {events.map((event) => (
                            <div
                              key={`ev-${event.id}`}
                              className={cn(
                                'flex items-center gap-1 pl-8 pr-2 py-1 rounded-md cursor-pointer text-[11px] transition-colors',
                                event.storyTs <= cursorTs
                                  ? 'text-foreground/70 hover:bg-foreground/[0.04]'
                                  : 'text-muted-foreground/50 hover:bg-foreground/[0.02]',
                              )}
                              onClick={() => handleEventClick(event)}
                            >
                              <Circle
                                size={6}
                                className={cn(
                                  'flex-shrink-0',
                                  event.eventType === 'milestone'
                                    ? 'fill-foreground/60 text-foreground/60'
                                    : 'fill-muted-foreground/30 text-muted-foreground/30',
                                )}
                              />
                              <span className="flex-1 truncate">{event.title}</span>
                              {event.storyLabel && (
                                <span className="text-[9px] text-muted-foreground/40">{event.storyLabel}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {deleteVolumeId !== null && (
        <ConfirmDialog
          title="删除卷"
          message="确定要删除该卷吗？关联的章节和事件将被删除。"
          confirmLabel="删除"
          onConfirm={() => { removeVolume(deleteVolumeId); setDeleteVolumeId(null); }}
          onCancel={() => setDeleteVolumeId(null)}
        />
      )}

      {deleteChapterId !== null && (
        <ConfirmDialog
          title="删除章节"
          message="确定要删除该章节吗？关联的事件将被删除。"
          confirmLabel="删除"
          onConfirm={() => { removeChapter(deleteChapterId); setDeleteChapterId(null); }}
          onCancel={() => setDeleteChapterId(null)}
        />
      )}
    </div>
  );
}
