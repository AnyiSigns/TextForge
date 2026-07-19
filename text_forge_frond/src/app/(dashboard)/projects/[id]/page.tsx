'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { fetchProjectDetail, fetchProjectMeta, confirmStep, saveStepEdit } from '@/lib/api/projects';
import { WorkflowGraph } from '@/components/projects/WorkflowGraph';
import { StepCard } from '@/components/projects/StepCard';
import { ProjectStudio } from '@/components/projects/ProjectStudio';
import { ProjectGuide } from '@/components/projects/ProjectGuide';
import { BriefPanel } from '@/components/projects/BriefPanel';
import { OutlinePanel } from '@/components/projects/OutlinePanel';
import { InspirationBoard } from '@/components/projects/InspirationBoard';
import { ProjectCharactersTab } from '@/components/projects/ProjectCharactersTab';
import { ProjectExport } from '@/components/projects/ProjectExport';
import { PageHeader } from '@/components/shared/PageHeader';
import { Spinner, EmptyState } from '@/components/shared/states';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ProcessNav, type ProcessTab } from '@/components/projects/ProcessNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Send, Pause, Play, FileText, ListTree, Lightbulb, FileCog, Users, Layers, Check, Wand2, Info, PenLine, CheckCircle2, Image as ImageIcon, Clapperboard, BookOpen, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Step } from '@/types';
import { BUILTIN_WORKFLOW_ID } from '@/types';
import { onInsertStep } from '@/lib/events/projectEvents';
import { useProjectStore } from '@/lib/stores/projectStore';
import { useBriefStore, briefToContextLine, briefSectionsToContext } from '@/lib/stores/briefStore';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { useManuscriptStore } from '@/lib/stores/manuscriptStore';
import { API_URL } from '@/lib/config/env';
import { listWorkflowsWithBuiltin, type Workflow } from '@/lib/api/workflow';
import { bindWorkflow, generateWithWorkflow } from '@/lib/api/projects';
import { loadOutline } from '@/lib/storage/backup';
import { generateSeed } from '@/lib/seed/generate';

export default function ProjectWorkbench() {
  const { id: projectId } = useParams<{ id: string }>();

  const [isGraphOpen, setIsGraphOpen] = useState(true);
  // 一句话开局（种子生成）
  const [seedPrompt, setSeedPrompt] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false); // 开局后高亮「可编辑」引导
  const [seedOpen, setSeedOpen] = useState(false); // 顶部常驻「一句话开局」弹窗
  const [steps, setSteps] = useState<Step[]>([]);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  // 每个 step 独立的编辑态（替代原先全局单态 isEditing，避免多 waiting 节点互相串台）
  const [editingMap, setEditingMap] = useState<Record<string, string>>({});
  // 自动保存标记：停笔一段时间后把编辑中的步自动落库，消除"没点保存会不会丢"焦虑
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // 预览模式提示条（API_URL 为空 = 走 dev mock，生成的是示例内容而非 AI 真写）
  const isPreviewMode = API_URL === '';
  const [showPreviewNote, setShowPreviewNote] = useState(isPreviewMode);
  const [isLoading, setIsLoading] = useState(true);
  const [projectTitle, setProjectTitle] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState('workbench');
  const [plotSummary, setPlotSummary] = useState('');        // summarizer 压缩后的剧情摘要
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);  // 本章出场角色
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]); // 本章相关维度
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string>(BUILTIN_WORKFLOW_ID);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  // AI 文本动作的待确认结果（让用户选择 替换/追加/复制）
  const [aiDialog, setAiDialog] = useState<{ open: boolean; result: string; stepId: string | null; targetContent: string }>({
    open: false, result: '', stepId: null, targetContent: '',
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);

  const [outlineReady, setOutlineReady] = useState(false);

  const brief = useBriefStore((s) => s.briefs[projectId]);
  const projectChars = useCharacterStore((s) => s.characters).filter((c) => (c.projectId ?? null) === projectId);

  // 大纲步引导：读取本地大纲备份，存在卷/章/节点即视为已就绪
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const outline = await loadOutline(projectId);
        if (!cancelled) setOutlineReady(outline.length > 0);
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
        // 草稿存在且与线上不同（步数不同，或任一对应步内容有改动）即恢复，确保"刷新不丢"
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
    loadOutline(projectId).then((vols) => setOutlineReady((vols ?? []).length > 0)).catch(() => setOutlineReady(false));
    fetchProjectMeta(projectId).then((p) => setProjectTitle(p.title)).catch(() => {});
    listWorkflowsWithBuiltin().then((list) => {
      setWorkflows(list);
      // 项目已绑定工作流则用之，否则内置
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
      // 二级定位：插入到指定章节正文
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
      // 默认：追加到工作台最新
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

  // 构造章节级注入上下文：仅出场角色 + 状态变化角色 + 压缩剧情 + 相关维度
  const buildContext = () => {
    const briefLine = briefToContextLine(brief);
    const contextChars = projectChars
      .filter((c) => selectedCharIds.includes(c.id))
      .map((c) => ({
        name: c.name,
        description: c.description,
        currentProfile: c.currentProfile,
        status: c.status ?? '存活',
      }));
    const sectionLine = briefSectionsToContext(brief?.sections, selectedSectionIds);
    return {
      project_id: projectId,
      project_title: projectTitle,
      brief: briefLine,
      plot_summary: plotSummary || undefined,
      characters: contextChars.length ? contextChars : undefined,
      sections: sectionLine ? sectionLine.split('；').map((s) => {
        const idx = s.indexOf('：');
        return idx > -1 ? { title: s.slice(0, idx), content: s.slice(idx + 1) } : { title: '', content: s };
      }) : undefined,
    };
  };

  // 本地/后端 summarizer（cheap 档）：压缩已完成章节为摘要，供下一章注入。
  // 后端就绪时走 /api/projects/:id/summarize（用便宜模型）；mock 期做轻量压缩。
  const summarizePlot = async (text: string): Promise<string> => {
    if (!text.trim()) return '';
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.summary) return data.summary;
      }
    } catch { /* 回退本地压缩 */ }
    // 本地压缩：按段落保留首尾 + 截断，控制长度（省 token）
    const paras = text.split(/\n{2,}|\n/).map((s) => s.trim()).filter(Boolean);
    if (paras.length <= 6) return text.slice(0, 2000);
    const head = paras.slice(0, 3).join('\n');
    const tail = paras.slice(-3).join('\n');
    return `（前文要点）${head}\n…\n（最新进展）${tail}`.slice(0, 2000);
  };

  // 复盘师逻辑（cheap 档）：把本章出场角色的状态/关系变化沉淀进 currentProfile。
  // 真架构由复盘 agent 提取；mock 期做最小启发式：检测死亡/状态关键词，追加时间线节点。
  const depositCharacterProfiles = async (text: string) => {
    if (!selectedCharIds.length) return;
    const updateCharacter = useCharacterStore.getState().updateCharacter;
    const chars = projectChars.filter((c) => selectedCharIds.includes(c.id));
    for (const c of chars) {
      const mention = text.includes(c.name);
      const died = /死亡|陨落|牺牲|毙命|咽气/.test(text) && mention;
      if (died && c.status !== '死亡') {
        const note = `于剧情中死亡（由生成结果自动沉淀）`;
        const base = c.currentProfile ? `${c.currentProfile}\n` : '';
        try {
          await updateCharacter(c.id, { status: '死亡', currentProfile: `${base}${note}` });
        } catch { /* 忽略 */ }
      } else if (mention && !c.currentProfile?.includes('本章出场')) {
        const note = `本章出场并参与剧情`;
        const base = c.currentProfile ? `${c.currentProfile}\n` : '';
        try {
          await updateCharacter(c.id, { currentProfile: `${base}${note}` });
        } catch { /* 忽略 */ }
      }
    }
  };

  const handleConfirm = async (stepId: string) => {
    try {
      await confirmStep(projectId, stepId);
      setSteps(prev => prev.map(s => s.id === stepId ? { ...s, status: 'completed' } : s));
      // 工作台确认 AI 正文即自动同步到手稿（来源：纯AI），作家可在手稿继续人写/修改
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

  // 自动保存（停笔 1.5s）：把编辑中的每一步正文落库并写入本地草稿，刷新也不丢
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

  // 跳过某 waiting 节点：标记 failed 让其不再阻塞续写流程（保留痕迹）
  const handleSkip = (stepId: string) => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, status: 'completed' } : s));
    toast.success('已跳过该环节');
  };

  // 本地 AI 文本动作（mock 期无真实模型，做轻量变换；后端就绪期可替换为真实调用）。
  // 计算结果后弹窗让用户决定「替换 / 追加 / 复制」，避免直接覆盖用户正文。
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

  // 用户选择如何应用 AI 动作结果
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

  // 切换项目绑定的创作流水线（工作流）
  const handleBindWorkflow = async (wfId: string | null) => {
    if (!wfId) return;
    setActiveWorkflowId(wfId);
    const wf = workflows.find((w) => w.id === wfId) ?? null;
    setActiveWorkflow(wf);
    try { await bindWorkflow(projectId, wfId); } catch { /* mock 期静默 */ }
  };

  const handleGenerate = useCallback(async () => {
    abortRef.current = new AbortController();
    setIsStreaming(true);
    setCurrentAgent(null);
    try {
      const newSteps = await generateWithWorkflow(projectId, {
        workflowId: activeWorkflowId,
        context: buildContext(),
        runOpts: { simulateDelay: true },
        // 暂停信号：读取 pausedRef（由暂停/继续按钮实时切换）
        shouldPause: () => pausedRef.current,
        // 取消信号：由 abortRef 控制（重新生成/卸载时取消）
        isAborted: () => !!abortRef.current?.signal.aborted,
        onStep: (step) => {
          setSteps((prev) => {
            // 合并键优先用 nodeId（流式单元已带，稳定不重名）；
            // 回退到 agent 以兼容缺 nodeId 的预置/脏数据。
            const idx = prev.findIndex((s) => (step.nodeId && s.nodeId === step.nodeId) || s.agent === step.agent);
            if (idx >= 0) {
              const existing = prev[idx];
              const next = [...prev];
              // 不降级：若已存在 writer 的 waiting（待确认正文），流式 completed 单元不应覆盖它；
              // 其余情况以最新流式内容更新。
              const keepStatus = existing.status === 'waiting' ? 'waiting' : step.status;
              next[idx] = { ...existing, content: step.content, status: keepStatus, nodeId: step.nodeId };
              return next;
            }
            if (step.agent === 'writer' || step.nodeId === 'writer') setCurrentAgent('writer');
            return [...prev, step];
          });
        },
      });
      toast.success(`已用「${activeWorkflow?.name ?? '创作流水线'}」生成 ${newSteps.length} 个环节`);
      if (newSteps.length) {
        const text = newSteps.map((s) => s.content).join('\n');
        summarizePlot(text).then(setPlotSummary).catch(() => {});
        depositCharacterProfiles(text).catch(() => {});
        useProjectStore.getState().saveVersion(projectId, newSteps).catch(() => {});
      }
    } catch (e) {
      toast.error('生成失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setIsStreaming(false);
      setCurrentAgent(null);
    }
  }, [projectId, activeWorkflowId, activeWorkflow?.name, buildContext, summarizePlot, depositCharacterProfiles]);

  // 把某一步导入到手稿（作家续写）
  const handleSendToManuscript = async (step: Step) => {
    const titleMatch = step.content.match(/^#\s*(.+)$/m);
    const title = titleMatch?.[1]?.trim() || `${activeWorkflow?.name ?? '章节'}片段`;
    await useManuscriptStore.getState().importFromStep(projectId, title, step.content, step.id, 'ai');
    toast.success('已发送到手稿（可继续人写）');
  };

  // 轻量起点：作者只想"直接写一章"时，不跑整条流水线，
  // 直接插入一个 writer 空步骤（等待确认），点「修改」即可人写。
  // 后端就绪后可由真实模型生成，本入口仅提供"先写起来"的低门槛路径。
  const handleWriteFirstChapter = () => {
    const step: Step = {
      id: `step-${Date.now()}`,
      agent: 'writer',
      nodeId: 'writer',
      content: '# 第一章\n\n',
      status: 'waiting',
    };
    setSteps((prev) => [...prev, step]);
    setEditingMap((prev) => ({ ...prev, [step.id]: step.content }));
    toast.info('已开好第一章，直接在下方修改即可');
  };

  // 一句话开局：种子生成世界观/角色/大纲，增量合并回填三个 store，再衔接流水线
  const handleSeed = async () => {
    if (!seedPrompt.trim() || isSeeding) return;
    setIsSeeding(true);
    try {
      await generateSeed(projectId, seedPrompt.trim());
      setSeeded(true);
      setSeedOpen(false);
      toast.success('已生成世界观/角色/大纲，去各标签微调后就能生成正文');
    } catch (e) {
      toast.error('开局生成失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setIsSeeding(false);
    }
  };

  const totalWords = steps.reduce((acc, s) => acc + (s.content?.length || 0), 0);
  const completedWords = steps.reduce((acc, s) => acc + (s.status === 'completed' ? s.content?.length || 0 : 0), 0);

  if (isLoading) return <Spinner label="正在加载项目工作台..." />;

  const PROCESS_TABS: ProcessTab[] = [
    { value: 'workbench', label: '工作台', icon: FileText },
    { value: 'outline', label: '大纲', icon: ListTree },
    { value: 'inspiration', label: '灵感', icon: Lightbulb },
    { value: 'brief', label: '创作设定', icon: FileCog },
    { value: 'characters', label: '角色', icon: Users },
    { value: 'material', label: '角色素材', icon: ImageIcon },
    { value: 'animation', label: '章节动画', icon: Clapperboard },
  ];

  return (
    <div className="page-shell pb-8 min-h-full">
      <PageHeader
        title="项目工作台"
        description={`${steps.length} 步 · ${totalWords.toLocaleString()} 字（已完成 ${completedWords.toLocaleString()} 字）`}
        actions={<ProjectExport projectId={projectId} compact />}
      />

      {/* 预览模式提示：后端未就绪时生成的是本地示例，非 AI 真写 */}
      {showPreviewNote && isPreviewMode && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="flex-1">
            当前为<strong>预览模式</strong>：下方「生成」产出的是本地示例内容（占位），并非 AI 真正写作。配置后端地址 / 模型密钥后，这里才会由 AI 按你的设定生成正文。你也可以直接点「写第一章」自己动手写。
          </p>
          <button onClick={() => setShowPreviewNote(false)} className="shrink-0 text-amber-600/70 hover:text-amber-700 dark:hover:text-amber-200 underline-offset-2 hover:underline">知道了</button>
        </div>
      )}

      {/* 创作流水线选择器：内置 / 用户工作流（多模板应用） */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Wand2 className="w-3.5 h-3.5" /> 创作流水线
        </span>
        <Select value={activeWorkflowId} onValueChange={handleBindWorkflow}>
          <SelectTrigger className="w-[220px]"><SelectValue>{(v: string) => workflows.find((w) => w.id === v)?.name ?? v}</SelectValue></SelectTrigger>
          <SelectContent>
            {workflows.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.builtin ? `${w.name}（内置）` : w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" asChild>
          <a href="/workflow" className="text-xs">去编排 / 新建工作流</a>
        </Button>
        {/* 4.3 工作台自动保存安心感：编辑中提示停笔自动留底，保存后常驻"已自动保存" */}
        <span className="text-xs text-muted-foreground/80 flex items-center gap-1 ml-auto">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
          {Object.keys(editingMap).length > 0
            ? '正在编辑，停笔即自动保存'
            : savedAt
              ? '已自动保存'
              : '内容会实时保存'}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={() => setSeedOpen(true)}>
            <Sparkles className="w-4 h-4 mr-1.5" /> 一句话开局
          </Button>
          <Button variant="outline" size="sm" onClick={handleWriteFirstChapter}>
            <PenLine className="w-4 h-4 mr-1.5" /> 自己写一章
          </Button>
        </div>
      </div>

      {/* 步骤引导：根据数据状态高亮「下一步」 */}
      <ProjectGuide
        onJump={(tab) => setActiveTab(tab)}
        steps={[
          { key: 'brief', label: '创作设定', icon: FileCog, hint: '先写世界观/基调，注入生成', done: !!brief?.worldview || !!brief?.tone, tab: 'brief' },
          { key: 'char', label: '角色', icon: Users, hint: '创建出场角色，生成更贴人物', done: projectChars.length > 0, tab: 'characters' },
          { key: 'outline', label: '大纲', icon: BookOpen, hint: '用大纲规划卷/章/节点，再生成更结构化的正文', done: outlineReady, tab: 'outline' },
          { key: 'gen', label: '生成正文', icon: Wand2, hint: `用「${activeWorkflow?.name ?? '创作流水线'}」产出章节`, done: steps.some((s) => s.content), tab: 'workbench' },
          { key: 'confirm', label: '确认 / 续写', icon: Check, hint: '确认 AI 正文或人写手稿', done: steps.some((s) => s.status === 'completed'), tab: 'workbench' },
        ]}
      />

      <ProcessNav tabs={PROCESS_TABS} value={activeTab} onValueChange={setActiveTab}>
        {activeTab === 'workbench' && (
          <>
            {/* 章节级上下文选择器：出场角色 + 相关设定维度 */}
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <Card className="glass-card">
                <CardContent className="pt-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> 本章出场角色</p>
                  {projectChars.length === 0 ? (
                    <p className="text-xs text-muted-foreground">暂无角色，去「角色」标签创建。</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {projectChars.map((c) => {
                        const on = selectedCharIds.includes(c.id);
                        return (
                          <button key={c.id} onClick={() => toggleChar(c.id)}
                            className={`px-2.5 py-1 rounded-full text-xs border flex items-center gap-1 ${on ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}>
                            {on && <Check className="w-3 h-3" />} {c.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardContent className="pt-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> 本章相关设定维度</p>
                  {(brief?.sections ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">暂无自定义维度，去「创作设定」添加（势力/战力/阵营…）。</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {brief!.sections!.map((sec) => {
                        const on = selectedSectionIds.includes(sec.id);
                        return (
                          <button key={sec.id} onClick={() => toggleSection(sec.id)}
                            className={`px-2.5 py-1 rounded-full text-xs border flex items-center gap-1 ${on ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}>
                            {on && <Check className="w-3 h-3" />} {sec.title}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <WorkflowGraph
              steps={steps}
              currentAgent={currentAgent}
              isOpen={isGraphOpen}
              onToggle={() => setIsGraphOpen(o => !o)}
              workflow={activeWorkflow}
              workflowName={activeWorkflow?.name}
            />

            {/* 首次进入空态引导：一句话开局 + 手动引导 */}
            {steps.length === 0 && !brief?.worldview && projectChars.length === 0 && (
              <div className="my-4 space-y-4">
                {/* 一句话开局卡片 */}
                <Card className="glass-card border-primary/40">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Sparkles className="w-4 h-4 text-primary" />
                      一句话开局
                    </div>
                    <p className="text-xs text-muted-foreground">
                      输入一句话（如「一艘拾荒船打捞星海记忆的科幻故事」），自动生成世界观、角色与大纲，再进流水线写正文。
                    </p>
                    <Button size="sm" onClick={() => setSeedOpen(true)}>
                      <Sparkles className="w-4 h-4 mr-1.5" /> 一句话开局
                    </Button>
                    {seeded && (
                      <div className="flex items-start gap-2 rounded-lg bg-primary/10 border border-primary/30 p-2.5 text-xs text-primary/90">
                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>已生成世界/角色/大纲，默认可编辑。建议<strong>先改一处</strong>（如世界观或主角名），让它更像你的作品，再去「生成正文」。</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <EmptyState
                  icon={Wand2}
                  title="或手动开始"
                  description="按引导四步走：①写创作设定 ②建角色 ③选流水线生成 ④确认/续写。随时可去「手稿」自己写。"
                  action={
                    <div className="flex gap-2 justify-center flex-wrap">
                      <Button size="sm" onClick={handleWriteFirstChapter}><PenLine className="w-4 h-4 mr-1.5" /> 直接写第一章</Button>
                      <Button size="sm" variant="outline" onClick={() => setActiveTab('brief')}><FileCog className="w-4 h-4 mr-1.5" /> 写创作设定</Button>
                      <Button size="sm" variant="outline" onClick={handleGenerate}><Wand2 className="w-4 h-4 mr-1.5" /> AI 生成</Button>
                    </div>
                  }
                />
              </div>
            )}

            <div className="mt-4 pr-4" ref={scrollRef}>
              <div className="space-y-4 pb-4">
                {steps.length === 0 && (
                  <EmptyState
                    icon={FileText}
                    title="还没有内容"
                    description="点击下方按钮开始生成小说"
                  />
                )}
                {steps.map((step, index) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    index={index}
                    isLast={index === steps.length - 1}
                    isEditing={editingMap[step.id] !== undefined}
                    editContent={editingMap[step.id] ?? ''}
                    onEditChange={(v) => handleEditStart(step.id, v)}
                    onEditStart={(content) => handleEditStart(step.id, content)}
                    onEditCancel={() => handleEditCancel(step.id)}
                    onSaveEdit={handleSaveEdit}
                    onConfirm={handleConfirm}
                    onSendToManuscript={handleSendToManuscript}
                    onSkip={handleSkip}
                    onRetry={handleConfirm}
                    onAiAction={handleAiAction}
                  />
                ))}
              </div>
            </div>

            <div className="border-t border-border/40 pt-4 mt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isStreaming ? (
                  <Button variant="outline" size="sm" onClick={() => {
                    setIsPaused(p => {
                      const next = !p;
                      pausedRef.current = next;
                      return next;
                    });
                  }}>
                    {isPaused ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                    {isPaused ? '继续' : '暂停'}
                  </Button>
                ) : (
                  <>
                    {steps.some(s => s.status === 'waiting') ? (
                      <Button size="sm" onClick={handleGenerate}>
                        <Send className="w-4 h-4 mr-2" /> 继续生成
                      </Button>
                    ) : steps.some(s => s.status === 'completed') ? (
                      <Button size="sm" onClick={handleGenerate}>
                        <Send className="w-4 h-4 mr-2" /> 续写下一章
                      </Button>
                    ) : (
                      <Button size="sm" onClick={handleGenerate}>
                        <Send className="w-4 h-4 mr-2" /> 开始生成
                      </Button>
                    )}
                    {steps.some(s => s.status === 'completed') && (
                      <span className="text-xs text-muted-foreground">正文已生成，可「确认继续」或去「手稿」自己改</span>
                    )}
                  </>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {steps.length} 步 · {steps.filter(s => s.status === 'completed').length} 已完成
              </span>
            </div>
          </>
        )}

        <Dialog open={aiDialog.open} onOpenChange={(open) => setAiDialog((d) => ({ ...d, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>AI 生成结果</DialogTitle>
              <DialogDescription>选择如何应用到该步骤正文</DialogDescription>
            </DialogHeader>
            <div className="max-h-48 overflow-auto rounded-lg border border-border/40 bg-muted/30 p-3 text-xs whitespace-pre-wrap">
              {aiDialog.result}
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => applyAiResult('copy')}>复制</Button>
              <Button size="sm" variant="outline" onClick={() => applyAiResult('append')}>追加</Button>
              <Button size="sm" onClick={() => applyAiResult('replace')}>替换</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={seedOpen} onOpenChange={setSeedOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> 一句话开局</DialogTitle>
              <DialogDescription>输入一句话（如「一艘拾荒船打捞星海记忆的科幻故事」），自动生成世界观、角色与大纲，再进流水线写正文。</DialogDescription>
            </DialogHeader>
            <Input
              value={seedPrompt}
              onChange={(e) => setSeedPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSeed(); }}
              placeholder="用一句话描述你想写的小说…"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSeedOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSeed} disabled={isSeeding || !seedPrompt.trim()}>
                {isSeeding ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                {isSeeding ? '生成中…' : '开局'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {activeTab === 'outline' && <OutlinePanel projectId={projectId} />}
        {activeTab === 'inspiration' && <InspirationBoard projectId={projectId} />}
        {activeTab === 'brief' && <BriefPanel projectId={projectId} projectTitle={projectTitle} />}
        {activeTab === 'characters' && <ProjectCharactersTab projectId={projectId} />}
        {activeTab === 'material' && <ProjectStudio projectId={projectId} steps={steps} mode="character" selectedCharIds={selectedCharIds} />}
        {activeTab === 'animation' && <ProjectStudio projectId={projectId} steps={steps} mode="chapter" selectedCharIds={selectedCharIds} />}
      </ProcessNav>
    </div>
  );
}