'use client';

import { ChevronRight, FileText } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useManuscriptStore } from './store';

export function ChapterTree() {
  const chapters = useManuscriptStore((s) => s.chapters);
  const bookTitle = useManuscriptStore((s) => s.bookTitle);
  const activeChapterId = useManuscriptStore((s) => s.activeChapterId);
  const setActiveChapter = useManuscriptStore((s) => s.setActiveChapter);

  const handleClick = (item: typeof chapters[number]) => {
    if (item.type === 'volume') return;
    if (item.chapterId) setActiveChapter(item.chapterId);
  };

  return (
    <div className="flex flex-col h-full py-2">
      <div className="px-3 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {bookTitle || '手稿'}
      </div>
      {chapters.map((item) => (
        <div
          key={`${item.type}-${item.id}`}
          onClick={() => handleClick(item)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-[13px] hover:bg-[var(--sidebar-hover)] transition-colors',
            item.type === 'volume' ? 'font-medium text-foreground/80' : '',
            activeChapterId === item.chapterId ? 'bg-[var(--sidebar-hover)] text-foreground font-medium' : '',
          )}
          role="button"
          tabIndex={0}
        >
          {item.type === 'volume' ? (
            <ChevronRight size={11} className="text-muted-foreground shrink-0" />
          ) : (
            <FileText size={10} className="text-muted-foreground shrink-0 ml-2.5" />
          )}
          <span className="truncate">{item.title}</span>
        </div>
      ))}
    </div>
  );
}
