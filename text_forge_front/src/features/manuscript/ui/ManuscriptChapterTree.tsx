// src/features/manuscript/ui/ManuscriptChapterTree.tsx
'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChapterTree } from './ChapterTree';

interface ManuscriptChapterTreeProps {
  chapters: import('@/types/manuscript').ManuscriptChapter[];
  activeId: number | null;
  setActiveId: (id: number) => void;
  dragIndex: number | null;
  dragOverIndex: number | null;
  onDragStart: (index: number | null) => void;
  onDragOver: (e: React.DragEvent, i: number) => void;
  onDrop: (e: React.DragEvent, targetIndex: number) => void;
  onDragEnd: () => void;
  onChapterHover: (preview: { chapter: import('@/types/manuscript').ManuscriptChapter; top: number; left: number } | null) => void;
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
  focusMode: boolean;
}

export function ManuscriptChapterTree({
  chapters, activeId, setActiveId, dragIndex, dragOverIndex,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onChapterHover, onChapterLeave, hoverTimerRef,
  clearBlocked, setClearBlocked, deleteBlocked, setDeleteBlocked, pendingDeleteId, setPendingDeleteId,
  addChapter, getOrCreateDefaultVolume, syncChapterToServer, bookId, focusMode,
}: ManuscriptChapterTreeProps) {
  return (
    <AnimatePresence>
      {!focusMode && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 'auto', opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col min-h-0 gap-2 overflow-hidden"
        >
          <ChapterTree
            chapters={chapters}
            activeId={activeId}
            setActiveId={setActiveId}
            dragIndex={dragIndex}
            dragOverIndex={dragOverIndex}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            onChapterHover={onChapterHover}
            onChapterLeave={onChapterLeave}
            hoverTimerRef={hoverTimerRef}
            clearBlocked={clearBlocked}
            setClearBlocked={setClearBlocked}
            deleteBlocked={deleteBlocked}
            setDeleteBlocked={setDeleteBlocked}
            pendingDeleteId={pendingDeleteId}
            setPendingDeleteId={setPendingDeleteId}
            addChapter={addChapter}
            getOrCreateDefaultVolume={getOrCreateDefaultVolume}
            syncChapterToServer={syncChapterToServer}
            bookId={bookId}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
