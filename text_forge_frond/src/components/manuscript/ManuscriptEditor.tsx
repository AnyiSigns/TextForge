// src/components/manuscript/ManuscriptEditor.tsx
'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus, FileText, Save, AtSign, Hash, Sparkles, Wand2,
  ArrowRight, ArrowLeft, Check, Upload, Download, BookOpen, CheckCircle2, HelpCircle, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useManuscriptStore } from '@/lib/stores/manuscriptStore';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { useBriefStore } from '@/lib/stores/briefStore';
import { useSettingsStore } from '@/lib/stores/settingsStore';
import { importManuscriptToProject, importBookToProject } from '@/lib/api/projects';
import { exportManuscriptBook } from '@/lib/storage/backup';
import { parseBookText } from '@/lib/utils/bookImport';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose,
} from '@/components/ui/dialog';
import type { Character, ProjectBrief, ManuscriptChapter } from '@/types';

type SuggestionKind = 'character' | 'setting' | 'hint';
interface Suggestion { kind: SuggestionKind; label: string; detail?: string; }

export function ManuscriptEditor({ projectId }: { projectId: string }) {
  const allChapters = useManuscriptStore((s) => s.chapters);
  const chapters = useMemo(() => allChapters.filter((c) => c.projectId === projectId), [allChapters, projectId]);
  const addChapter = useManuscriptStore((s) => s.addChapter);
  const updateChapter = useManuscriptStore((s) => s.updateChapter);
  const removeChapter = useManuscriptStore((s) => s.removeChapter);
  const clearProject = useManuscriptStore((s) => s.clearProject);

  const charactersAll = useCharacterStore((s) => s.characters);
  const characters = useMemo(
    () => charactersAll.filter((c: Character) => (c.projectId ?? null) === projectId),
    [charactersAll, projectId],
  );
  const brief = useBriefStore((s) => s.briefs[projectId]) as ProjectBrief | undefined;
  const freq = useSettingsStore((s) => s.suggestionFrequency);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [title, setTitle] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 联想弹层状态
  const [suggest, setSuggest] = useState<{ items: Suggestion[]; query: string; kind: SuggestionKind; top: number; left: number } | null>(null);
  const suggestIndexRef = useRef(0);
  // AI 辅助浮层
  const [aiMenu, setAiMenu] = useState<{ top: number; left: number } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 发送到工作台：确认弹窗（是否同步为全局项目 steps）
  const [sendOpen, setSendOpen] = useState(false);
  // 书籍导入：解析后的章节预览
  const [bookChapters, setBookChapters] = useState<{ title: string; content: string }[] | null>(null);
  const [bookName, setBookName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  // 清空手稿确认弹窗
  const [clearOpen, setClearOpen] = useState(false);
  // 单章删除确认弹窗
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // 联想功能首屏引导（仅首次进入展示一次，localStorage 记忆）
  const [showSuggestHint, setShowSuggestHint] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem('tf_manuscript_suggest_hint_seen')) setShowSuggestHint(true);
    } catch { /* 隐私模式下忽略 */ }
  }, []);

  // 进入手稿即拉取角色数据，保证 @ 角色联想始终有候选（角色 store 仅在角色页加载，手稿页需主动同步）
  useEffect(() => {
    const charStore = useCharacterStore.getState();
    if (charStore.characters.length === 0) {
      charStore.syncFromBackend().catch(() => {});
    }
  }, [projectId]);

  const dismissSuggestHint = () => {
    setShowSuggestHint(false);
    try { localStorage.setItem('tf_manuscript_suggest_hint_seen', '1'); } catch { /* ignore */ }
  };

  const active = useMemo(() => chapters.find((c) => c.id === activeId) ?? null, [chapters, activeId]);

  // 首次进入自动建一章（去重锁：避免 React 严格模式双调用 + load 未 await 竞态导致重复建章）
  const ensureChapterLock = useRef(false);
  useEffect(() => {
    if (ensureChapterLock.current) return;
    if (chapters.length === 0) {
      ensureChapterLock.current = true;
      addChapter(projectId, '第 1 章').then((c) => { setActiveId(c.id); setDraftContent(''); setTitle(c.title); });
    } else if (!activeId) {
      setActiveId(chapters[0].id);
    }
  }, [chapters.length]);

  // 切换章节时载入内容
  useEffect(() => {
    if (active) {
      setDraftContent(active.content);
      setTitle(active.title);
      setDirty(false);
    }
  }, [active?.id]);

  const save = useCallback(async () => {
    if (!activeId || !active) return;
    // 纯AI章节经用户编辑后，来源升级为「AI后手工修改」
    const patch: Partial<Pick<ManuscriptChapter, 'title' | 'content' | 'index' | 'source'>> = {
      content: draftContent,
      title: title || active.title || '未命名章节',
    };
    if (active.source === 'ai') patch.source = 'ai_edited';
    await updateChapter(activeId, patch);
    setDirty(false);
    setSavedAt(Date.now());
  }, [activeId, active, draftContent, title, updateChapter]);

  // 自动保存（停笔 1s）——仅更新"已保存"标记，不打扰式弹 toast
  useEffect(() => {
    if (!activeId || !dirty) return;
    const t = setTimeout(() => { void save(); }, 1000);
    return () => clearTimeout(t);
  }, [draftContent, title, dirty, activeId, save]);

  const settingKeywords = useMemo(() => {
    const list: Suggestion[] = [];
    if (brief?.worldview) list.push({ kind: 'setting', label: '世界观', detail: brief.worldview.slice(0, 24) });
    if (brief?.tone) list.push({ kind: 'setting', label: '基调', detail: brief.tone.slice(0, 24) });
    (brief?.sections ?? []).forEach((s) => list.push({ kind: 'setting', label: s.title, detail: s.content.slice(0, 24) }));
    return list;
  }, [brief]);

  const charSuggestions: Suggestion[] = useMemo(
    () => characters.map((c) => ({ kind: 'character' as const, label: c.name, detail: c.description.slice(0, 24) })),
    [characters],
  );

  const computeSuggestions = (kind: SuggestionKind, query: string): Suggestion[] => {
    // # 设定联想：若项目尚未填写任何设定，给出引导提示而非静默无结果（#10）
    if (kind === 'setting' && settingKeywords.length === 0) {
      return [{ kind: 'hint', label: '尚未填写创作设定', detail: '去「创作设定」填写世界观/基调，# 即可联想' }];
    }
    const pool = kind === 'character' ? charSuggestions : settingKeywords;
    if (!query) return pool.slice(0, 6);
    return pool.filter((s) => s.label.includes(query) || s.detail?.includes(query)).slice(0, 6);
  };

  // 处理输入：检测 @ 或 # 触发联想；高频时自动提示
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDraftContent(value);
    setDirty(true);
    const el = e.target;
    const pos = el.selectionStart ?? value.length;
    const before = value.slice(0, pos);
    // 从光标前最后一个 @/# 起算（允许紧接中文/字母书写"林墨@"），只匹配末尾片段
    const atMatch = before.match(/@[\u4e00-\u9fa5\w]*$/);
    const hashMatch = before.match(/#[\u4e00-\u9fa5\w]*$/);
    if (atMatch) {
      showSuggest('character', atMatch[0].slice(1), el, pos);
    } else if (hashMatch) {
      showSuggest('setting', hashMatch[0].slice(1), el, pos);
    } else {
      setSuggest(null);
      // 高频联想：停笔后自动提示角色/设定提及
      if (freq === 'high' || freq === 'medium') {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const delay = freq === 'high' ? 300 : 1200;
        debounceRef.current = setTimeout(() => {
          const lastWord = before.match(/([\u4e00-\u9fa5\w]{2,})$/);
          if (lastWord) {
            const q = lastWord[1];
            const items = [...charSuggestions, ...settingKeywords].filter((s) => s.label.includes(q));
            if (items.length) showSuggest(items[0].kind, q, el, pos, items);
          }
        }, delay);
      }
    }
  };

  const showSuggest = (kind: SuggestionKind, query: string, el: HTMLTextAreaElement, pos: number, forced?: Suggestion[]) => {
    const items = forced ?? computeSuggestions(kind, query);
    if (!items.length) { setSuggest(null); return; }
    const rect = el.getBoundingClientRect();
    // 定位到 textarea 顶部内侧，避免长文时浮层溢出视口底部
    const top = Math.min(8, rect.height - 60);
    setSuggest({ items, query, kind, top, left: 8 });
    suggestIndexRef.current = 0;
  };

  const applySuggestion = (s: Suggestion) => {
    if (!suggest || !textareaRef.current) return;
    // hint 项只提示、不替换文本（引导去填设定）
    if (s.kind === 'hint') { setSuggest(null); return; }
    const el = textareaRef.current;
    const value = el.value;
    const pos = el.selectionStart ?? value.length;
    const before = value.slice(0, pos);
    const trigger = suggest.kind === 'character' ? '@' : '#';
    const re = suggest.kind === 'character'
      ? /@[\u4e00-\u9fa5\w]*$/
      : /#[\u4e00-\u9fa5\w]*$/;
    const replaced = before.replace(re, `${trigger}${s.label}`);
    const next = replaced + value.slice(pos);
    setDraftContent(next);
    setDirty(true);
    setSuggest(null);
    requestAnimationFrame(() => {
      el.focus();
      const caret = replaced.length;
      el.setSelectionRange(caret, caret);
    });
  };

  // AI 辅助：选中文本浮层
  const handleSelect = () => {
    const el = textareaRef.current;
    if (!el) return;
    const sel = el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
    if (sel.trim().length > 0) {
      const rect = el.getBoundingClientRect();
      // 定位到 textarea 顶部内侧，避免长文时浮层溢出视口
      const top = Math.min(8, rect.height - 48);
      setAiMenu({ top, left: 8 });
    } else {
      setAiMenu(null);
    }
  };

  const runAiAssist = async (action: 'expand' | 'rewrite' | 'summarize') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const sel = el.value.slice(start, end);
    if (!sel.trim()) return;
    setAiMenu(null);
    // mock 期：本地占位变换；后端期替换为 SSE 调用
    const resultMap = {
      expand: `${sel}\n\n（扩写：在原有基础上延展情节与描写，保持基调一致。）`,
      rewrite: `${sel}\n\n（改写：优化节奏与措辞，保留原意。）`,
      summarize: `${sel}\n\n（缩写：提炼要点，压缩冗余。）`,
    };
    const next = el.value.slice(0, start) + resultMap[action] + el.value.slice(end);
    setDraftContent(next);
    setDirty(true);
    toast.success(`已${action === 'expand' ? '扩写' : action === 'rewrite' ? '改写' : '缩写'}`);
  };

  // Ctrl+Space 触发联想（由全局快捷键调用）
  useEffect(() => {
    const handler = () => {
      if (freq === 'manual' && textareaRef.current) {
        const el = textareaRef.current;
        const pos = el.selectionStart ?? 0;
        const before = el.value.slice(0, pos);
        const at = before.match(/@[\u4e00-\u9fa5\w]*$/);
        if (at) showSuggest('character', at[0].slice(1), el, pos);
        else showSuggest('setting', '', el, pos);
      }
    };
    (window as unknown as { __tfTriggerSuggestion?: () => void }).__tfTriggerSuggestion = handler;
    return () => { delete (window as unknown as { __tfTriggerSuggestion?: () => void }).__tfTriggerSuggestion; };
  }, [freq, charSuggestions, settingKeywords]);

  // 发送到工作台：先确认是否同步为「全局项目 steps」
  const openSend = () => { if (active) setSendOpen(true); };
  const confirmSend = async (syncGlobal: boolean) => {
    if (!active) return;
    if (syncGlobal) {
      await importManuscriptToProject(projectId, active.title, active.content);
      toast.success('已同步到工作台（作为项目步骤，可被 Agent 流读取为前文）');
    } else {
      // 仅本地草稿已在手稿，这里提示保持本地
      toast.success('已留在手稿本地（未同步到工作台）');
    }
    setSendOpen(false);
  };

  // 书籍导入（txt）：解析为章节，可选「仅手稿」或「同步工作台」
  const onPickBook = async (file: File) => {
    const text = await file.text();
    const parsed = parseBookText(text);
    setBookName(file.name.replace(/\.txt$/i, ''));
    setBookChapters(parsed);
  };
  const confirmBookImport = async (syncGlobal: boolean) => {
    if (!bookChapters) return;
    if (syncGlobal) {
      const n = await importBookToProject(projectId, bookChapters);
      toast.success(`已导入 ${n} 章到工作台（Agent 续写将以此为前文）`);
    } else {
      for (const c of bookChapters) {
        await useManuscriptStore.getState().importFromStep(projectId, c.title, c.content);
      }
      toast.success(`已导入 ${bookChapters.length} 章到手稿（本地续写）`);
    }
    setBookChapters(null);
  };

  const [askBookTxt, setAskBookTxt] = useState(false);

  const handleExportBook = (fmt: 'markdown' | 'txt') => {
    if (fmt === 'markdown') {
      exportManuscriptBook(projectId, 'markdown').then(() => setExportOpen(false));
      return;
    }
    setAskBookTxt(true);
  };
  const doExportBookTxt = (mode: 'tidy' | 'format') => {
    exportManuscriptBook(projectId, 'txt', mode)
      .then(() => { setAskBookTxt(false); setExportOpen(false); });
  };

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
              <Button size="sm" variant="destructive" onClick={() => { void clearProject(projectId).then(() => { setActiveId(null); setClearOpen(false); toast.success('手稿已清空'); }); }}>
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
                toast.success('章节已删除');
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

