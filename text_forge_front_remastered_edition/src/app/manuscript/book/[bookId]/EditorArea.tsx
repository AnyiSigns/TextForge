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
  const [selectedText, setSelectedText] = useState('');

  const updateSelection = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    setSelectedText(start === end ? '' : el.value.substring(start, end));
  }, []);

  const dispatchTransform = useCallback((mode: string) => {
    if (!selectedText.trim()) return;
    window.dispatchEvent(
      new CustomEvent('textforge:transform-selection', { detail: { text: selectedText, mode } }),
    );
    setSelectedText('');
  }, [selectedText]);

  const dispatchReview = useCallback((mode: string) => {
    if (!selectedText.trim()) return;
    window.dispatchEvent(
      new CustomEvent('textforge:review-selection', { detail: { text: selectedText, mode } }),
    );
    setSelectedText('');
  }, [selectedText]);

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
          {activeChapterId && (
            <>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('textforge:chapter-agent', { detail: { chapterId: activeChapterId, action: 'read' } }))}
                className="flex items-center gap-1 h-7 px-3 rounded-md text-xs font-medium border border-border cursor-pointer bg-transparent hover:bg-muted"
              >
                让 Agent 接管本章
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('textforge:chapter-agent', { detail: { chapterId: activeChapterId, action: 'write' } }))}
                className="flex items-center gap-1 h-7 px-3 rounded-md text-xs font-medium border border-border cursor-pointer bg-transparent hover:bg-muted"
              >
                写入本章
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className={cn('relative flex-1 flex', showVersions && 'border-r border-border')}>
          <textarea
            ref={textareaRef}
            defaultValue={content}
            onChange={handleChange}
            onSelect={updateSelection}
            onMouseUp={updateSelection}
            onKeyUp={updateSelection}
            placeholder="在此创作…"
            className="flex-1 w-full resize-none outline-none border-none p-6 text-[15px] leading-relaxed font-[var(--font-serif),serif] bg-background"
            spellCheck={false}
          />
        </div>

        {selectedText.trim() && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 shadow-md">
            <button onClick={() => dispatchTransform('polish')} className="h-6 px-2 rounded text-[11px] border-none cursor-pointer bg-transparent hover:bg-muted">润色</button>
            <button onClick={() => dispatchTransform('expand')} className="h-6 px-2 rounded text-[11px] border-none cursor-pointer bg-transparent hover:bg-muted">扩写</button>
            <button onClick={() => dispatchTransform('rewrite')} className="h-6 px-2 rounded text-[11px] border-none cursor-pointer bg-transparent hover:bg-muted">改写</button>
            <button onClick={() => dispatchTransform('summarize')} className="h-6 px-2 rounded text-[11px] border-none cursor-pointer bg-transparent hover:bg-muted">摘要</button>
            <button onClick={() => dispatchTransform('alternatives')} className="h-6 px-2 rounded text-[11px] border-none cursor-pointer bg-transparent hover:bg-muted">替代表达</button>
            <span className="mx-0.5 h-3 w-px bg-border" />
            <button onClick={() => dispatchReview('grammar')} className="h-6 px-2 rounded text-[11px] border-none cursor-pointer bg-transparent hover:bg-muted">语法</button>
            <button onClick={() => dispatchReview('consistency')} className="h-6 px-2 rounded text-[11px] border-none cursor-pointer bg-transparent hover:bg-muted">一致性</button>
          </div>
        )}

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
