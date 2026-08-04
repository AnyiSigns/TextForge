'use client';

import { useState, useMemo, useEffect } from 'react';
import { ChevronRight, ChevronDown, Circle, PenLine } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/shared/lib/cn';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useTimelineStore } from '@/features/map/stores/timelineStore';
import { useEditorStore } from '@/features/map/stores/editorStore';

export function OutlineTree() {
  const volumes = useEntityStore((s) => s.volumes);
  const chapters = useEntityStore((s) => s.chapters);
  const sceneEvents = useEntityStore((s) => s.sceneEvents);
  const cursorTs = useTimelineStore((s) => s.cursorTs);
  const setCursorTs = useTimelineStore((s) => s.setCursorTs);
  const openEditor = useEditorStore((s) => s.open);

  const [expandedVolumes, setExpandedVolumes] = useState<Set<number>>(new Set([1]));
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());

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

  // 双向同步：游标滑动 → 大纲树自动展开高亮当前章
  useEffect(() => {
    if (cursorTs <= 0) return;
    // 找到包含当前 cursorTs 的章节
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

  return (
    <div className="space-y-0.5">
      {volumeData.map(({ volume, chapters: volChapters }) => {
        const isVolExpanded = expandedVolumes.has(volume.id);
        return (
          <div key={`vol-${volume.id}`}>
            <div
              className="flex items-center gap-1 px-1 py-1.5 rounded-md cursor-pointer hover:bg-foreground/[0.03]"
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
            </div>

            {isVolExpanded && volChapters.map(({ chapter, events }) => {
              const isChExpanded = expandedChapters.has(chapter.id);
              const chMinTs = events.length > 0 ? Math.min(...events.map((e) => e.storyTs)) : null;
              const chMaxTs = events.length > 0 ? Math.max(...events.map((e) => e.storyTs)) : null;
              const isChActive = chMinTs !== null && chMaxTs !== null &&
                cursorTs >= chMinTs && cursorTs <= chMaxTs;

              return (
                <div key={`ch-${chapter.id}`}>
                  <div
                    className={cn(
                      'flex items-center gap-1 px-4 py-1 rounded-md cursor-pointer transition-colors',
                      isChActive
                        ? 'bg-foreground/[0.05] text-foreground/80'
                        : 'hover:bg-foreground/[0.03]',
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
                      href={`/manuscript`}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground/20 hover:text-foreground/50 transition-colors"
                      title="进入写作"
                    >
                      <PenLine size={10} />
                    </Link>
                    <span className="text-[9px] text-muted-foreground/40 tabular-nums">




                      {events.length}
                    </span>
                    {/* 「+」按钮 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditor('scene', null);
                      }}
                      className="w-4 h-4 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-muted-foreground/30 hover:text-foreground/50"
                      title="添加事件"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  </div>

                  {isChExpanded && events.map((event) => (
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
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
