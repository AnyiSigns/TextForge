'use client';

import { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useTimelineStore } from '@/features/map/stores/timelineStore';
import { useEditorStore } from '@/features/map/stores/editorStore';
import { EventDot } from './EventDot';
import { ChapterSegment } from './ChapterSegment';
import { VolumeSegment } from './VolumeSegment';
import { cn } from '@/shared/lib/cn';
import { Play, Pause, Square, Plus } from 'lucide-react';
import { useTimelinePlayback } from '@/features/map/hooks/useTimelinePlayback';

export function TimelineBar() {
  const volumes = useEntityStore((s) => s.volumes);
  const chapters = useEntityStore((s) => s.chapters);
  const sceneEvents = useEntityStore((s) => s.sceneEvents);
  const book = useEntityStore((s) => s.book);

  const cursorTs = useTimelineStore((s) => s.cursorTs);
  const setCursorTs = useTimelineStore((s) => s.setCursorTs);
  const selectedEventId = useTimelineStore((s) => s.selectedEventId);
  const setSelectedEvent = useTimelineStore((s) => s.setSelectedEvent);
  const snapThreshold = useTimelineStore((s) => s.snapThreshold);

  const openEditor = useEditorStore((s) => s.open);

  const updateSceneEvent = useEntityStore((s) => s.updateSceneEvent);
  const moveSceneEvent = useEntityStore((s) => s.moveSceneEvent);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const draggingRef = useRef(false);
  const draggingEventRef = useRef<{ id: number; startX: number; moved: boolean } | null>(null);

  // 计算全局时间范围
  const timeRange = useMemo(() => {
    const tss = sceneEvents.map((e) => e.storyTs);
    if (tss.length === 0) return { min: 0, max: 100, isUniform: true };
    const min = Math.min(...tss);
    const max = Math.max(...tss);
    return { min, max, isUniform: min === max };
  }, [sceneEvents]);

  // 准备事件时间戳给自动回放
  const eventTimestamps = useMemo(() =>
    [...sceneEvents]
      .sort((a, b) => a.storyTs - b.storyTs || a.sortOrder - b.sortOrder)
      .map((e) => e.storyTs),
    [sceneEvents],
  );

  const playState = useTimelineStore((s) => s.playState);
  const setPlayState = useTimelineStore((s) => s.setPlayState);

  const { start, pause, stop } = useTimelinePlayback(eventTimestamps, (ts) => {
    setCursorTs(ts);
  });

  // 每个章节的时间范围
  const chapterRanges = useMemo(() => {
    return chapters.map((ch) => {
      const events = sceneEvents.filter((e) => e.chapterId === ch.id);
      if (events.length === 0) {
        return { chapter: ch, minTs: 0, maxTs: 0, isEmpty: true, events: [] };
      }
      const minTs = Math.min(...events.map((e) => e.storyTs));
      const maxTs = Math.max(...events.map((e) => e.storyTs));
      return { chapter: ch, minTs, maxTs, isEmpty: false, events };
    });
  }, [chapters, sceneEvents]);

  // 每卷的时间范围和包含的章节
  const volumeRanges = useMemo(() => {
    return volumes.map((vol) => {
      const chRanges = chapterRanges.filter(
        (cr) => cr.chapter.volumeId === vol.id,
      );
      const allEvents = chRanges.filter((cr) => !cr.isEmpty).flatMap((cr) => cr.events);
      if (allEvents.length === 0) {
        return { volume: vol, minTs: 0, maxTs: 0, isEmpty: true, chapterRanges: chRanges };
      }
      const minTs = Math.min(...allEvents.map((e) => e.storyTs));
      const maxTs = Math.max(...allEvents.map((e) => e.storyTs));
      return { volume: vol, minTs, maxTs, isEmpty: false, chapterRanges: chRanges };
    });
  }, [volumes, chapterRanges]);

  const PADDING_X = 16;
  const innerWidth = containerWidth - PADDING_X * 2;

  const tsToX = useCallback(
    (ts: number) => {
      if (timeRange.isUniform) return PADDING_X + innerWidth * 0.5;
      return PADDING_X + ((ts - timeRange.min) / (timeRange.max - timeRange.min)) * innerWidth;
    },
    [timeRange, innerWidth],
  );

  const xToTs = useCallback(
    (x: number) => {
      if (timeRange.isUniform) return timeRange.min;
      return timeRange.min + ((x - PADDING_X) / innerWidth) * (timeRange.max - timeRange.min);
    },
    [timeRange, innerWidth],
  );

  const cursorX = tsToX(cursorTs);

  // 容器宽度监测
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(container);
    setContainerWidth(container.clientWidth);
    return () => observer.disconnect();
  }, []);

  // 拖动游标
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!draggingRef.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const clampedX = Math.max(PADDING_X, Math.min(PADDING_X + innerWidth, x));
        let ts = xToTs(clampedX);

        // 磁吸检测
        const snapPx = snapThreshold;
        let snapped = false;
        for (const event of sceneEvents) {
          const ex = tsToX(event.storyTs);
          if (Math.abs(clampedX - ex) <= snapPx) {
            ts = event.storyTs;
            setSelectedEvent(event.id);
            snapped = true;
            break;
          }
        }
        if (!snapped) {
          setSelectedEvent(null);
        }

        setCursorTs(ts);
      };

      const handleMouseUp = () => {
        draggingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [innerWidth, xToTs, snapThreshold, sceneEvents, setCursorTs, tsToX, setSelectedEvent],
  );

  // 点击事件点
  const handleEventClick = useCallback(
    (eventId: number, ts: number) => {
      setCursorTs(ts);
      setSelectedEvent(eventId);
      openEditor('scene', eventId);
    },
    [setCursorTs, setSelectedEvent, openEditor],
  );

  // 拖拽事件点重排：拖动时只更新本地时间轴位置，松手才落库
  const handleEventPointerDown = (event: (typeof sceneEvents)[number], e: React.PointerEvent) => {
    e.stopPropagation();
    draggingEventRef.current = { id: event.id, startX: e.clientX, moved: false };
    let lastTs = event.storyTs;
    const onMove = (ev: PointerEvent) => {
      if (!draggingEventRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const clampedX = Math.max(PADDING_X, Math.min(PADDING_X + innerWidth, x));
      lastTs = xToTs(clampedX);
      if (Math.abs(ev.clientX - draggingEventRef.current.startX) > 3) draggingEventRef.current.moved = true;
      moveSceneEvent(event.id, lastTs);
    };
    const onUp = () => {
      const drag = draggingEventRef.current;
      draggingEventRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!drag) return;
      if (drag.moved) {
        updateSceneEvent(drag.id, { storyTs: lastTs });
      } else {
        setCursorTs(event.storyTs);
        setSelectedEvent(drag.id);
        openEditor('scene', drag.id);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleChapterClick = useCallback(
    (minTs: number) => {
      setCursorTs(minTs);
      setSelectedEvent(null);
    },
    [setCursorTs, setSelectedEvent],
  );

  const cursorLabel = useMemo(() => {
    if (cursorTs <= 0) return '';
    const exact = sceneEvents.find((e) => e.storyTs === cursorTs);
    if (exact?.storyLabel) return exact.storyLabel;
    const candidates = sceneEvents
      .filter((e) => e.storyTs <= cursorTs)
      .sort((a, b) => b.storyTs - a.storyTs);
    return candidates[0]?.storyLabel ?? '';
  }, [cursorTs, sceneEvents]);

  const formatLabel = useCallback(
    (ts: number) => {
      const unit = book.timeUnit === 'day' ? '天' : book.timeUnit === 'year' ? '年' : '小时';
      const epoch = book.epochLabel ?? '';
      const val = Math.round(ts * 10) / 10;
      return `${epoch}${val}${unit}`;
    },
    [book],
  );

  if (sceneEvents.length === 0) {
    return (
      <div className="h-20 border-t border-border flex items-center justify-center text-xs text-muted-foreground/50">
        创建第一卷以开启时间线
      </div>
    );
  }

  return (
    <div className="h-24 border-t border-border flex flex-col bg-background select-none">
      {/* 上层：时间轴标度 */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
      >
        {/* 卷区间 */}
        {volumeRanges.map((vr) =>
          vr.isEmpty ? null : (
            <VolumeSegment
              key={vr.volume.id}
              label={vr.volume.title}
              xStart={tsToX(vr.minTs)}
              xEnd={tsToX(vr.maxTs)}
            />
          ),
        )}

        {/* 章区间 */}
        {chapterRanges.map((cr) =>
          cr.isEmpty ? (
            <ChapterSegment
              key={cr.chapter.id}
              label={cr.chapter.title}
              xStart={0}
              xEnd={0}
              isEmpty
            />
          ) : (
            <ChapterSegment
              key={cr.chapter.id}
              label={cr.chapter.title}
              xStart={tsToX(cr.minTs)}
              xEnd={tsToX(cr.maxTs)}
              isEmpty={false}
              onClick={() => handleChapterClick(cr.minTs)}
            />
          ),
        )}

        {/* 事件点 */}
        {sceneEvents.map((event) => (
          <EventDot
            key={event.id}
            event={event}
            x={tsToX(event.storyTs)}
            isSelected={selectedEventId === event.id}
            isActive={event.storyTs <= cursorTs}
            onPointerDown={(e) => handleEventPointerDown(event, e)}
          />
        ))}

        {/* 游标 */}
        <div
          className="absolute top-0 h-full w-px bg-foreground/80 cursor-ew-resize z-20"
          style={{
            left: cursorX,
            transition: draggingRef.current ? 'none' : 'left 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onMouseDown={handleMouseDown}
        >
          {/* 游标头部 */}
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-foreground/90 rounded-full shadow-sm" />
        </div>

        {/* 时间标签（两端） */}
        <div className="absolute bottom-0.5 left-4 text-[9px] tabular-nums text-muted-foreground/50">
          {formatLabel(timeRange.min)}
        </div>
        <div className="absolute bottom-0.5 right-4 text-[9px] tabular-nums text-muted-foreground/50">
          {formatLabel(timeRange.max)}
        </div>
      </div>

      {/* 下层：控制栏 */}
      <div className="h-7 border-t border-border/40 flex items-center justify-between px-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (playState === 'playing') {
                pause();
                setPlayState('paused');
              } else {
                start();
                setPlayState('playing');
              }
            }}
            className={cn(
              'w-5 h-5 flex items-center justify-center rounded transition-colors bg-transparent border-none cursor-pointer',
              playState === 'playing'
                ? 'text-foreground/70 bg-foreground/5'
                : 'text-muted-foreground/50 hover:text-foreground/60',
            )}
            title={playState === 'playing' ? '暂停' : '播放'}
          >
            {playState === 'playing' ? <Pause size={11} /> : <Play size={11} />}
          </button>
          {(playState === 'playing' || playState === 'paused') && (
            <button
              onClick={() => { stop(); setPlayState('idle'); }}
              className="w-5 h-5 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-muted-foreground/50 hover:text-foreground/60 transition-colors"
              title="停止"
            >
              <Square size={9} />
            </button>
          )}
          <span className="text-[10px] text-muted-foreground/40 ml-1">
            {cursorLabel || formatLabel(cursorTs)}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
          <button
            onClick={() => openEditor('scene', null)}
            className="w-5 h-5 flex items-center justify-center rounded bg-transparent border border-border/40 cursor-pointer text-muted-foreground/50 hover:text-foreground/60 hover:border-foreground/20 transition-colors"
            title="添加事件"
          >
            <Plus size={11} strokeWidth={1.5} />
          </button>
          <span>{book.title}</span>
          <span className="text-muted-foreground/30">|</span>
          <span>{book.totalWordGoal ?? 0 >= 10000 ? `${((book.totalWordGoal ?? 0) / 10000).toFixed(1)} 万字` : `${(book.totalWordGoal ?? 0).toLocaleString()} 字`}</span>
        </div>
      </div>
    </div>
  );
}
