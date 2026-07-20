// src/lib/hooks/useManuscriptEditor.ts
// ManuscriptEditor 的逻辑层：承载全部受控 state、派生值、文件导入/导出、联想与 AI 辅助、
// 自动保存与发送至工作台等副作用，让 ManuscriptEditor 组件退化为纯视图（页面=布局 / hooks=逻辑 分层）。
// 行为与抽离前保持一致，未做功能改动。
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { useManuscriptStore } from '../stores/manuscriptStore';
import { useProjectCharacters } from '@/features/projects';
import { useBriefStore } from '@/features/projects';
import { useSettingsStore } from '@/lib/stores/settingsStore';
import type { ProjectBrief, ManuscriptChapter } from '@/types';
import { buildSettingKeywords, buildCharSuggestions, computeSuggestionsFor } from './manuscriptSuggestions';
import { makeManuscriptIO } from './manuscriptIO';

export type SuggestionKind = 'character' | 'setting' | 'hint';
export interface Suggestion { kind: SuggestionKind; label: string; detail?: string; }

export interface SuggestState {
  items: Suggestion[];
  query: string;
  kind: SuggestionKind;
  top: number;
  left: number;
}

export function useManuscriptEditor(projectId: string) {
  const allChapters = useManuscriptStore((s) => s.chapters);
  const chapters = useMemo(() => allChapters.filter((c) => c.projectId === projectId), [allChapters, projectId]);
  const addChapter = useManuscriptStore((s) => s.addChapter);
  const updateChapter = useManuscriptStore((s) => s.updateChapter);
  const removeChapter = useManuscriptStore((s) => s.removeChapter);
  const clearProject = useManuscriptStore((s) => s.clearProject);

  const { projectChars: characters } = useProjectCharacters(projectId);
  const brief = useBriefStore((s) => s.briefs[projectId]) as ProjectBrief | undefined;
  const freq = useSettingsStore((s) => s.suggestionFrequency);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [title, setTitle] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // 非受控 textarea 的最新生效文本：每次按键只更新 ref（不触发 React 重渲染），
  // 节流 commit 到 state 供字数/预览派生展示，自动保存也只读取 ref，避免整编辑器重渲染。
  const latestContentRef = useRef('');
  // 节流 commit 句柄
  const commitRafRef = useRef<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 联想弹层状态
  const [suggest, setSuggest] = useState<SuggestState | null>(null);
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

  // 角色数据由 useProjectCharacters 在进入时按需同步，保证 @ 角色联想始终有候选

  const dismissSuggestHint = () => {
    setShowSuggestHint(false);
    try { localStorage.setItem('tf_manuscript_suggest_hint_seen', '1'); } catch { /* ignore */ }
  };

  const active = useMemo(() => chapters.find((c) => c.id === activeId) ?? null, [chapters, activeId]);

  // 首次进入自动建一章。用「进行中」标记防严格模式双调用 + load 未 await 竞态导致重复建章，
  // 但锁是单次请求级而非永久：删光章节后 chapters.length 回到 0，本次请求已结束，
  // 标记复位，可重新自动建章，避免空手稿无法恢复（边界数据丢失风险）。
  const ensuringRef = useRef(false);
  useEffect(() => {
    if (ensuringRef.current) return;
    if (chapters.length === 0) {
      ensuringRef.current = true;
      addChapter(projectId, '第 1 章')
        .then((c) => { setActiveId(c.id); setDraftContent(''); setTitle(c.title); })
        .finally(() => { ensuringRef.current = false; });
    } else if (!activeId) {
      setActiveId(chapters[0].id);
    }
  }, [chapters.length, activeId]);

  // 切换章节时载入内容（非受控：直接写 textarea DOM + ref，避免受控重渲染）
  useEffect(() => {
    if (active) {
      latestContentRef.current = active.content;
      if (textareaRef.current) textareaRef.current.value = active.content;
      setDraftContent(active.content);
      setTitle(active.title);
      setDirty(false);
    }
  }, [active?.id]);

  // 统一提交文本：同步 ref / state / DOM（供联想替换、AI 动作等非受控修改路径调用）
  const commitContent = useCallback((value: string) => {
    latestContentRef.current = value;
    if (textareaRef.current) textareaRef.current.value = value;
    setDraftContent(value);
    setDirty(true);
  }, []);

  const save = useCallback(async (contentOverride?: string) => {
    if (!activeId || !active) return;
    const content = contentOverride ?? latestContentRef.current ?? draftContent;
    // 纯AI章节经用户编辑后，来源升级为「AI后手工修改」
    const patch: Partial<Pick<ManuscriptChapter, 'title' | 'content' | 'index' | 'source'>> = {
      content,
      title: title || active.title || '未命名章节',
    };
    if (active.source === 'ai') patch.source = 'ai_edited';
    await updateChapter(activeId, patch);
    setDirty(false);
    setSavedAt(Date.now());
  }, [activeId, active, title, updateChapter]);

  // 自动保存（停笔 1s）：合并为单一稳定定时器，仅在 dirty 时触发一次写库，避免长文逐字反复 setTimeout。
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!activeId || !dirty) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void save();
    }, 1000);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [activeId, dirty, save]);

  const settingKeywords = useMemo(() => buildSettingKeywords(brief), [brief]);
  const charSuggestions = useMemo(() => buildCharSuggestions(characters), [characters]);
  const computeSuggestions = (kind: SuggestionKind, query: string): Suggestion[] =>
    computeSuggestionsFor(kind, query, settingKeywords, charSuggestions);

  // 处理输入：检测 @ 或 # 触发联想；高频时自动提示。
  // 非受控：每次按键只写 ref，节流 commit 到 state（仅驱动字数显示），不打断输入流畅度。
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    latestContentRef.current = value;
    if (!dirty) setDirty(true);
    // 节流把内容同步到 state（字数/预览展示），避免逐字重渲染整个编辑器
    if (commitRafRef.current != null) return;
    commitRafRef.current = window.setTimeout(() => {
      commitRafRef.current = null;
      setDraftContent(latestContentRef.current);
    }, 200);
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
    commitContent(next);
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
    commitContent(next);
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

  const [askBookTxt, setAskBookTxt] = useState(false);

  const { openSend, confirmSend, onPickBook, confirmBookImport, handleExportBook, doExportBookTxt } = makeManuscriptIO({
    id: projectId,
    activeId,
    active,
    bookChapters,
    setBookName,
    setBookChapters,
    setAskBookTxt,
    setExportOpen,
    setSendOpen,
  });

  return {
    // 外部 store 派生
    chapters,
    active,
    // 编辑器 state
    activeId,
    setActiveId,
    draftContent,
    setDraftContent,
    title,
    setTitle,
    dirty,
    setDirty,
    savedAt,
    // 浮层 state
    textareaRef,
    suggest,
    setSuggest,
    suggestIndexRef,
    aiMenu,
    setAiMenu,
    fileRef,
    // 对话框 state
    sendOpen,
    setSendOpen,
    bookChapters,
    setBookChapters,
    bookName,
    exportOpen,
    setExportOpen,
    clearOpen,
    setClearOpen,
    pendingDeleteId,
    setPendingDeleteId,
    showSuggestHint,
    askBookTxt,
    setAskBookTxt,
    // store action 透传（供视图里按钮直接调用）
    addChapter,
    removeChapter,
    clearProject,
    // 回调
    dismissSuggestHint,
    save,
    handleInput,
    applySuggestion,
    handleSelect,
    runAiAssist,
    openSend,
    confirmSend,
    onPickBook,
    confirmBookImport,
    handleExportBook,
    doExportBookTxt,
  };
}
