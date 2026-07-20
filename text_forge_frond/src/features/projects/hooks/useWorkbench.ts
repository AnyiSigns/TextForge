// src/lib/hooks/useWorkbench.ts
// 项目工作台（projects/[id]/page.tsx）的逻辑层：承载全部受控 state、数据加载/草稿恢复/自动保存、
// 生成流（暂停/取消/流式合并）、步骤编辑确认、AI 文本动作、角色状态沉淀、上下文构造等副作用，
// 让页面退化为纯视图（页面=布局 / hooks=逻辑 分层）。行为与抽离前保持一致，未做功能改动。
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Step } from '@/types';
import { BUILTIN_WORKFLOW_ID } from '@/types';
import { fetchProjectDetail, fetchProjectMeta, confirmStep, saveStepEdit, bindWorkflow } from '@/features/projects';
import { onInsertStep } from '@/lib/events/projectEvents';
import { useProjectStore } from '@/features/projects';
import { useBriefStore } from '@/features/projects';
import { useCharacterStore } from '@/features/characters';
import { useManuscriptStore } from '@/lib/stores/manuscriptStore';
import { listWorkflowsWithBuiltin, type Workflow } from '@/features/workflow';
import { API_URL } from '@/lib/config/env';
import { loadOutline, type OutlineVolume } from '@/lib/storage/backup';
import { makeBuildContext, makeSummarizePlot, makeDepositCharacterProfiles } from './workbenchContext';
import { makeGeneration } from './workbenchGenerate';
import { makeSeedActions } from './workbenchSeed';

export function useWorkbench(projectId: string) {
  const [isGraphOpen, setIsGraphOpen] = useState(true);
  const [seedPrompt, setSeedPrompt] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [editingMap, setEditingMap] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const isPreviewMode = API_URL === '';
  const [showPreviewNote, setShowPreviewNote] = useState(isPreviewMode);
  const [isLoading, setIsLoading] = useState(true);
  const [projectTitle, setProjectTitle] = useState<string | undefined>();
  const [plotSummary, setPlotSummary] = useState('');
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>(BUILTIN_WORKFLOW_ID);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [aiDialog, setAiDialog] = useState<{ open: boolean; result: string; stepId: string | null; targetContent: string }>({
    open: false, result: '', stepId: null, targetContent: '',
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);

  const [outlineReady, setOutlineReady] = useState(false);
  const [outlineVolumes, setOutlineVolumes] = useState<OutlineVolume[]>([]);

  const brief = useBriefStore((s) => s.briefs[projectId]);
  const projectChars = useCharacterStore((s) => s.characters).filter((c) => (c.projectId ?? null) === projectId);

  const charNameById = useCallback(
    (id: string) => projectChars.find((c) => c.id === id)?.name ?? '',
    [projectChars],
  );

  const buildContext = useCallback(
    makeBuildContext({ projectId, projectTitle, brief, projectChars, selectedCharIds, outlineVolumes, plotSummary, selectedSectionIds, charNameById }),
    [projectId, projectTitle, brief, projectChars, selectedCharIds, outlineVolumes, plotSummary, selectedSectionIds, charNameById],
  );
  const summarizePlot = useCallback(makeSummarizePlot(projectId), [projectId]);
  const depositCharacterProfiles = useCallback(makeDepositCharacterProfiles(projectChars), [projectChars]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const outline = await loadOutline(projectId);
        if (!cancelled) {
          setOutlineVolumes(outline);
          setOutlineReady(outline.length > 0);
        }
      } catch {
        if (!cancelled) setOutlineReady(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    const loadProject = async () => {
      try {
        const loadedSteps = await fetchProjectDetail(projectId);
        setSteps(loadedSteps);
        const draft = await useProjectStore.getState().getDraft(projectId);
        const draftChanged = !!draft && (
          draft.length !== loadedSteps.length ||
          draft.some((d, i) => d.content !== loadedSteps[i]?.content)
        );
        if (draftChanged) {
          setSteps(draft);
          toast.info('已恢复草稿');
        }
      } catch (e) {
        toast.error('加载失败', { description: e instanceof Error ? e.message : '未知错误' });
      } finally {
        setIsLoading(false);
      }
    };
    loadProject();
    loadOutline(projectId).then((vols) => {
      setOutlineVolumes(vols ?? []);
      setOutlineReady((vols ?? []).length > 0);
    }).catch(() => setOutlineReady(false));
    fetchProjectMeta(projectId).then((p) => setProjectTitle(p.title)).catch(() => {});
    listWorkflowsWithBuiltin().then((list) => {
      setWorkflows(list);
      const wf = list.find((w) => w.id === activeWorkflowId) ?? list.find((w) => w.id === BUILTIN_WORKFLOW_ID) ?? null;
      if (wf) { setActiveWorkflow(wf); setActiveWorkflowId(wf.id); }
    }).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (scrollRef.current) {
      const last = scrollRef.current.querySelector('[data-step-card]:last-of-type')
        ?? scrollRef.current.lastElementChild?.lastElementChild
        ?? null;
      (last as HTMLElement | null)?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }
  }, [steps]);

  useEffect(() => {
    return onInsertStep((detail) => {
      if (detail.projectId !== projectId) return;
      if (detail.target?.kind === 'chapter') {
        const stepId = detail.target.stepId;
        setSteps((prev) => prev.map((s) => {
          if (s.id !== stepId) return s;
          const tail = s.content && !s.content.endsWith('\n') ? '\n' : '';
          return { ...s, content: `${s.content || ''}${tail}${detail.content}`, status: 'completed' };
        }));
        const ch = steps.find((s) => s.id === stepId);
        toast.success(`已把角色图插入到「${ch?.content?.match(/^#\s*(.+)$/m)?.[1] || '该章'}」正文`);
        return;
      }
      const step: Step = {
        id: `step-${Date.now()}`,
        agent: detail.title || '大纲/灵感',
        content: detail.content,
        status: 'completed',
      };
      setSteps((prev) => [...prev, step]);
      toast.success('已插入章节，可在下方续写');
    });
  }, [projectId, steps]);

  useEffect(() => {
    if (steps.length > 0 && !isStreaming) {
      const timer = setTimeout(() => {
        useProjectStore.getState().saveDraft(projectId, steps);
        toast.success('草稿已保存', { duration: 1500 });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [steps, isStreaming, projectId]);

  const handleConfirm = async (stepId: string) => {
    try {
      await confirmStep(projectId, stepId);
      setSteps(prev => prev.map(s => s.id === stepId ? { ...s, status: 'completed' } : s));
      const step = steps.find(s => s.id === stepId);
      if (step) {
        const titleMatch = step.content.match(/^#\s*(.+)$/m);
        const title = titleMatch?.[1]?.trim() || `${activeWorkflow?.name ?? '章节'}片段`;
        await useManuscriptStore.getState().importFromStep(projectId, title, step.content, step.id, 'ai');
      }
      toast.success('已确认并同步到手稿');
    } catch (e) {
      toast.error('确认失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  const handleSaveEdit = async (stepId: string) => {
    const content = editingMap[stepId];
    if (content === undefined) return;
    try {
      await saveStepEdit(projectId, stepId, content);
      setSteps(prev => prev.map(s => s.id === stepId ? { ...s, content, status: 'completed' } : s));
      setEditingMap(prev => { const n = { ...prev }; delete n[stepId]; return n; });
      setSavedAt(Date.now());
      toast.success('已保存');
    } catch (e) {
      toast.error('保存失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  const handleEditStart = (stepId: string, content: string) =>
    setEditingMap(prev => ({ ...prev, [stepId]: content }));
  const handleEditCancel = (stepId: string) =>
    setEditingMap(prev => { const n = { ...prev }; delete n[stepId]; return n; });

  useEffect(() => {
    const ids = Object.keys(editingMap);
    if (ids.length === 0) return;
    const t = setTimeout(async () => {
      let changed = false;
      const next = [...steps];
      for (const id of ids) {
        const content = editingMap[id];
        if (content === undefined) continue;
        const idx = next.findIndex((s) => s.id === id);
        if (idx > -1 && next[idx].content !== content) {
          next[idx] = { ...next[idx], content };
          changed = true;
        }
        try {
          await saveStepEdit(projectId, id, content);
        } catch { /* 自动保存失败静默，手动保存仍可用 */ }
      }
      if (changed) {
        setSteps(next);
        await useProjectStore.getState().saveDraft(projectId, next).catch(() => {});
      }
      setSavedAt(Date.now());
    }, 1500);
    return () => clearTimeout(t);
  }, [editingMap, projectId, steps]);

  const handleSkip = (stepId: string) => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, status: 'completed' } : s));
    toast.success('已跳过该环节');
  };

  const handleAiAction = async (action: 'expand' | 'rewrite' | 'summarize', text: string, stepId: string) => {
    let out = text;
    if (action === 'expand') {
      out = `${text}\n\n（扩写）${text}`;
    } else if (action === 'rewrite') {
      out = `（改写）${text}`;
    } else if (action === 'summarize') {
      out = text.length > 120 ? text.slice(0, 120) + '…（缩写）' : text;
    }
    try {
      const API_URL = (await import('@/lib/config/env')).API_URL;
      const res = await fetch(`${API_URL}/api/ai/transform`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, text }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.output) out = data.output;
      }
    } catch { /* 回退本地变换 */ }
    const targetContent = steps.find((s) => s.id === stepId)?.content ?? '';
    setAiDialog({ open: true, result: out, stepId, targetContent });
  };

  const applyAiResult = (mode: 'replace' | 'append' | 'copy') => {
    const { result, stepId, targetContent } = aiDialog;
    if (mode === 'copy') {
      navigator.clipboard?.writeText(result).catch(() => {});
      toast.success('已复制到剪贴板');
    } else if (stepId) {
      const next = mode === 'replace' ? result : `${targetContent}\n\n${result}`;
      setEditingMap((prev) => ({ ...prev, [stepId]: next }));
      toast.success(mode === 'replace' ? '已替换到编辑框' : '已追加到编辑框');
    } else {
      toast.info('未找到目标步骤');
    }
    setAiDialog((d) => ({ ...d, open: false }));
  };

  const toggleChar = (id: string) =>
    setSelectedCharIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleSection = (id: string) =>
    setSelectedSectionIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const handleBindWorkflow = async (wfId: string | null) => {
    if (!wfId) return;
    setActiveWorkflowId(wfId);
    const wf = workflows.find((w) => w.id === wfId) ?? null;
    setActiveWorkflow(wf);
    try { await bindWorkflow(projectId, wfId); } catch { /* mock 期静默 */ }
  };

  const {
    handleGenerate,
  } = makeGeneration({
    projectId,
    activeWorkflowId,
    activeWorkflow,
    buildContext,
    summarizePlot,
    depositCharacterProfiles,
    abortRef,
    pausedRef,
    setSteps,
    setCurrentAgent,
    setIsStreaming,
    setPlotSummary,
  });

  const { handleSendToManuscript, handleWriteFirstChapter, handleSeed } = makeSeedActions({
    projectId,
    activeWorkflow,
    seedPrompt,
    isSeeding,
    setSeedOpen,
    setSeeded,
    setIsSeeding,
    setSteps,
    setEditingMap,
  });

  const totalWords = steps.reduce((acc, s) => acc + (s.content?.length || 0), 0);
  const completedWords = steps.reduce((acc, s) => acc + (s.status === 'completed' ? s.content?.length || 0 : 0), 0);

  return {
    brief,
    projectChars,
    isPreviewMode,
    isLoading,
    showPreviewNote,
    setShowPreviewNote,
    seeded,
    seedOpen,
    setSeedOpen,
    isGraphOpen,
    setIsGraphOpen,
    isStreaming,
    isPaused,
    setIsPaused,
    pausedRef,
    steps,
    editingMap,
    savedAt,
    handleEditStart,
    handleEditCancel,
    handleSaveEdit,
    handleConfirm,
    handleSkip,
    handleSendToManuscript,
    currentAgent,
    handleGenerate,
    aiDialog,
    setAiDialog,
    handleAiAction,
    applyAiResult,
    selectedCharIds,
    selectedSectionIds,
    toggleChar,
    toggleSection,
    workflows,
    activeWorkflowId,
    activeWorkflow,
    handleBindWorkflow,
    outlineReady,
    scrollRef,
    seedPrompt,
    setSeedPrompt,
    isSeeding,
    handleSeed,
    handleWriteFirstChapter,
    projectTitle,
    totalWords,
    completedWords,
  };
}
