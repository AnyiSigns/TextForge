// src/features/manuscript/ui/ChapterHoverPreview.tsx
'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { ManuscriptChapter } from '@/types';

interface ChapterHoverPreviewProps {
  preview: { chapter: ManuscriptChapter; top: number; left: number } | null;
}

export function ChapterHoverPreview({ preview }: ChapterHoverPreviewProps) {
  return (
    <AnimatePresence>
      {preview && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          className="fixed z-50 w-64 max-h-48 overflow-y-auto rounded-xl border border-border/60 bg-popover/95 backdrop-blur shadow-elegant p-3 text-xs leading-relaxed"
          style={{ top: preview.top, left: preview.left }}
        >
          <p className="font-medium text-foreground mb-1 truncate">{preview.chapter.title}</p>
          <p className="text-muted-foreground whitespace-pre-wrap line-clamp-5">
            {preview.chapter.content?.slice(0, 300) || '（暂无内容）'}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
