'use client';

import { useEffect, use } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/shared/lib/cn';
import { useManuscriptStore } from './store';
import { ChapterTree } from './ChapterTree';
import { EditorArea } from './EditorArea';

export default function ManuscriptPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId: bookIdStr } = use(params);
  const bookId = parseInt(bookIdStr, 10);
  const bookTitle = useManuscriptStore((s) => s.bookTitle);
  const chapters = useManuscriptStore((s) => s.chapters);
  const loadBook = useManuscriptStore((s) => s.loadBook);

  useEffect(() => { void loadBook(bookId); }, [bookId, loadBook]);

  if (chapters.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0">
        <Link href={`/books/${bookId}`} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5">
          <ArrowLeft size={16} />
          <span className="text-sm">{bookTitle || '手稿'}</span>
        </Link>
      </div>

      <div className={cn('flex flex-1 min-h-0', 'ide-grid')}>
        <div className="w-[260px] shrink-0 border-r border-border overflow-y-auto">
          <ChapterTree />
        </div>
        <main className="flex-1 flex flex-col min-w-0">
          <EditorArea />
        </main>
      </div>
    </div>
  );
}
