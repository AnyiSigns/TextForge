// src/components/manuscript/ManuscriptEditor.tsx
'use client';

import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus, FileText, Save, Sparkles,
  ArrowRight, ArrowLeft, Upload, Download, BookOpen, CheckCircle2, HelpCircle, Trash2,
  Focus, X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose,
} from '@/components/ui/dialog';
import { useManuscriptEditor } from '@/features/manuscript';
import { motion, AnimatePresence } from 'framer-motion';
import { DiffSlider } from './DiffSlider';
import { AI_ACTION_LABEL } from '@/lib/aiTextTransform';
import { useManuscriptStore } from '@/features/manuscript';
import { GhostCursor } from './GhostCursor';
import { AntiMistakeBlock } from '@/features/projects/ui/AntiMistakeBlock';

export function ManuscriptEditor({ projectId }: { projectId: string }) {
  const {
    chapters, active, activeId, setActiveId, draftContent,
    title, setTitle, dirty, setDirty, savedAt,
    textareaRef, setSuggest, setAiMenu, fileRef,
    bookChapters, setBookChapters,
    sendOpen, setSendOpen, bookName, exportOpen, setExportOpen,
    showSuggestHint, askBookTxt, setAskBookTxt,
    addChapter, removeChapter, clearProject,
    dismissSuggestHint, save, handleInput, handleSelect,
    openSend, confirmSend, onPickBook, confirmBookImport, handleExportBook, doExportBookTxt,
    diffState, acceptDiff, rejectDiff,
    streamingActive,
    streamingStalled,
  } = useManuscriptEditor(Number(projectId));
  const [focusMode, setFocusMode] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{ chapter: typeof chapters[number]; top: number; left: number } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clearBlocked, setClearBlocked] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (chapters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-64">
        <Button onClick={() => addChapter(Number(projectId), '第 1 章')}><Plus className="w-4 h-4 mr-2" /> 新建第一章</Button>
      </div>
    );
  }

  const toggleFocusMode = () => setFocusMode((v) => !v);

  const handleTitleDoubleClick = () => {
    if (focusMode) return;
    setEditingTitleValue(title || active?.title || '');
    setEditingTitle(true);
    requestAnimationFrame(() => titleInputRef.current?.focus());
  };

  const confirmTitleEdit = () => {
    const next = editingTitleValue.trim() || active?.title || '未命名章节';
    setTitle(next);
    setEditingTitle(false);
    setDirty(true);
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = [...chapters];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    next.forEach((c, i) => {
      void useManuscriptStore.getState().updateChapter(c.id, { index: i + 1 });
    });
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleChapterHover = (c: typeof chapters[number], e: React.MouseEvent) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setHoverPreview({
        chapter: c,
        top: rect.bottom + 6,
        left: Math.min(rect.left, window.innerWidth - 220),
      });
    }, 800);
  };

  const handleChapterLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoverPreview(null);
  };

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
            <div className="flex items-center justify-between px-1 shrink-0">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">章节</span>
              <div className="flex items-center gap-1">
                {chapters.length > 0 && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive/70 hover:text-destructive" onClick={() => setClearBlocked(true)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => addChapter(Number(projectId)).then((c) => setActiveId(c.id))}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div className="max-h-[28vh] lg:max-h-none lg:h-full min-h-0 pr-1 rounded-2xl border border-border/40 bg-background/40 overflow-y-auto">
            <div className="space-y-1 p-2">
              {chapters.map((c, i) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={(e) => handleDrop(e, i)}
                  onDragEnd={handleDragEnd}
                  onMouseEnter={(e) => handleChapterHover(c, e)}
                  onMouseLeave={handleChapterLeave}
                  className={cn(
                    'group w-full text-left px-3 py-2 rounded-xl border text-sm transition-all flex items-center gap-2 cursor-grab active:cursor-grabbing',
                    dragIndex === i && 'scale-[1.03] shadow-lg shadow-black/20 border-primary/40',
                    dragOverIndex === i && dragIndex !== i && 'border-primary/60 shadow-[0_0_0_1px_rgba(59,130,246,0.5)]',
                    c.id === activeId ? 'border-primary/40 bg-primary/[0.06]' : 'border-transparent hover:bg-accent/30',
                  )}
                >
                   <button className="flex-1 min-w-0 flex items-center gap-2 text-left" onClick={() => setActiveId(c.id)}>
                     <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}</span>
                     <span className="flex-1 truncate">{c.title}</span>
                     {c.source === 'ai' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 shrink-0" title="由 AI 生成，可继续人写">AI</span>}
                     {c.source === 'ai_edited' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 shrink-0" title="AI 生成后经手工修改">AI改</span>}
                     {c.source === 'manual' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-border/40 text-muted-foreground shrink-0" title="纯手工撰写">手工</span>}
                     {c.source === 'imported' && <ArrowLeft className="w-3 h-3 text-muted-foreground shrink-0" />}
                   </button>
                   <button
                     type="button"
                     aria-label="删除章节"
                     onClick={() => setPendingDeleteId(c.id)}
                     className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                   >
                     <Trash2 className="w-3.5 h-3.5" />
                   </button>
                </div>
              ))}
            </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 章节悬停摘要预览 */}
      <AnimatePresence>
        {hoverPreview && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="fixed z-50 w-64 max-h-48 overflow-y-auto rounded-xl border border-border/60 bg-popover/95 backdrop-blur shadow-elegant p-3 text-xs leading-relaxed"
            style={{ top: hoverPreview.top, left: hoverPreview.left }}
          >
            <p className="font-medium text-foreground mb-1 truncate">{hoverPreview.chapter.title}</p>
            <p className="text-muted-foreground whitespace-pre-wrap line-clamp-5">
              {hoverPreview.chapter.content?.slice(0, 300) || '（暂无内容）'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 编辑器 */}
      <motion.div
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col min-h-0 space-y-3 relative"
      >
        {showSuggestHint && (
          <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-2 text-xs text-muted-foreground">
            <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="flex-1 leading-relaxed">
              写作时输入 <kbd className="rounded bg-background/60 px-1 font-sans">@</kbd> 选择角色、<kbd className="rounded bg-background/60 px-1 font-sans">#</kbd> 选择设定；停下来时，会自动提示相关角色和设定，让正文与人物、世界观保持一致。
            </p>
            <button
              type="button"
              onClick={dismissSuggestHint}
              className="shrink-0 text-muted-foreground/70 hover:text-foreground text-xs underline-offset-2 hover:underline"
            >
              知道了
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
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
                <Button size="sm" variant="outline" onClick={openSend}>
                  <ArrowRight className="w-4 h-4 mr-1.5" /> 发送到项目工作台
                </Button>
              </>
            )}
            <Button size="sm" onClick={() => { void save().then(() => toast.success('已保存')); }}><Save className="w-4 h-4 mr-1.5" /> 保存</Button>
          </div>
        </div>

        <div className={cn('relative h-full min-h-0 rounded-2xl border border-border/40 bg-background/40 overflow-hidden transition-all duration-200', focusMode && 'border-primary/30 bg-background/60 shadow-lg shadow-primary/5')}>
          <textarea
            ref={textareaRef}
            defaultValue={draftContent}
            key={activeId ?? 'none'}
            onChange={handleInput}
            onSelect={handleSelect}
            onKeyUp={(e) => { if (e.key === 'Escape') { setSuggest(null); setAiMenu(null); if (focusMode) setFocusMode(false); } }}
            placeholder={focusMode ? '专注写作中…' : '在这里写作…输入 @ 选择角色，# 选择设定；选中文字可用 AI 扩写/改写/缩写'}
            className="w-full h-full overflow-y-auto overflow-x-hidden rounded-2xl border-0 bg-transparent p-4 text-base leading-relaxed outline-none resize-none font-[--font-serif,serif]"
            style={{ fontFamily: 'var(--font-serif, serif)' }}
          />
          <div className="absolute bottom-3 right-4 pointer-events-none">
            <GhostCursor active={streamingActive} stalled={streamingStalled} />
          </div>
        </div>
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

      {/* 发送到工作台：确认是否同步全局 */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>发送到项目工作台</DialogTitle>
            <DialogDescription>
              会把当前章节追加到工作台的生成步骤中（不会覆盖已有步骤）。同步后，AI 续写时会把它当作前文。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border/40 bg-muted/30 p-3 text-xs space-y-1">
            <p className="font-medium text-muted-foreground">同步预览（追加为 1 个步骤）</p>
            <p className="font-medium truncate">标题：{active?.title || '未命名章节'}</p>
            <p className="text-muted-foreground line-clamp-4 leading-relaxed whitespace-pre-wrap">
              {draftContent.slice(0, 200) || '（当前章节为空）'}{draftContent.length > 200 ? '…' : ''}
            </p>
            <p className="text-muted-foreground/70">共 {draftContent.length} 字</p>
          </div>
          <div className="flex flex-col gap-2 mt-2">
            <Button size="sm" onClick={() => confirmSend(true)}>
              <ArrowRight className="w-4 h-4 mr-2" /> 同步到工作台（全局步骤）
            </Button>
            <Button size="sm" variant="outline" onClick={() => confirmSend(false)}>
              仅保留在手稿（本地，不同步）
            </Button>
          </div>
          <DialogClose render={<Button variant="ghost" size="sm" className="mt-1" />}>取消</DialogClose>
        </DialogContent>
      </Dialog>

      {/* 导出书籍 */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>导出书籍正文</DialogTitle>
            <DialogDescription>仅导出手稿章节正文（不含设定/角色/工作台步骤）。</DialogDescription>
          </DialogHeader>
          {askBookTxt ? (
            <div className="space-y-2 py-1">
              <Button variant="outline" className="w-full justify-start h-auto py-2.5 pr-2" onClick={() => doExportBookTxt('tidy')}>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium flex items-center gap-1">
                    仅轻度规整
                    <span className="inline-flex cursor-help" title="只做无害清理：去掉每行末尾多余空格、把连续多个空行压成一个。不改动你的段落和换行，正文原样保留。"><HelpCircle className="w-3.5 h-3.5 text-muted-foreground" /></span>
                  </p>
                  <p className="text-xs text-muted-foreground">去掉行尾空格、压缩多余空行，保留原段落与换行</p>
                </div>
              </Button>
              <Button variant="outline" className="w-full justify-start h-auto py-2.5 pr-2" onClick={() => doExportBookTxt('format')}>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium flex items-center gap-1">
                    轻度规整 + 段落排版
                    <span className="inline-flex cursor-help" title="在轻度规整基础上，按空行把正文重新分成整齐的段落；但《第X章》这类章节标题会单独成行、不会并入上一段。"><HelpCircle className="w-3.5 h-3.5 text-muted-foreground" /></span>
                  </p>
                  <p className="text-xs text-muted-foreground">在规整基础上重排段落，并保留章节标题不并入正文</p>
                </div>
              </Button>
              <Button variant="ghost" size="sm" className="mt-1" onClick={() => setAskBookTxt(false)}>返回</Button>
            </div>
          ) : (
            <div className="flex gap-2 mt-2">
              <Button size="sm" onClick={() => handleExportBook('txt')}><FileText className="w-4 h-4 mr-2" /> 纯文本 (TXT)</Button>
              <Button size="sm" variant="outline" onClick={() => handleExportBook('markdown')}><BookOpen className="w-4 h-4 mr-2" /> Markdown</Button>
            </div>
          )}
          <DialogClose render={<Button variant="ghost" size="sm" className="mt-1" />}>取消</DialogClose>
        </DialogContent>
      </Dialog>

      {/* 书籍导入预览 */}
      <Dialog open={!!bookChapters} onOpenChange={(o) => { if (!o) setBookChapters(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>导入书籍：{bookName}</DialogTitle>
            <DialogDescription>
              已识别 {bookChapters?.length ?? 0} 个章节。选择导入位置：仅导入手稿（本地续写），或同步到工作台（AI 会把这章作为前文续写）。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-border/40 p-2 space-y-1 mt-2">
            {(bookChapters ?? []).slice(0, 30).map((c, i) => (
              <p key={i} className="text-xs truncate"><span className="text-muted-foreground">{i + 1}. </span>{c.title}</p>
            ))}
          </div>
          <div className="flex flex-col gap-2 mt-2">
            <Button size="sm" onClick={() => confirmBookImport(true)}>
              <ArrowRight className="w-4 h-4 mr-2" /> 同步到工作台（{bookChapters?.length ?? 0} 章）
            </Button>
            <Button size="sm" variant="outline" onClick={() => confirmBookImport(false)}>
              仅导入到手稿（本地续写）
            </Button>
          </div>
          <DialogClose render={<Button variant="ghost" size="sm" className="mt-1" />}>取消</DialogClose>
        </DialogContent>
      </Dialog>

      {/* 清空手稿确认 */}
      {chapters.length > 0 && (
        <AntiMistakeBlock
          blocked={clearBlocked}
          message={`将删除《${bookName}》下的全部 ${chapters.length} 个章节（不可恢复）。此操作仅清除本地手稿，不影响工作台步骤。`}
          onForce={() => { void clearProject(Number(projectId)).then(() => { setActiveId(null); setClearBlocked(false); }); }}
          onCancel={() => setClearBlocked(false)}
          defaultLabel={<Trash2 className="w-3.5 h-3.5" />}
          onDefault={() => setClearBlocked(true)}
        />
      )}

      {/* 单章删除确认 */}
      {pendingDeleteId !== null && (
        <AntiMistakeBlock
          blocked={deleteBlocked}
          message={`将删除《${chapters.find((c) => c.id === pendingDeleteId)?.title ?? ''}》，此操作不可恢复。`}
          onForce={() => {
            const id = pendingDeleteId!;
            removeChapter(id);
            if (activeId === id) {
              const rest = chapters.filter((x) => x.id !== id);
              setActiveId(rest[0]?.id ?? null);
            }
            setPendingDeleteId(null);
            setDeleteBlocked(false);
          }}
          onCancel={() => { setPendingDeleteId(null); setDeleteBlocked(false); }}
          defaultLabel={<Trash2 className="w-3.5 h-3.5" />}
          onDefault={() => setDeleteBlocked(true)}
        />
      )}
    </div>
  );
}
