'use client';

import { useState, useRef } from 'react';
import { Plus, Trash2, FileText, ChevronRight, ChevronDown, BookPlus } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useManuscriptStore } from './store';

export function ChapterTree() {
  const chapters = useManuscriptStore((s) => s.chapters);
  const bookTitle = useManuscriptStore((s) => s.bookTitle);
  const activeChapterId = useManuscriptStore((s) => s.activeChapterId);
  const setActiveChapter = useManuscriptStore((s) => s.setActiveChapter);
  const addChapter = useManuscriptStore((s) => s.addChapter);
  const addVolume = useManuscriptStore((s) => s.addVolume);
  const removeChapter = useManuscriptStore((s) => s.removeChapter);
  const reorderChapters = useManuscriptStore((s) => s.reorderChapters);
  const requestHoverPreview = useManuscriptStore((s) => s.requestHoverPreview);
  const clearHoverPreview = useManuscriptStore((s) => s.clearHoverPreview);

  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleVolume = (volumeId: number) =>
    setCollapsed((c) => ({ ...c, [volumeId]: !c[volumeId] }));

  const handleHover = (chapterId: number, title: string, e: React.MouseEvent) => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    const el = e.currentTarget as HTMLElement;
    hoverTimerRef.current = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      requestHoverPreview(
        chapterId,
        title,
        rect.bottom + 6,
        Math.min(rect.left, window.innerWidth - 280),
      );
    }, 600);
  };

  const handleLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => clearHoverPreview(), 200);
  };

  const volumes = chapters.filter((c) => c.type === 'volume');

  return (
    <div className="flex flex-col h-full py-2">
      <div className="flex items-center justify-between px-3 pb-1 shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
          {bookTitle || '手稿'}
        </span>
        <button
          onClick={() => { void addVolume(); }}
          className="flex items-center gap-1 h-6 px-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--sidebar-hover)] transition-colors cursor-pointer"
          title="添加卷"
        >
          <BookPlus size={13} />
          <Plus size={12} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2">
        {volumes.map((vol) => {
          const volumeId = vol.volumeId as number;
          const isCollapsed = collapsed[volumeId];
          const volChapters = chapters.filter((c) => c.volumeId === volumeId && c.type === 'chapter');
          return (
            <div key={`volume-${volumeId}`} className="mb-1">
              <div className="group flex items-center gap-1 px-1.5 py-1.5 rounded-md hover:bg-[var(--sidebar-hover)]">
                <button
                  onClick={() => toggleVolume(volumeId)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wide bg-transparent border-none cursor-pointer"
                  title={isCollapsed ? '展开' : '折叠'}
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  <span className="truncate max-w-[120px]">{vol.title}</span>
                </button>
                <span className="text-[10px] text-muted-foreground/50">{volChapters.length}</span>
                <button
                  onClick={() => { void addChapter(volumeId); }}
                  className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--sidebar-hover)] cursor-pointer bg-transparent border-none"
                  title="在本卷添加章节"
                >
                  <Plus size={13} />
                </button>
              </div>

              {!isCollapsed && (
                <div className="space-y-0.5 mt-0.5">
                  {volChapters.map((item) => {
                    const chapterId = item.chapterId as number;
                    return (
                      <div
                        key={`chapter-${chapterId}`}
                        draggable
                        onDragStart={() => setDragId(chapterId)}
                        onDragOver={(e) => { e.preventDefault(); setDragOverId(chapterId); }}
                        onDrop={(e) => { e.preventDefault(); if (dragId != null) void reorderChapters(dragId, chapterId); setDragId(null); setDragOverId(null); }}
                        onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                        onMouseEnter={(e) => handleHover(chapterId, item.title, e)}
                        onMouseLeave={handleLeave}
                        className={cn(
                          'group flex items-center gap-1.5 pl-5 pr-2.5 py-1.5 rounded-md cursor-grab active:cursor-grabbing text-[13px] transition-colors',
                          activeChapterId === chapterId ? 'bg-[var(--sidebar-hover)] text-foreground font-medium' : 'text-foreground/80 hover:bg-[var(--sidebar-hover)]',
                          dragOverId === chapterId && dragId !== chapterId && 'ring-1 ring-foreground/30',
                          dragId === chapterId && 'opacity-50',
                        )}
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveChapter(chapterId)}
                      >
                        <FileText size={11} className="text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate">{item.title}</span>
                        <button
                          type="button"
                          aria-label="删除章节"
                          onClick={(e) => { e.stopPropagation(); setPendingDeleteId(chapterId); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0 cursor-pointer bg-transparent border-none p-0.5"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                  {volChapters.length === 0 && (
                    <div className="pl-5 pr-2 py-1 text-[11px] text-muted-foreground/50">暂无章节</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pendingDeleteId != null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/70" onClick={() => setPendingDeleteId(null)}>
          <div className="w-64 rounded-lg border border-border bg-background p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm mb-3">确定删除该章节？此操作不可撤销。</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingDeleteId(null)}
                className="h-7 px-3 rounded-md text-xs border border-border cursor-pointer bg-transparent hover:bg-muted"
              >
                取消
              </button>
              <button
                onClick={() => { void removeChapter(pendingDeleteId); setPendingDeleteId(null); }}
                className="h-7 px-3 rounded-md text-xs font-medium bg-foreground text-background border-none cursor-pointer hover:opacity-90"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
