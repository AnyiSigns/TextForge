'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { Save, History, AlertCircle } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useManuscriptStore } from './store';
import { VersionHistory } from '@/shared/ui/VersionHistory';
import { DiffView } from '@/shared/ui/DiffView';

export function EditorArea() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wordCount, setWordCount] = useState(0);

  const {
    activeChapterId, activeChapterTitle, content, version,
    dirty, saving, savedAt, showVersions, diffState,
    setContent, setChapterTitle, save,
    loadVersions, toggleVersions, clearDiff, showDiff, versions,
  } = useManuscriptStore();

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setWordCount(e.target.value.length);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void save(); }, 2000);
  }, [setContent, save]);

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      const cursor = textareaRef.current.selectionStart;
      textareaRef.current.value = content;
      textareaRef.current.selectionStart = cursor;
      textareaRef.current.selectionEnd = cursor;
    }
    setWordCount(content.length);
  }, [activeChapterId, content]);

  if (!activeChapterId) {
    return (
      <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
        从左侧选择章节开始写作
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <input
            value={activeChapterTitle}
            onChange={(e) => setChapterTitle(e.target.value)}
            className="text-sm font-medium bg-transparent border-none outline-none min-w-[150px]"
            placeholder="章节标题"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {dirty && <AlertCircle size={11} />}
            {saving ? <span className="animate-pulse">保存中...</span> : dirty ? '未保存' : `v${version} · 已保存`}
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
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className={cn('flex-1 flex', showVersions && 'border-r border-border')}>
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
            <VersionHistory versions={versions} currentVersion={version} onCompare={showDiff} onClose={toggleVersions} />
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
    </>
  );
}
