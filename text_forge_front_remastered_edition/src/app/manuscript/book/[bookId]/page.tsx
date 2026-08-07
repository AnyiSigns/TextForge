'use client';

import { useEffect, use, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useManuscriptStore } from './store';
import { ChapterTree } from './ChapterTree';
import { EditorArea } from './EditorArea';
import { ChapterHoverPreview } from './ChapterHoverPreview';
import { AgentDock } from '@/features/agent/AgentDock';

export default function ManuscriptPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId: bookIdStr } = use(params);
  const bookId = parseInt(bookIdStr, 10);
  const bookTitle = useManuscriptStore((s) => s.bookTitle);
  const loading = useManuscriptStore((s) => s.loading);
  const error = useManuscriptStore((s) => s.error);
  const loadBook = useManuscriptStore((s) => s.loadBook);
  const focusMode = useManuscriptStore((s) => s.focusMode);
  const treeWidth = useManuscriptStore((s) => s.treeWidth);
  const setTreeWidth = useManuscriptStore((s) => s.setTreeWidth);

  const draggingRef = useRef(false);

  useEffect(() => { void loadBook(bookId); }, [bookId, loadBook]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingRef.current) setTreeWidth(e.clientX);
    };
    const onUp = () => { draggingRef.current = false; document.body.style.cursor = ''; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setTreeWidth]);

  const startDrag = () => {
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="text-sm text-muted-foreground">{error}</div>
        <button
          onClick={() => loadBook(bookId)}
          className="h-8 px-4 rounded-md text-xs font-medium bg-foreground text-background hover:opacity-90 border-none cursor-pointer"
        >
          重试
        </button>
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

      <div className="flex flex-1 min-h-0">
        {!focusMode && (
          <div
            style={{ width: treeWidth }}
            className="shrink-0 border-r border-border overflow-hidden flex flex-col transition-[width] duration-75"
          >
            <ChapterTree />
          </div>
        )}
        {!focusMode && (
          <div
            onMouseDown={startDrag}
            className="w-1 shrink-0 cursor-col-resize bg-border/40 hover:bg-foreground/30 transition-colors"
            title="拖动调整侧栏宽度"
          />
        )}
        <main className="flex-1 flex flex-col min-w-0">
          <EditorArea />
        </main>
      </div>

      <AgentDock />
      <ChapterHoverPreview />
    </div>
  );
}
