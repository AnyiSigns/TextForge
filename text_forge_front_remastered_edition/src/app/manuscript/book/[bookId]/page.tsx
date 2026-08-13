'use client';

import { useEffect, use, useRef, useState } from 'react';
import { ArrowLeft, ListTree, X } from 'lucide-react';
import Link from 'next/link';
import { useManuscriptStore } from './store';
import { useBookDetailStore } from '@/app/(dashboard)/books/[id]/store';
import { useMediaQuery } from '@/hooks/useMediaQuery';
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
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [treeOpenMobile, setTreeOpenMobile] = useState(false);

  useEffect(() => { void loadBook(bookId); }, [bookId, loadBook]);

  // 1.3：手稿页同步 useBookDetailStore.bookId（AgentDock 依赖它做书籍绑定/锁预检；
  // 直开/切书场景 store 可能仍是 0 或上一本书）
  const setBookId = useBookDetailStore((s) => s.setBookId);
  useEffect(() => { setBookId(bookId); }, [bookId, setBookId]);

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
        {isMobile && (
          <button
            type="button"
            onClick={() => setTreeOpenMobile(!treeOpenMobile)}
            className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer shrink-0"
            aria-label={treeOpenMobile ? '关闭章节目录' : '打开章节目录'}
          >
            {treeOpenMobile ? <X size={16} /> : <ListTree size={16} />}
          </button>
        )}
        <Link href={`/books/${bookId}`} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5">
          <ArrowLeft size={16} />
          <span className="text-sm">{bookTitle || '手稿'}</span>
        </Link>
      </div>

      <div className="flex flex-1 min-h-0">
        {!focusMode && !isMobile && (
          <div
            style={{ width: treeWidth }}
            className="shrink-0 border-r border-border overflow-hidden flex flex-col transition-[width] duration-75"
          >
            <ChapterTree />
          </div>
        )}
        {!focusMode && !isMobile && (
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

      {/* 移动端：章节目录抽屉覆盖层 */}
      {isMobile && treeOpenMobile && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/35" onClick={() => setTreeOpenMobile(false)} />
          <div className="absolute inset-y-0 left-0 w-[min(20rem,85vw)] shadow-2xl bg-background">
            <ChapterTree />
          </div>
        </div>
      )}

      <AgentDock />
      <ChapterHoverPreview />
    </div>
  );
}
