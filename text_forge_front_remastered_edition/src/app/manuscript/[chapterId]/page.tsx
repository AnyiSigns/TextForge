'use client';

import { useEffect, use, useRef, useCallback, useState } from 'react';
import { ArrowLeft, Save, History, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/shared/lib/cn';
import { useManuscriptStore } from './store';
import { VersionHistory } from '@/shared/ui/VersionHistory';
import { DiffView } from '@/shared/ui/DiffView';
import * as booksApi from '@/shared/api/books';
import type { Chapter } from '@/shared/api/types';

export default function ManuscriptPage({ params }: { params: Promise<{ chapterId: string }> }) {
  const { chapterId: chapterIdStr } = use(params);
  const chapterId = parseInt(chapterIdStr, 10);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    title, content, version, dirty, saving, savedAt,
    showVersions, diffState,
    load, save, setContent, setTitle,
    versions: versionList, loadVersions, toggleVersions, clearDiff, showDiff,
  } = useManuscriptStore();

  useEffect(() => {
    void load(chapterId);
    booksApi.fetchChaptersTree(chapterId).then((vols) => {
      for (const v of vols) {
        const ch = v.chapters.find((c) => c.id === chapterId);
        if (ch) { setChapter(ch); break; }
      }
    }).catch(() => {});
  }, [chapterId, load]);

  useEffect(() => {
    if (savedAt) {
      const timer = setInterval(() => {
        const content = textareaRef.current?.value || '';
        setWordCount(content.length);
      }, 500);
      return () => clearInterval(timer);
    }
  }, [savedAt]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    setWordCount(val.length);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void save(); }, 2000);
  }, [setContent, save]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} />
          </Link>
          <div className="flex items-center gap-2">
            <input
              value={title || chapter?.title || ''}
              onChange={(e) => setTitle(e.target.value)}
              className="text-sm font-medium bg-transparent border-none outline-none min-w-[200px] placeholder:text-muted-foreground"
              placeholder="章节标题"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {dirty && <AlertCircle size={12} className="text-muted-foreground/60" />}
            {saving ? (
              <span className="animate-pulse">保存中...</span>
            ) : dirty ? (
              <span>未保存</span>
            ) : (
              <span>已保存 · v{version}</span>
            )}
            <span className="tabular-nums">{wordCount.toLocaleString()} 字</span>
          </div>
          <button
            onClick={() => { void save(); }}
            disabled={!dirty || saving}
            className="flex items-center gap-1 h-7 px-3 rounded-md bg-foreground text-background text-xs font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-30"
          >
            <Save size={12} /> 保存
          </button>
          <button
            onClick={() => { void loadVersions(); toggleVersions(); }}
            className={cn(
              'flex items-center gap-1 h-7 px-3 rounded-md text-xs font-medium border cursor-pointer transition-colors',
              showVersions ? 'bg-foreground text-background border-foreground' : 'bg-transparent border-border hover:bg-muted',
            )}
          >
            <History size={12} /> 版本
          </button>
          <span className="text-[10px] text-muted-foreground/60">
            {chapter ? `${chapter.volumeId ? `V${chapter.volumeId} · ` : ''}排序 #${chapter.sortOrder}` : ''}
          </span>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className={cn('flex-1 flex flex-col min-w-0', showVersions && 'border-r border-border')}>
          <textarea
            ref={textareaRef}
            defaultValue={content}
            onChange={handleChange}
            placeholder="在此创作…"
            className="flex-1 w-full resize-none outline-none border-none p-6 text-[15px] leading-relaxed font-[var(--font-serif),serif] bg-background"
            spellCheck={false}
          />
        </div>

        {showVersions && (
          <div className="w-[300px] shrink-0 overflow-y-auto">
            <VersionHistory versions={versionList} currentVersion={version} onCompare={showDiff} onClose={toggleVersions} />
          </div>
        )}
      </div>

      {diffState && (
        <DiffView
          fromContent={diffState.fromContent}
          toContent={diffState.toContent}
          fromVersion={diffState.fromVersion}
          toVersion={diffState.toVersion}
          onClose={clearDiff}
        />
      )}
    </div>
  );
}
