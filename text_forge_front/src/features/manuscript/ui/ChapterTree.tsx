// src/features/manuscript/ui/ChapterTree.tsx
'use client';

import { Button } from '@/components/ui/button';
import { ArrowLeft, LinkIcon, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { ManuscriptChapter } from '@/types/manuscript';

interface ChapterTreeProps {
  chapters: ManuscriptChapter[];
  activeId: number | null;
  setActiveId: (id: number) => void;
  dragIndex: number | null;
  dragOverIndex: number | null;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, targetIndex: number) => void;
  onDragEnd: () => void;
  onChapterHover: (preview: { chapter: ManuscriptChapter; top: number; left: number }) => void;
  onChapterLeave: () => void;
  hoverTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  clearBlocked: boolean;
  setClearBlocked: (v: boolean) => void;
  deleteBlocked: boolean;
  setDeleteBlocked: (v: boolean) => void;
  pendingDeleteId: number | null;
  setPendingDeleteId: (id: number | null) => void;
  addChapter: (bookId: number, title?: string) => Promise<{ id: number }>;
  getOrCreateDefaultVolume: (bookId: number) => Promise<number>;
  syncChapterToServer: (localId: number, volumeId: number) => Promise<number | null>;
  bookId: string | number;
}

export function ChapterTree(props: ChapterTreeProps) {
  const {
    chapters, activeId, setActiveId,
    dragIndex, dragOverIndex,
    onDragStart, onDragOver, onDrop, onDragEnd,
    onChapterHover, onChapterLeave, hoverTimerRef,
    clearBlocked, setClearBlocked,
    deleteBlocked, setDeleteBlocked,
    pendingDeleteId, setPendingDeleteId,
    addChapter, getOrCreateDefaultVolume, syncChapterToServer,
    bookId,
  } = props;

  const handleChapterHover = (c: ManuscriptChapter, e: React.MouseEvent) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      onChapterHover?.({
        chapter: c,
        top: rect.bottom + 6,
        left: Math.min(rect.left, window.innerWidth - 220),
      });
    }, 800);
  };

  return (
    <div className="flex flex-col min-h-0 gap-2 overflow-hidden">
      <div className="flex items-center justify-between px-1 shrink-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">章节</span>
        <div className="flex items-center gap-1">
          {chapters.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive/70 hover:text-destructive" onClick={() => setClearBlocked(true)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => addChapter(Number(bookId)).then((c) => setActiveId(c.id))}>
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div className="max-h-[28vh] lg:max-h-none lg:h-full min-h-0 pr-1 rounded-2xl border border-border/40 bg-background/40 overflow-y-auto">
        <div className="space-y-1 p-2">
          {chapters.map((c, i) => (
            <div
              key={c.id}
              draggable
              onDragStart={() => onDragStart(i)}
              onDragOver={(e) => onDragOver(e, i)}
              onDrop={(e) => onDrop(e, i)}
              onDragEnd={onDragEnd}
              onMouseEnter={(e) => handleChapterHover(c, e)}
              onMouseLeave={onChapterLeave}
              className={cn(
                'group w-full text-left px-3 py-2 rounded-xl border text-sm transition-all flex items-center gap-2 cursor-grab active:cursor-grabbing',
                dragIndex === i && 'scale-[1.03] shadow-lg shadow-black/20 border-primary/40',
                dragOverIndex === i && dragIndex !== i && 'border-primary/60 shadow-[0_0_0_1px_rgba(59,130,246,0.5)]',
                c.id === activeId ? 'border-primary/40 bg-primary/[0.06]' : 'border-transparent hover:bg-accent/30',
              )}
            >
               <button className="flex-1 min-w-0 flex items-center gap-2 text-left" onClick={() => setActiveId(c.id)}>
                 <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}</span>
                 <span className="flex-1 truncate">{c.title}</span>
                 {c.source === 'ai' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 shrink-0" title="由 AI 生成，可继续人写">AI</span>}
                 {c.source === 'ai_edited' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 shrink-0" title="AI 生成后经手工修改">AI改</span>}
                 {c.source === 'manual' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-border/40 text-muted-foreground shrink-0" title="纯手工撰写">手工</span>}
                 {c.source === 'imported' && <ArrowLeft className="w-3 h-3 text-muted-foreground shrink-0" />}
               </button>
               <button
                 type="button"
                 aria-label={c.serverChapterId ? '已关联到工作台' : '关联到工作台'}
                 onClick={async () => {
                   if (c.serverChapterId) return;
                   const volumeId = await getOrCreateDefaultVolume(Number(bookId));
                   await syncChapterToServer(c.id, volumeId);
                   toast.success('已关联到工作台章节');
                 }}
                 className={`opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ${c.serverChapterId ? 'text-green-500' : 'text-muted-foreground hover:text-primary'}`}
               >
                 <LinkIcon className="w-3.5 h-3.5" />
               </button>
               <button
                 type="button"
                 aria-label="删除章节"
                 onClick={() => setPendingDeleteId(c.id)}
                 className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
               >
                 <Trash2 className="w-3.5 h-3.5" />
               </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
