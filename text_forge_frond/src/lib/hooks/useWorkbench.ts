// src/lib/hooks/useWorkbench.ts
// 项目工作台（projects/[id]/page.tsx）的逻辑层：承载全部受控 state、数据加载/草稿恢复/自动保存、
// 生成流（暂停/取消/流式合并）、步骤编辑确认、AI 文本动作、角色状态沉淀、上下文构造等副作用，
// 让页面退化为纯视图（页面=布局 / hooks=逻辑 分层）。行为与抽离前保持一致，未做功能改动。
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Step } from '@/types';
import { BUILTIN_WORKFLOW_ID } from '@/types';
import { fetchProjectDetail, fetchProjectMeta, confirmStep, saveStepEdit, bindWorkflow, generateWithWorkflow } from '@/lib/api/projects';
import { onInsertStep } from '@/lib/events/projectEvents';
import { useProjectStore } from '@/lib/stores/projectStore';
import { useBriefStore, briefToContextLine, briefSectionsToContext } from '@/lib/stores/briefStore';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { useManuscriptStore } from '@/lib/stores/manuscriptStore';
import { API_URL } from '@/lib/config/env';
import { listWorkflowsWithBuiltin, type Workflow } from '@/lib/api/workflow';
import { characterRoleLabel } from '@/lib/workflow/agentRoles';
import { loadOutline, type OutlineVolume } from '@/lib/storage/backup';
import { generateSeed } from '@/lib/seed/generate';

export function useWorkbench(projectId: string) {
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
  // 大纲结构化数据（从 IndexedDB 载入，供生成上下文折叠）
  const [outlineVolumes, setOutlineVolumes] = useState<OutlineVolume[]>([]);

  const brief = useBriefStore((s) => s.briefs[projectId]);
  const projectChars = useCharacterStore((s) => s.characters).filter((c) => (c.projectId ?? null) === projectId);

  // 角色 id → 名称 映射（用于把关系链 targetId 解析为可读名，注入生成上下文）
  const charNameById = useCallback(
    (id: string) => projectChars.find((c) => c.id === id)?.name ?? '',
    [projectChars],
  );

  // 大纲步引导：读取本地大纲备份，存在卷/章/节点即视为已就绪
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
    loadOutline(projectId).then((vols) => {
      setOutlineVolumes(vols ?? []);
      setOutlineReady((vols ?? []).length > 0);
    }).catch(() => setOutlineReady(false));
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

  // 构造章节级注入上下文：分层组织为「设定基座 / 大纲骨架 / 出场角色 / 相关维度 / 剧情摘要」，
  // 结构清晰且前后端可同时消费（文本兜底 + 结构化树），保证所有编辑过的字段都被生成读到的。
  const buildContext = () => {
    const briefLine = briefToContextLine(brief);

    // —— 出场角色（含故事定位 + 结构化关系链）——
    const contextChars = projectChars
      .filter((c) => selectedCharIds.includes(c.id))
      .map((c) => ({
        name: c.name,
        role: c.role && c.role !== 'custom' ? characterRoleLabel(c.role) : c.role === 'custom' ? (c.customRole ?? undefined) : undefined,
        description: c.description,
        currentProfile: c.currentProfile,
        status: c.status ?? '存活',
        relationships: c.relationships?.length
          ? c.relationships
              .filter((r) => r.targetId && r.relation.trim())
              .map((r) => ({ target: charNameById(r.targetId) || r.targetId, relation: r.relation.trim() }))
          : undefined,
      }));

    // —— 大纲骨架：文本折叠（mock 兜底）+ 结构化树（后端精确消费）——
    const outlineText = outlineVolumes.length
      ? outlineVolumes
          .map((vol) =>
            vol.chapters
              .map((ch) =>
                ch.nodes
                  .map((n) => `· ${vol.title}/${ch.title}：${n.title}${n.content ? `（${n.content}）` : ''}`)
                  .join('\n'),
              )
              .join('\n'),
          )
          .join('\n')
      : undefined;
    const outlineTree = outlineVolumes.length ? outlineVolumes : undefined;

    // —— 相关设定维度（仅本章挑选的自定义维度）——
    const sectionLine = briefSectionsToContext(brief?.sections, selectedSectionIds);
    const sections = sectionLine
      ? sectionLine.split('；').map((s) => {
          const idx = s.indexOf('：');
          return idx > -1 ? { title: s.slice(0, idx), content: s.slice(idx + 1) } : { title: '', content: s };
        })
      : undefined;

    return {
      project_id: projectId,
      project_title: projectTitle,
      brief: briefLine,
      plot_summary: plotSummary || undefined,
      outline: outlineText,
      outlineTree,
      characters: contextChars.length ? contextChars : undefined,
      sections,
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
  // 扫描正文中出现的角色名（与项目角色匹配）即沉淀，不再依赖「本章勾选出场」（避免正文写了角色死亡却被漏掉）。
  const depositCharacterProfiles = async (text: string) => {
    if (!projectChars.length) return;
    const updateCharacter = useCharacterStore.getState().updateCharacter;
    for (const c of projectChars) {
      const name = c.name?.trim();
      if (!name) continue;
      const mention = text.includes(name);
      if (!mention) continue;
      const died = /死亡|陨落|牺牲|毙命|咽气/.test(text);
      if (died && c.status !== '死亡') {
        const note = `于剧情中死亡（由生成结果自动沉淀）`;
        const base = c.currentProfile ? `${c.currentProfile}\n` : '';
        try {
          await updateCharacter(c.id, { status: '死亡', currentProfile: `${base}${note}` });
        } catch { /* 忽略 */ }
      } else if (!c.currentProfile?.includes('本章出场')) {
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

  return {
    // 外部数据
    brief,
    projectChars,
    isPreviewMode,
    isLoading,
    // 视图 / 状态标志
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
    // 步骤 / 编辑
    steps,
    editingMap,
    savedAt,
    handleEditStart,
    handleEditCancel,
    handleSaveEdit,
    handleConfirm,
    handleSkip,
    handleSendToManuscript,
    // 生成流
    currentAgent,
    handleGenerate,
    // AI 动作
    aiDialog,
    setAiDialog,
    handleAiAction,
    applyAiResult,
    // 章节上下文选择
    selectedCharIds,
    selectedSectionIds,
    toggleChar,
    toggleSection,
    // 工作流
    workflows,
    activeWorkflowId,
    activeWorkflow,
    handleBindWorkflow,
    // 引导态
    outlineReady,
    // 写入辅助
    scrollRef,
    // 一句话开局
    seedPrompt,
    setSeedPrompt,
    isSeeding,
    handleSeed,
    // 直接写
    handleWriteFirstChapter,
    // 标题 / 字数
    projectTitle,
    totalWords,
    completedWords,
  };
}
