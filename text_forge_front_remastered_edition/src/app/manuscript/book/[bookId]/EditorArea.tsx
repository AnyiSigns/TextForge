'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { useManuscriptStore } from './store';
import { EditorToolbar } from './EditorToolbar';
import { SuggestHint } from './SuggestHint';
import { VersionHistory } from '@/shared/ui/VersionHistory';
import { DiffView } from '@/shared/ui/DiffView';
import { ImportBookDialog } from './ImportBookDialog';
import { ExportBookDialog } from './ExportBookDialog';
import { buildCharSuggestions, buildSettingKeywords, computeSuggestionsFor } from './suggestions';
import type { Suggestion, SuggestionKind } from './suggestions';
import * as contentsApi from '@/shared/api/contents';

interface SuggestState {
  items: Suggestion[];
  query: string;
  kind: SuggestionKind;
  index: number;
}

function parseBookText(text: string): { title: string; content: string }[] {
  const lines = text.split(/\r?\n/);
  const headingRe = /^\s*(第[一二三四五六七八九十百千0-9]+[章回卷节篇]|Chapter\s+\d+|[0-9]+[\.、]\s*.+)/i;
  const chapters: { title: string; lines: string[] }[] = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const line of lines) {
    if (headingRe.test(line.trim())) {
      current = { title: line.trim(), lines: [] };
      chapters.push(current);
    } else if (current) {
      current.lines.push(line);
    } else if (line.trim()) {
      current = { title: '正文', lines: [line] };
      chapters.push(current);
    }
  }
  return chapters.map((c, i) => ({
    title: c.title || `第 ${i + 1} 章`,
    content: c.lines.join('\n').trim(),
  }));
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function EditorArea() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selectionRangeRef = useRef<{ start: number; end: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [suggest, setSuggest] = useState<SuggestState | null>(null);
  const [importChapters, setImportChapters] = useState<{ title: string; content: string }[] | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const {
    content, activeChapterId, activeChapterTitle, version,
    showVersions, diffState, versions,
    setContent, save, toggleVersions, clearDiff, showDiff,
    characters, creativeSetting, suggestionFrequency,
    volumes, bookTitle,
  } = useManuscriptStore();

  const charSuggestions = buildCharSuggestions(characters);
  const settingKeywords = buildSettingKeywords(creativeSetting);
  const wordCount = content.length;

  const commitContent = useCallback((value: string) => {
    setContent(value);
    if (textareaRef.current) textareaRef.current.value = value;
  }, [setContent]);

  const showSuggest = (kind: SuggestionKind, query: string) => {
    const items = computeSuggestionsFor(kind, query, settingKeywords, charSuggestions);
    if (!items.length) { setSuggest(null); return; }
    setSuggest({ items, query, kind, index: 0 });
  };

  const applySuggestion = (s: Suggestion) => {
    if (!suggest || !textareaRef.current) return;
    if (s.kind === 'hint') { setSuggest(null); return; }
    const el = textareaRef.current;
    const value = el.value;
    const pos = el.selectionStart ?? value.length;
    const before = value.slice(0, pos);
    const trigger = suggest.kind === 'character' ? '@' : '#';
    const re = suggest.kind === 'character' ? /@[\u4e00-\u9fa5\w]*$/ : /#[\u4e00-\u9fa5\w]*$/;
    const replaced = before.replace(re, `${trigger}${s.label}`);
    const next = replaced + value.slice(pos);
    commitContent(next);
    setSuggest(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(replaced.length, replaced.length);
    });
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    const value = el.value;
    setContent(value);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void save(); }, 2000);

    const pos = el.selectionStart ?? value.length;
    const before = value.slice(0, pos);
    const at = before.match(/@[\u4e00-\u9fa5\w]*$/);
    const hash = before.match(/#[\u4e00-\u9fa5\w]*$/);
    if (at) {
      showSuggest('character', at[0].slice(1));
    } else if (hash) {
      showSuggest('setting', hash[0].slice(1));
    } else {
      setSuggest(null);
      if (suggestionFrequency !== 'off') {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const delay = suggestionFrequency === 'high' ? 300 : 1200;
        debounceRef.current = setTimeout(() => {
          const lastWord = before.match(/([\u4e00-\u9fa5\w]{2,})$/);
          if (lastWord) {
            const q = lastWord[1];
            const pool = [...charSuggestions, ...settingKeywords].filter((s) => s.label.includes(q));
            if (pool.length) setSuggest({ items: pool.slice(0, 6), query: q, kind: pool[0].kind, index: 0 });
          }
        }, delay);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!suggest) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSuggest((s) => (s ? { ...s, index: (s.index + 1) % s.items.length } : s));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSuggest((s) => (s ? { ...s, index: (s.index - 1 + s.items.length) % s.items.length } : s));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      applySuggestion(suggest.items[suggest.index]);
    } else if (e.key === 'Escape') {
      setSuggest(null);
    }
  };

  const updateSelection = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    selectionRangeRef.current = start === end ? null : { start, end };
    setSelectedText(start === end ? '' : el.value.substring(start, end));
  }, []);

  const dispatchTransform = useCallback((mode: string) => {
    const range = selectionRangeRef.current;
    const el = textareaRef.current;
    const text = range && el ? el.value.substring(range.start, range.end) : selectedText;
    if (!text.trim() || !range) return;
    window.dispatchEvent(new CustomEvent('textforge:transform-selection', { detail: { text, mode, start: range.start, end: range.end } }));
    setSelectedText('');
  }, [selectedText]);

  const dispatchReview = useCallback((mode: string) => {
    const range = selectionRangeRef.current;
    const el = textareaRef.current;
    const text = range && el ? el.value.substring(range.start, range.end) : selectedText;
    if (!text.trim() || !range) return;
    window.dispatchEvent(new CustomEvent('textforge:review-selection', { detail: { text, mode, start: range.start, end: range.end } }));
    setSelectedText('');
  }, [selectedText]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    const onApply = (e: Event) => {
      const d = (e as CustomEvent).detail as { chapterId: number; content: string } | undefined;
      if (!d?.chapterId || !d.content) return;
      void contentsApi.saveContent(d.chapterId, d.content).then((saved) => {
        if (d.chapterId === activeChapterId) {
          commitContent(d.content);
          useManuscriptStore.setState({ version: saved.version, savedAt: saved.createdAt, dirty: false });
        }
      }).catch(() => {});
    };
    window.addEventListener('textforge:apply-chapter-content', onApply);
    return () => window.removeEventListener('textforge:apply-chapter-content', onApply);
  }, [activeChapterId, commitContent]);

  useEffect(() => {
    const onReplace = (e: Event) => {
      const d = (e as CustomEvent).detail as { start: number; end: number; content: string } | undefined;
      if (!d) return;
      const el = textareaRef.current;
      const value = el ? el.value : content;
      const next = value.slice(0, d.start) + d.content + value.slice(d.end);
      commitContent(next);
      if (el) {
        requestAnimationFrame(() => {
          const caret = d.start + d.content.length;
          el.focus();
          el.setSelectionRange(caret, caret);
        });
      }
    };
    window.addEventListener('textforge:apply-selection-replace', onReplace);
    return () => window.removeEventListener('textforge:apply-selection-replace', onReplace);
  }, [content, commitContent]);

  useEffect(() => {
    if (textareaRef.current) {
      const cursor = textareaRef.current.selectionStart;
      textareaRef.current.value = content;
      textareaRef.current.selectionStart = cursor;
      textareaRef.current.selectionEnd = cursor;
    }
  }, [activeChapterId, content]);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      setImportChapters(parseBookText(text));
    };
    reader.readAsText(file);
  };

  const handleExport = async (format: 'txt' | 'markdown') => {
    const lines: string[] = [];
    for (const vol of volumes) {
      for (const ch of vol.chapters) {
        let body = '';
        try {
          body = (await contentsApi.fetchLatestContent(ch.id)).content || '';
        } catch { /* ignore */ }
        if (format === 'markdown') {
          lines.push(`# ${ch.title}`, '', body, '');
        } else {
          lines.push(ch.title, '', body, '');
        }
      }
    }
    const ext = format === 'markdown' ? 'md' : 'txt';
    downloadText(`${bookTitle || '手稿'}.${ext}`, lines.join('\n'));
    setExportOpen(false);
  };

  if (!activeChapterId) {
    return (
      <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
        从左侧选择章节开始写作
      </div>
    );
  }

  return (
    <>
      <EditorToolbar
        wordCount={wordCount}
        onImportClick={() => fileRef.current?.click()}
        onExportClick={() => setExportOpen(true)}
      />
      <div className="px-4 pt-2">
        <SuggestHint />
      </div>

      <div className="flex flex-1 min-h-0">
        <div className={cn('relative flex-1 flex', showVersions && 'border-r border-border')}>
          <textarea
            ref={textareaRef}
            defaultValue={content}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onSelect={updateSelection}
            onMouseUp={updateSelection}
            onKeyUp={updateSelection}
            placeholder="在此创作…"
            className="flex-1 w-full resize-none outline-none border-none p-6 text-[15px] leading-relaxed font-[var(--font-serif),serif] bg-background theme-surface"
            spellCheck={false}
          />

          {suggest && (
            <div className="absolute top-3 left-4 z-30 w-60 rounded-md border border-border bg-background shadow-lg max-h-56 overflow-y-auto">
              {suggest.items.map((s, i) => (
                <button
                  key={`${s.kind}-${s.label}-${i}`}
                  onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-[13px] flex items-center gap-2',
                    i === suggest.index ? 'bg-[var(--sidebar-hover)]' : 'hover:bg-[var(--sidebar-hover)]',
                  )}
                >
                  <span className="text-muted-foreground text-xs w-4 shrink-0">
                    {s.kind === 'character' ? '@' : s.kind === 'setting' ? '#' : '·'}
                  </span>
                  <span className="flex-1 truncate">{s.label}</span>
                  {s.detail && <span className="text-[11px] text-muted-foreground/70 truncate max-w-[120px]">{s.detail}</span>}
                </button>
              ))}
            </div>
          )}

          {selectedText.trim() && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 shadow-md"
            >
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

      <input
        ref={fileRef}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={handleImportFile}
      />

      {importChapters && (
        <ImportBookDialog
          open={!!importChapters}
          onOpenChange={(o) => { if (!o) setImportChapters(null); }}
          bookName={activeChapterTitle || bookTitle || '手稿'}
          chapters={importChapters}
          onConfirm={async () => {
            await useManuscriptStore.getState().importBook(importChapters);
            setImportChapters(null);
          }}
        />
      )}

      <ExportBookDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        onExport={handleExport}
      />
    </>
  );
}
