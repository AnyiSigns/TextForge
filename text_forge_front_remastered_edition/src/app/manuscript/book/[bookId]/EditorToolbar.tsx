'use client';

import { Save, History, AlertCircle, Focus, X, Upload, Download, AtSign } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useManuscriptStore } from './store';
import type { SuggestionFrequency } from './store';

interface EditorToolbarProps {
  wordCount: number;
  onImportClick: () => void;
  onExportClick: () => void;
}

export function EditorToolbar({ wordCount, onImportClick, onExportClick }: EditorToolbarProps) {
  const title = useManuscriptStore((s) => s.activeChapterTitle);
  const setTitle = useManuscriptStore((s) => s.setChapterTitle);
  const dirty = useManuscriptStore((s) => s.dirty);
  const saving = useManuscriptStore((s) => s.saving);
  const savedAt = useManuscriptStore((s) => s.savedAt);
  const version = useManuscriptStore((s) => s.version);
  const save = useManuscriptStore((s) => s.save);
  const focusMode = useManuscriptStore((s) => s.focusMode);
  const toggleFocusMode = useManuscriptStore((s) => s.toggleFocusMode);
  const showVersions = useManuscriptStore((s) => s.showVersions);
  const toggleVersions = useManuscriptStore((s) => s.toggleVersions);
  const loadVersions = useManuscriptStore((s) => s.loadVersions);
  const freq = useManuscriptStore((s) => s.suggestionFrequency);
  const setFreq = useManuscriptStore((s) => s.setSuggestionFrequency);
  const activeChapterId = useManuscriptStore((s) => s.activeChapterId);

  const onVersions = () => { void loadVersions(); toggleVersions(); };

  const dispatchWrite = () => {
    if (!activeChapterId) return;
    window.dispatchEvent(new CustomEvent('textforge:chapter-write', { detail: { chapterId: activeChapterId } }));
  };

  const freqLabel: Record<SuggestionFrequency, string> = {
    off: '联想关',
    medium: '联想中',
    high: '联想高',
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border shrink-0">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="text-sm font-medium bg-transparent border-none outline-none min-w-[150px] placeholder:text-muted-foreground"
        placeholder="章节标题"
      />
      <span className="text-xs text-muted-foreground tabular-nums">{wordCount.toLocaleString()} 字</span>
      <span className="text-xs text-muted-foreground/80 flex items-center gap-1">
        {dirty && <AlertCircle size={11} className="text-muted-foreground/60" />}
        {saving ? '保存中…' : dirty ? '未保存' : savedAt ? `v${version} · 已保存` : '内容会实时保存'}
      </span>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={() => setFreq(freq === 'off' ? 'medium' : freq === 'medium' ? 'high' : 'off')}
          className="flex items-center gap-1 h-7 px-2.5 rounded-md text-xs border border-border cursor-pointer bg-transparent hover:bg-muted"
          title="切换角色/设定联想频率"
        >
          <AtSign size={12} /> {freqLabel[freq]}
        </button>
        <button
          onClick={toggleFocusMode}
          className={cn(
            'flex items-center gap-1 h-7 px-2.5 rounded-md text-xs border cursor-pointer transition-colors',
            focusMode ? 'bg-foreground text-background border-foreground' : 'border-border bg-transparent hover:bg-muted',
          )}
        >
          {focusMode ? <><X size={12} /> 退出专注</> : <><Focus size={12} /> 专注模式</>}
        </button>
        {!focusMode && (
          <>
            <button
              onClick={onImportClick}
              className="flex items-center gap-1 h-7 px-2.5 rounded-md text-xs border border-border cursor-pointer bg-transparent hover:bg-muted"
            >
              <Upload size={12} /> 导入书籍
            </button>
            <button
              onClick={onExportClick}
              className="flex items-center gap-1 h-7 px-2.5 rounded-md text-xs border border-border cursor-pointer bg-transparent hover:bg-muted"
            >
              <Download size={12} /> 导出书籍
            </button>
          </>
        )}
        <button
          onClick={onVersions}
          className={cn(
            'flex items-center gap-1 h-7 px-2.5 rounded-md text-xs border cursor-pointer transition-colors',
            showVersions ? 'bg-foreground text-background border-foreground' : 'border-border bg-transparent hover:bg-muted',
          )}
        >
          <History size={12} /> 版本
        </button>
        {activeChapterId && (
          <button
            onClick={dispatchWrite}
            className="flex items-center gap-1 h-7 px-2.5 rounded-md text-xs border border-border cursor-pointer bg-transparent hover:bg-muted"
            title="让 Agent 接管本章：读取并生成正文，经审核卡确认后写入"
          >
            接管本章
          </button>
        )}
        <button
          onClick={() => { void save(); }}
          disabled={!dirty || saving}
          className="flex items-center gap-1 h-7 px-3 rounded-md bg-foreground text-background text-xs font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-30"
        >
          <Save size={12} /> 保存
        </button>
      </div>
    </div>
  );
}
