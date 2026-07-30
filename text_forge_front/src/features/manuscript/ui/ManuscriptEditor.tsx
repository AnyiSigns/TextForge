// src/features/manuscript/ui/ManuscriptEditor.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useManuscriptEditor } from '@/features/manuscript';
import { cn } from '@/lib/utils';
import { EditorToolbar } from './EditorToolbar';
import { EditorArea } from './EditorArea';
import { ChapterTree } from './ChapterTree';
import { SuggestHint } from './SuggestHint';
import { ChapterHoverPreview } from './ChapterHoverPreview';
import { ConfirmationBlocks } from './ConfirmationBlocks';
import { VersionHistory } from './VersionHistory';
import { DiffView } from './DiffView';
import { ExportBookDialog } from './ExportBookDialog';
import { ImportBookDialog } from './ImportBookDialog';
import { DiffSlider } from './DiffSlider';
import { AI_ACTION_LABEL } from '@/lib/aiTextTransform';
import { useManuscriptStore } from '@/features/manuscript';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { SelectionToolbar } from '@/features/user-agent';
import { executeTextOperation } from '@/features/user-agent/api/agentApi';
import { toast } from 'sonner';

export function ManuscriptEditor({ projectId }: { projectId: string }) {
  const {
    chapters, active, activeId, setActiveId, draftContent,
    title, setTitle, dirty, setDirty, savedAt,
    textareaRef, fileRef,
    bookChapters, setBookChapters,
    bookName, exportOpen, setExportOpen,
    showSuggestHint, askBookTxt, setAskBookTxt,
    addChapter, removeChapter, clearProject,
    getOrCreateDefaultVolume, syncChapterToServer,
    dismissSuggestHint, save, handleInput, handleSelect,
    onPickBook, confirmBookImport, handleExportBook, doExportBookTxt,
    diffState, acceptDiff, rejectDiff,
    streamingActive,
    streamingStalled,
    pendingDeleteId, setPendingDeleteId,
    setSuggest, setAiMenu,
    commitContent,
  } = useManuscriptEditor(Number(projectId));

  const [focusMode, setFocusMode] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{ chapter: typeof chapters[number]; top: number; left: number } | null>(null);
  const [clearBlocked, setClearBlocked] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [diffViewOpen, setDiffViewOpen] = useState(false);
  const [diffVersions, setDiffVersions] = useState<{ from: number; to: number } | null>(null);
  const [selectionToolbar, setSelectionToolbar] = useState<{ visible: boolean; x: number; y: number; selectedText: string } | null>(null);

  const handleSelectionAction = async (action: string) => {
    if (!selectionToolbar?.selectedText || !textareaRef.current) return;
    const selectedText = selectionToolbar.selectedText;
    setSelectionToolbar(null);

    try {
      let operationType: 'polish_text' | 'expand_text' | 'rewrite_paragraph' | 'check_consistency' | undefined;
      switch (action) {
        case 'polish': operationType = 'polish_text'; break;
        case 'expand': operationType = 'expand_text'; break;
        case 'rephrase': operationType = 'rewrite_paragraph'; break;
        case 'check': operationType = 'check_consistency'; break;
        default: return;
      }

      const result = await executeTextOperation(selectedText, operationType!);
      if (result.success && result.result) {
        const el = textareaRef.current;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        const before = el.value.slice(0, start);
        const after = el.value.slice(end);
        const newValue = before + result.result + after;
        commitContent(newValue);
        toast.success(`已${AI_ACTION_LABEL[action as keyof typeof AI_ACTION_LABEL] || action}`);
      } else {
        toast.error(result.error || '操作失败');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleTextSelect = () => {
    handleSelect();
    if (textareaRef.current) {
      const el = textareaRef.current;
      const sel = el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
      if (sel.trim().length > 0) {
        const rect = el.getBoundingClientRect();
        setSelectionToolbar({
          visible: true,
          x: rect.left + rect.width / 2,
          y: rect.top,
          selectedText: sel,
        });
      } else {
        setSelectionToolbar(null);
      }
    }
  };

  if (chapters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-64">
        <Button onClick={() => addChapter(Number(projectId), '第 1 章')}><Plus className="w-4 h-4 mr-2" /> 新建第一章</Button>
      </div>
    );
  }

  return (
    <div className="relative grid grid-rows-[auto_1fr] lg:grid-rows-none lg:grid-cols-[260px_1fr] gap-4 h-[calc(100vh-260px)] lg:h-[calc(100dvh-260px)] min-h-0">
      {/* 章节树 */}
      <AnimatePresence>
        {!focusMode && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col min-h-0 gap-2 overflow-hidden"
          >
            <ChapterTree
              chapters={chapters}
              activeId={activeId}
              setActiveId={setActiveId}
              dragIndex={dragIndex}
              dragOverIndex={dragOverIndex}
              onDragStart={setDragIndex}
              onDragOver={(e, i) => { e.preventDefault(); setDragOverIndex(i); }}
              onDrop={(e, targetIndex) => {
                e.preventDefault();
                if (dragIndex === null || dragIndex === targetIndex) { setDragIndex(null); setDragOverIndex(null); return; }
                const next = [...chapters];
                const [moved] = next.splice(dragIndex, 1);
                next.splice(targetIndex, 0, moved);
                next.forEach((c, i) => {
                  void useManuscriptStore.getState().updateChapter(c.id, { index: i + 1 });
                });
                setDragIndex(null);
                setDragOverIndex(null);
              }}
              onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
              onChapterHover={(preview) => setHoverPreview(preview)}
              onChapterLeave={() => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); setHoverPreview(null); }}
              hoverTimerRef={hoverTimerRef}
              clearBlocked={clearBlocked}
              setClearBlocked={setClearBlocked}
              deleteBlocked={deleteBlocked}
              setDeleteBlocked={setDeleteBlocked}
              pendingDeleteId={pendingDeleteId}
              setPendingDeleteId={setPendingDeleteId}
              addChapter={addChapter}
              getOrCreateDefaultVolume={getOrCreateDefaultVolume}
              syncChapterToServer={syncChapterToServer}
              bookId={projectId}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <ChapterHoverPreview preview={hoverPreview} />

      {/* 编辑器 */}
      <motion.div
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col min-h-0 space-y-3 relative"
      >
        <SuggestHint show={showSuggestHint} onDismiss={dismissSuggestHint} />
        <EditorToolbar
          title={title}
          setTitle={setTitle}
          setDirty={setDirty}
          editingTitle={editingTitle}
          setEditingTitle={setEditingTitle}
          editingTitleValue={editingTitleValue}
          setEditingTitleValue={setEditingTitleValue}
          titleInputRef={titleInputRef}
          draftContent={draftContent}
          dirty={dirty}
          savedAt={savedAt}
          focusMode={focusMode}
          toggleFocusMode={() => setFocusMode((v) => !v)}
          fileRef={fileRef}
          exportOpen={exportOpen}
          setExportOpen={setExportOpen}
          active={active}
          versionHistoryOpen={versionHistoryOpen}
          setVersionHistoryOpen={setVersionHistoryOpen}
          diffViewOpen={diffViewOpen}
          setDiffViewOpen={setDiffViewOpen}
          diffVersions={diffVersions}
          setDiffVersions={setDiffVersions}
          save={save}
        />
<EditorArea
           textareaRef={textareaRef}
           draftContent={draftContent}
           activeId={activeId}
           focusMode={focusMode}
           streamingActive={streamingActive}
           streamingStalled={streamingStalled}
           onInput={handleInput}
           onSelect={handleTextSelect}
           onEscape={() => { setSuggest(null); setAiMenu(null); if (focusMode) setFocusMode(false); }}
         />
         {selectionToolbar && (
           <SelectionToolbar
             selectedText={selectionToolbar.selectedText}
             position={{ x: selectionToolbar.x, y: selectionToolbar.y }}
             onAction={handleSelectionAction}
             onHide={() => setSelectionToolbar(null)}
           />
         )}
      </motion.div>

      <DiffSlider
        open={!!diffState}
        onOpenChange={(open) => { if (!open) rejectDiff(); }}
        original={diffState?.original || ''}
        proposed={diffState?.proposed || ''}
        onAccept={acceptDiff}
        onReject={rejectDiff}
        title={diffState ? `AI${AI_ACTION_LABEL[diffState.action]}预览` : undefined}
      />

      {/* 隐藏文件输入：导入书籍 txt */}
      <input
        ref={fileRef}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onPickBook(e.target.files[0]); e.target.value = ''; }}
      />

      <ExportBookDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        askBookTxt={askBookTxt}
        onAskBookTxtChange={setAskBookTxt}
        onExportTxt={doExportBookTxt}
        onExportMarkdown={handleExportBook}
      />

      <ImportBookDialog
        open={!!bookChapters}
        onOpenChange={(o) => { if (!o) setBookChapters(null); }}
        bookName={bookName}
        chapterCount={bookChapters?.length ?? 0}
        onConfirm={confirmBookImport}
      />

      <ConfirmationBlocks
        chapters={chapters}
        bookName={bookName}
        clearBlocked={clearBlocked}
        setClearBlocked={setClearBlocked}
        deleteBlocked={deleteBlocked}
        setDeleteBlocked={setDeleteBlocked}
        pendingDeleteId={pendingDeleteId}
        setPendingDeleteId={setPendingDeleteId}
        clearProject={clearProject}
        removeChapter={removeChapter}
        activeId={activeId}
        setActiveId={setActiveId}
        projectId={projectId}
      />

      {active?.serverChapterId && (
        <VersionHistory
          chapterId={active.serverChapterId}
          open={versionHistoryOpen}
          onOpenChange={setVersionHistoryOpen}
          onSelectVersions={(from, to) => {
            setDiffVersions({ from, to });
            setVersionHistoryOpen(false);
            setDiffViewOpen(true);
          }}
        />
      )}

      {active?.serverChapterId && diffVersions && (
        <DiffView
          chapterId={active.serverChapterId}
          fromVersion={diffVersions.from}
          toVersion={diffVersions.to}
          open={diffViewOpen}
          onOpenChange={setDiffViewOpen}
          onAccept={acceptDiff}
          onReject={rejectDiff}
        />
      )}
    </div>
  );
}
