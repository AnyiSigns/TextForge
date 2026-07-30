// src/features/manuscript/ui/EditorToolbar.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, Focus, X, Upload, Download, History, GitCompare, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface EditorToolbarProps {
  title: string;
  setTitle: (v: string) => void;
  setDirty: (v: boolean) => void;
  editingTitle: boolean;
  setEditingTitle: (v: boolean) => void;
  editingTitleValue: string;
  setEditingTitleValue: (v: string) => void;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
  draftContent: string;
  dirty: boolean;
  savedAt: number | null;
  focusMode: boolean;
  toggleFocusMode: () => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  exportOpen: boolean;
  setExportOpen: (v: boolean) => void;
  active?: { serverChapterId?: number } | null;
  versionHistoryOpen: boolean;
  setVersionHistoryOpen: (v: boolean) => void;
  diffViewOpen: boolean;
  setDiffViewOpen: (v: boolean) => void;
  diffVersions: { from: number; to: number } | null;
  setDiffVersions: (v: { from: number; to: number } | null) => void;
  save: () => Promise<void>;
  className?: string;
}

export function EditorToolbar(props: EditorToolbarProps) {
  const {
    title, setTitle, setDirty,
    editingTitle, setEditingTitle, editingTitleValue, setEditingTitleValue,
    titleInputRef, draftContent, dirty, savedAt,
    focusMode, toggleFocusMode, fileRef,
    exportOpen, setExportOpen,
    active, versionHistoryOpen, setVersionHistoryOpen,
    diffViewOpen, setDiffViewOpen, diffVersions, setDiffVersions,
    save, className,
  } = props;

  const confirmTitleEdit = () => {
    const next = editingTitleValue.trim() || title || '未命名章节';
    setTitle(next);
    setEditingTitle(false);
    setDirty(true);
  };

  const handleTitleDoubleClick = () => {
    if (focusMode) return;
    setEditingTitleValue(title || '');
    setEditingTitle(true);
    requestAnimationFrame(() => titleInputRef.current?.focus());
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {editingTitle ? (
        <Input
          ref={titleInputRef}
          value={editingTitleValue}
          onChange={(e) => setEditingTitleValue(e.target.value)}
          onBlur={confirmTitleEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); confirmTitleEdit(); }
            if (e.key === 'Escape') { setEditingTitle(false); }
          }}
          className="font-medium max-w-xs h-8"
        />
      ) : (
        <Input
          value={title}
          onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          onDoubleClick={handleTitleDoubleClick}
          readOnly={focusMode}
          placeholder="章节标题"
          className="font-medium max-w-xs"
        />
      )}
      <span className="text-xs text-muted-foreground">{draftContent.length} 字</span>
      <span className="text-xs text-muted-foreground/80 flex items-center gap-1">
        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
        {dirty ? '编辑中…停笔即自动保存' : savedAt ? '已自动保存' : '内容会实时保存'}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={toggleFocusMode} className={cn('gap-1.5', focusMode && 'text-primary')}>
          {focusMode ? <X className="w-4 h-4" /> : <Focus className="w-4 h-4" />}
          {focusMode ? '退出专注' : '专注模式'}
        </Button>
        {!focusMode && (
          <>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4 mr-1.5" /> 导入书籍（TXT）
            </Button>
            <Button size="sm" variant="outline" onClick={() => setExportOpen(true)}>
              <Download className="w-4 h-4 mr-1.5" /> 导出书籍
            </Button>
          </>
        )}
        {active?.serverChapterId && (
          <>
            <Button size="sm" variant="ghost" onClick={() => setVersionHistoryOpen(true)}>
              <History className="w-4 h-4 mr-1.5" /> 版本历史
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDiffViewOpen(true)} disabled={!diffVersions}>
              <GitCompare className="w-4 h-4 mr-1.5" /> 对比版本
            </Button>
          </>
        )}
        <Button size="sm" onClick={() => { void save().then(() => toast.success('已保存')); }}><Save className="w-4 h-4 mr-1.5" /> 保存</Button>
      </div>
    </div>
  );
}
