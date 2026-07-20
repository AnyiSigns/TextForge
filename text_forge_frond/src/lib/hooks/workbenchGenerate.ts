// src/lib/hooks/workbenchGenerate.ts
// 项目工作台「生成流」相关逻辑：rAF 批量步骤更新 + 调用工作流生成并合并流式结果。
// 纯逻辑层，依赖由 useWorkbench 注入；行为与抽离前一致。
import { useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { generateWithWorkflow } from '@/lib/api/projects';
import { useProjectStore } from '@/lib/stores/projectStore';
import type { Step, GenerationContext } from '@/types';
import type { Workflow } from '@/lib/api/workflow';

export interface GenerationDeps {
  projectId: string;
  activeWorkflowId: string;
  activeWorkflow: Workflow | null;
  buildContext: () => GenerationContext;
  summarizePlot: (text: string) => Promise<string | void>;
  depositCharacterProfiles: (text: string) => Promise<void>;
  abortRef: React.MutableRefObject<AbortController | null>;
  pausedRef: React.MutableRefObject<boolean>;
  setSteps: React.Dispatch<React.SetStateAction<Step[]>>;
  setCurrentAgent: React.Dispatch<React.SetStateAction<string | null>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setPlotSummary: React.Dispatch<React.SetStateAction<string>>;
}

export function makeGeneration(d: GenerationDeps) {
  const { projectId, activeWorkflowId, activeWorkflow, buildContext, summarizePlot, depositCharacterProfiles, abortRef,   pausedRef, setSteps, setCurrentAgent, setIsStreaming, setPlotSummary } = d;

  const stepUpdatesRef = useRef<((prev: Step[]) => Step[])[]>([]);
  const pendingAgentRef = useRef<string | null>(null);
  const flushScheduledRef = useRef(false);

  const flushStepUpdates = useCallback(() => {
    flushScheduledRef.current = false;
    const updates = stepUpdatesRef.current;
    const agent = pendingAgentRef.current;
    stepUpdatesRef.current = [];
    pendingAgentRef.current = null;
    if (updates.length) {
      setSteps((prev) => updates.reduce<Step[]>((acc, u) => u(acc), prev));
    }
    if (agent) setCurrentAgent(agent);
  }, [setSteps, setCurrentAgent]);

  const enqueueStepUpdate = useCallback(
    (update: (prev: Step[]) => Step[]) => {
      stepUpdatesRef.current.push(update);
      if (!flushScheduledRef.current) {
        flushScheduledRef.current = true;
        requestAnimationFrame(() => flushStepUpdates());
      }
    },
    [flushStepUpdates],
  );

  const handleGenerate = useCallback(async () => {
    abortRef.current = new AbortController();
    setIsStreaming(true);
    setCurrentAgent(null);
    try {
      const newSteps = await generateWithWorkflow(projectId, {
        workflowId: activeWorkflowId,
        context: buildContext(),
        runOpts: { simulateDelay: true },
        shouldPause: () => pausedRef.current,
        isAborted: () => !!abortRef.current?.signal.aborted,
        onStep: (step) => {
          enqueueStepUpdate((prev) => {
            const idx = prev.findIndex((s) => (step.nodeId && s.nodeId === step.nodeId) || s.agent === step.agent);
            if (idx >= 0) {
              const existing = prev[idx];
              const next = [...prev];
              const keepStatus = existing.status === 'waiting' ? 'waiting' : step.status;
              next[idx] = { ...existing, content: step.content, status: keepStatus, nodeId: step.nodeId };
              return next;
            }
            if (step.agent === 'writer' || step.nodeId === 'writer') pendingAgentRef.current = 'writer';
            return [...prev, step];
          });
        },
      });
      toast.success(`已用「${activeWorkflow?.name ?? '创作流水线'}」生成 ${newSteps.length} 个环节`);
      if (newSteps.length) {
        const text = newSteps.map((s) => s.content).join('\n');
        summarizePlot(text).then((s) => s && setPlotSummary(s)).catch(() => {});
        depositCharacterProfiles(text).catch(() => {});
        useProjectStore.getState().saveVersion(projectId, newSteps).catch(() => {});
      }
    } catch (e) {
      toast.error('生成失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      if (flushScheduledRef.current || stepUpdatesRef.current.length) {
        flushStepUpdates();
      }
      setIsStreaming(false);
      setCurrentAgent(null);
    }
  }, [projectId, activeWorkflowId, activeWorkflow?.name, buildContext, summarizePlot, depositCharacterProfiles, enqueueStepUpdate, setIsStreaming, setCurrentAgent, setSteps, abortRef, pausedRef, setPlotSummary]);

  return { stepUpdatesRef, pendingAgentRef, flushScheduledRef, flushStepUpdates, enqueueStepUpdate, handleGenerate };
}
