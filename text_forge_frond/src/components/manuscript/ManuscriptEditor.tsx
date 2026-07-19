// src/components/manuscript/ManuscriptEditor.tsx
'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus, FileText, Save, AtSign, Hash, Sparkles, Wand2,
  ArrowRight, ArrowLeft, Check, Upload, Download, BookOpen, CheckCircle2, HelpCircle, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose,
} from '@/components/ui/dialog';
import { useManuscriptEditor } from '@/lib/hooks/useManuscriptEditor';

export function ManuscriptEditor({ projectId }: { projectId: string }) {
  const {
    chapters, active, activeId, setActiveId, draftContent,
    title, setTitle, dirty, setDirty, savedAt,
    textareaRef, suggest, setSuggest, suggestIndexRef, aiMenu, setAiMenu, fileRef,
    bookChapters, setBookChapters,
    sendOpen, setSendOpen, bookName, exportOpen, setExportOpen,
    clearOpen, setClearOpen, pendingDeleteId, setPendingDeleteId,
    showSuggestHint, askBookTxt, setAskBookTxt,
    addChapter, removeChapter, clearProject,
    dismissSuggestHint, save, handleInput, applySuggestion, handleSelect, runAiAssist,
    openSend, confirmSend, onPickBook, confirmBookImport, handleExportBook, doExportBookTxt,
  } = useManuscriptEditor(projectId);

  if (chapters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-64">
        <Button onClick={() => addChapter(projectId, '第 1 章')}><Plus className="w-4 h-4 mr-2" /> 新建第一章</Button>
      </div>
    );
  }

  return (
    <div className="grid grid-rows-[auto_1fr] lg:grid-rows-none lg:grid-cols-[260px_1fr] gap-4 h-[calc(100vh-260px)] lg:h-[calc(100dvh-260px)] min-h-0">
      {/* 章节树 */}
      <div className="flex flex-col min-h-0 gap-2">
        <div className="flex items-center justify-between px-1 shrink-0">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">章节</span>
          <div className="flex items-center gap-1">
            {chapters.length > 0 && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive/70 hover:text-destructive" onClick={() => setClearOpen(true)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => addChapter(projectId).then((c) => setActiveId(c.id))}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <div className="max-h-[28vh] lg:max-h-none lg:h-full min-h-0 pr-1 rounded-2xl border border-border/40 bg-background/40 overflow-y-auto">
          <div className="space-y-1 p-2">
            {chapters.map((c, i) => (
              <div
                key={c.id}
                className={cn(
                  'group w-full text-left px-3 py-2 rounded-xl border text-sm transition-colors flex items-center gap-2',
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
      </div>

      {/* 编辑器 */}
      <div className="flex flex-col min-h-0 space-y-3">
        {showSuggestHint && (
          <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-2 text-xs text-muted-foreground">
            <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="flex-1 leading-relaxed">
              写作时输入 <kbd className="rounded bg-background/60 px-1 font-sans">@</kbd> 提及角色、<kbd className="rounded bg-background/60 px-1 font-sans">#</kbd> 提及设定；停笔后还会自动提示相关角色与设定，让正文与人物、世界观保持一致。
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
          <Input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            placeholder="章节标题"
            className="font-medium max-w-xs"
          />
          <span className="text-xs text-muted-foreground">{draftContent.length} 字</span>
          <span className="text-xs text-muted-foreground/80 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            {dirty ? '编辑中…停笔即自动保存' : savedAt ? '已自动保存' : '内容会实时保存'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4 mr-1.5" /> 导入书籍(txt)
            </Button>
            <Button size="sm" variant="outline" onClick={() => setExportOpen(true)}>
              <Download className="w-4 h-4 mr-1.5" /> 导出书籍
            </Button>
            <Button size="sm" variant="outline" onClick={openSend}>
              <ArrowRight className="w-4 h-4 mr-1.5" /> 发送到工作台
            </Button>
            <Button size="sm" onClick={() => { void save().then(() => toast.success('已保存')); }}><Save className="w-4 h-4 mr-1.5" /> 保存</Button>
          </div>
        </div>

        <div className="relative h-full min-h-0 rounded-2xl border border-border/40 bg-background/40 overflow-hidden">
          <textarea
            ref={textareaRef}
            value={draftContent}
            onChange={handleInput}
            onSelect={handleSelect}
            onKeyUp={(e) => { if (e.key === 'Escape') { setSuggest(null); setAiMenu(null); } }}
            placeholder="在这里写作…输入 @ 提及角色，# 提及设定；选中文字可用 AI 扩写/改写/缩写"
            className="w-full h-full overflow-y-auto overflow-x-hidden rounded-2xl border-0 bg-transparent p-4 text-base leading-relaxed outline-none resize-none font-[--font-serif,serif]"
            style={{ fontFamily: 'var(--font-serif, serif)' }}
          />

          {/* 联想弹层 */}
          {suggest && (
            <div
              className="absolute z-50 w-64 rounded-xl border border-border/60 bg-popover/95 backdrop-blur shadow-elegant p-1.5 space-y-0.5"
              style={{ top: suggest.top, left: suggest.left }}
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1.5 pb-1">
                {suggest.kind === 'character' ? '角色' : suggest.kind === 'hint' ? '提示' : '设定'}提及
              </p>
              {suggest.items.map((s, i) => (
                s.kind === 'hint' ? (
                  <div key={s.label + i} className="flex items-start gap-2 px-2 py-1.5 text-left text-xs text-muted-foreground rounded-lg bg-accent/20">
                    <HelpCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="flex-1">{s.detail}</span>
                  </div>
                ) : (
                  <button
                    key={s.label + i}
                    onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm hover:bg-accent/50',
                      i === suggestIndexRef.current && 'bg-accent/40',
                    )}
                  >
                    {s.kind === 'character' ? <AtSign className="w-3.5 h-3.5 text-primary" /> : <Hash className="w-3.5 h-3.5 text-primary" />}
                    <span className="flex-1 truncate">{s.label}</span>
                    {s.detail && <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">{s.detail}</span>}
                  </button>
                )
              ))}
            </div>
          )}

          {/* AI 辅助浮层 */}
          {aiMenu && (
            <div
              className="absolute z-50 rounded-xl border border-border/60 bg-popover/95 backdrop-blur shadow-elegant p-1.5 flex gap-1"
              style={{ top: aiMenu.top, left: aiMenu.left }}
            >
              <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => runAiAssist('expand')}><Wand2 className="w-3 h-3 mr-1" /> 扩写</Button>
              <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => runAiAssist('rewrite')}><Sparkles className="w-3 h-3 mr-1" /> 改写</Button>
              <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => runAiAssist('summarize')}><Check className="w-3 h-3 mr-1" /> 缩写</Button>
            </div>
          )}
        </div>

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
              <DialogTitle>发送到工作台</DialogTitle>
              <DialogDescription>
                将以「追加步骤」方式把当前章节同步到「项目管理」的全局步骤（不会覆盖已有步骤）。同步后，工作台 Agent 流在续写时会把它当作前文上下文。
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
                已识别 {bookChapters?.length ?? 0} 个章节。选择落点：仅手稿（本地续写），或同步到工作台（Agent 续写以此为前文）。
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
        <Dialog open={clearOpen} onOpenChange={setClearOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>清空手稿</DialogTitle>
              <DialogDescription>
                将删除《{projectId}》下的全部 {chapters.length} 个章节（不可恢复）。此操作仅清除本地手稿，不影响工作台步骤。
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 mt-2">
              <Button size="sm" variant="destructive" onClick={() => { void clearProject(projectId).then(() => { setActiveId(null); setClearOpen(false); }); }}>
                <Trash2 className="w-4 h-4 mr-2" /> 确认清空全部章节
              </Button>
              <DialogClose render={<Button variant="ghost" size="sm" className="mt-1" />}>取消</DialogClose>
            </div>
          </DialogContent>
        </Dialog>

        {/* 单章删除确认 */}
        <Dialog open={pendingDeleteId !== null} onOpenChange={(o) => !o && setPendingDeleteId(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>删除章节</DialogTitle>
              <DialogDescription>
                将删除《{pendingDeleteId ? chapters.find((c) => c.id === pendingDeleteId)?.title ?? '' : ''}》，此操作不可恢复。
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 mt-2">
              <Button size="sm" variant="destructive" onClick={() => {
                const id = pendingDeleteId!;
                removeChapter(id);
                if (activeId === id) {
                  const rest = chapters.filter((x) => x.id !== id);
                  setActiveId(rest[0]?.id ?? null);
                }
                setPendingDeleteId(null);
              }}>
                <Trash2 className="w-4 h-4 mr-2" /> 确认删除该章节
              </Button>
              <DialogClose render={<Button variant="ghost" size="sm" className="mt-1" />}>取消</DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
